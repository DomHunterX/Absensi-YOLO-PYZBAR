import cv2
import numpy as np
import json
import time
import threading
import logging
import qrcode
import base64
from datetime import datetime, date
from pathlib import Path
from pyzbar.pyzbar import decode as qr_decode
from ultralytics import YOLO
from PIL import Image
import io
import os
from database_manager import DatabaseManager

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.FileHandler('logs/attendance.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('AttendanceEngine')

SNAPSHOT_DIR = Path('data/snapshots')
QR_DIR = Path('data/qrcodes')
MODEL_PATH = Path('models/qr_paper_model.pt')

SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
QR_DIR.mkdir(parents=True, exist_ok=True)
Path('data').mkdir(parents=True, exist_ok=True)
Path('logs').mkdir(exist_ok=True)

YOLO_CONF_THRESHOLD = 0.3
QR_COOLDOWN = 30
FRAME_WIDTH = 1080
FRAME_HEIGHT = 720
FRAME_FPS = 30  # Target FPS untuk kamera CCTV

class QRCodeGenerator:
    @staticmethod
    def generate(qr_data: str, mahasiswa_name: str, save_path: Path) -> str:
        qr = qrcode.QRCode(
            version=2,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=12,
            border=4
        )
        qr.add_data(qr_data)
        qr.make(fit=True)

        img = qr.make_image(fill_color="#1a1a2e", back_color="white")

        from PIL import ImageDraw, ImageFont
        draw = ImageDraw.Draw(img)
        w, h = img.size
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18)
        except:
            font = ImageFont.load_default()

        text = mahasiswa_name.upper()
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        draw.text(((w - text_w) // 2, h - 30), text, fill="#1a1a2e", font=font)

        filename = save_path / f"{qr_data}.png"
        img.save(filename)

        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        return base64.b64encode(buffer.getvalue()).decode('utf-8')

    @staticmethod
    def decode_frame(frame: np.ndarray) -> list:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        decoded = qr_decode(gray)
        results = []
        for obj in decoded:
            data = obj.data.decode('utf-8')
            pts = obj.polygon
            if len(pts) == 4:
                pts_arr = np.array([[p.x, p.y] for p in pts], dtype=np.int32)
                results.append({'data': data, 'polygon': pts_arr})
        return results

class RTSPCameraStream:
    def __init__(self, camera_id: str, rtsp_url: str, name: str = ''):
        self.camera_id = camera_id
        self.rtsp_url = rtsp_url
        self.name = name or camera_id
        self.cap = None
        self.frame = None
        self.running = False
        self.lock = threading.Lock()
        self.fps = 0
        self.connected = False
        self._thread = None
        self._reconnect_delay = 5
        self._frame_count = 0
        self._last_fps_time = time.time()

    def _connect(self):
        if self.cap:
            self.cap.release()

        self.cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
        self.cap.set(cv2.CAP_PROP_FPS, FRAME_FPS)  # Set target FPS

        if self.cap.isOpened():
            self.connected = True
            actual_fps = self.cap.get(cv2.CAP_PROP_FPS)
            logger.info(f"[{self.camera_id}] Terhubung ke RTSP: {self.rtsp_url} (Target FPS: {FRAME_FPS}, Actual: {actual_fps:.1f})")
            return True
        else:
            self.connected = False
            logger.error(f"[{self.camera_id}] Gagal terhubung ke: {self.rtsp_url}")
            return False

    def _read_loop(self):
        while self.running:
            if not self.connected:
                if not self._connect():
                    time.sleep(self._reconnect_delay)
                    continue

            ret, frame = self.cap.read()
            if not ret:
                logger.warning(f"[{self.camera_id}] Frame hilang, mencoba reconnect...")
                self.connected = False
                time.sleep(1)
                continue

            with self.lock:
                self.frame = frame

            self._frame_count += 1
            elapsed = time.time() - self._last_fps_time
            if elapsed >= 1.0:
                self.fps = self._frame_count / elapsed
                self._frame_count = 0
                self._last_fps_time = time.time()

    def start(self):
        self.running = True
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()
        logger.info(f"[{self.camera_id}] Stream dimulai.")

    def stop(self):
        self.running = False
        if self.cap:
            self.cap.release()
        logger.info(f"[{self.camera_id}] Stream dihentikan.")

    def get_frame(self) -> tuple[bool, np.ndarray | None]:
        with self.lock:
            if self.frame is None:
                return False, None
            return True, self.frame.copy()

    def save_snapshot(self, mahasiswa_id: str) -> str:
        ret, frame = self.get_frame()
        if not ret:
            return ''
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = SNAPSHOT_DIR / f"{mahasiswa_id}_{self.camera_id}_{ts}.jpg"
        cv2.imwrite(str(filename), frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return str(filename)

class YOLOProcessor:
    def __init__(self, model_path: Path):
        logger.info("Memuat model YOLO...")
        self.model = YOLO(str(model_path))
        # Class ID untuk QR code paper (akan dilatih custom)
        # Setelah training, ganti dengan class ID yang sesuai
        self.qr_paper_class_id = 0  # Default class 0, sesuaikan setelah training
        logger.info(f"Model YOLO siap. Target class: QR Paper (ID: {self.qr_paper_class_id})")

    def detect_qr_papers(self, frame: np.ndarray) -> list[dict]:
        """
        Deteksi QR code paper menggunakan YOLO custom model.
        Setelah melatih model, fungsi ini akan mendeteksi kertas QR code.
        """
        results = self.model(frame, conf=YOLO_CONF_THRESHOLD, classes=[self.qr_paper_class_id], verbose=False)
        qr_papers = []
        for r in results:
            for box in r.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                conf = float(box.conf[0])
                area = (x2 - x1) * (y2 - y1)
                qr_papers.append({
                    'bbox': (x1, y1, x2, y2),
                    'confidence': conf,
                    'area': area
                })
        return qr_papers

    def draw_detections(self, frame: np.ndarray, qr_papers: list, qr_decoded: list) -> np.ndarray:
        """
        Menggambar bounding box untuk QR paper yang terdeteksi dan QR yang berhasil di-decode.
        """
        display = frame.copy()
        H, W = display.shape[:2]

        # Header bar
        cv2.rectangle(display, (0, 0), (W, 45), (45, 90, 180), -1)
        cv2.putText(display, f"SISTEM ABSENSI QR CODE  |  {datetime.now().strftime('%Y-%m-%d  %H:%M:%S')}",
                    (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        # Draw YOLO detected QR papers
        for qr in qr_papers:
            x1, y1, x2, y2 = qr['bbox']
            conf = qr['confidence']
            # Warna berdasarkan confidence
            color = (0, 220, 80) if conf > 0.7 else (60, 200, 255)
            cv2.rectangle(display, (x1, y1), (x2, y2), color, 3)
            
            label = f"QR Paper {conf:.0%}"
            lw, lh = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
            cv2.rectangle(display, (x1, y1 - lh - 10), (x1 + lw + 8, y1), color, -1)
            cv2.putText(display, label, (x1 + 4, y1 - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)

        # Draw decoded QR codes (pyzbar)
        for qr in qr_decoded:
            pts = qr['polygon']
            cv2.polylines(display, [pts], True, (0, 255, 255), 3)
            center = pts.mean(axis=0).astype(int)
            
            # Tampilkan status "QR VALID" dengan background
            text = "QR VALID"
            tw, th = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
            cv2.rectangle(display, (center[0] - tw//2 - 5, center[1] - th - 5), 
                         (center[0] + tw//2 + 5, center[1] + 5), (0, 255, 255), -1)
            cv2.putText(display, text, (center[0] - tw//2, center[1]),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)

        return display

class AttendanceProcessor:
    def __init__(self, db: DatabaseManager, yolo: YOLOProcessor):
        self.db = db
        self.yolo = yolo
        self.cameras: dict[str, RTSPCameraStream] = {}
        self._qr_cooldowns: dict[str, float] = {}
        self._processing = False
        self._lock = threading.Lock()
        self.latest_frames = {}

    def add_camera(self, camera_id: str, rtsp_url: str, name: str = '', location: str = ''):
        stream = RTSPCameraStream(camera_id, rtsp_url, name)
        stream.start()
        self.cameras[camera_id] = stream
        self.db.add_camera(camera_id, name or camera_id, rtsp_url, location)
        logger.info(f"Kamera '{name}' ({camera_id}) ditambahkan.")

    def _is_qr_cooldown(self, qr_data: str) -> bool:
        last_scan = self._qr_cooldowns.get(qr_data, 0)
        return (time.time() - last_scan) < QR_COOLDOWN

    def _set_qr_cooldown(self, qr_data: str):
        self._qr_cooldowns[qr_data] = time.time()

    # Jeda minimum antara check-in dan check-out (dalam detik): 1 jam = 3600
    CHECK_OUT_MIN_SECONDS = 3600

    def _determine_action(self, mahasiswa_id: str) -> str:
        today = date.today().isoformat()
        row = self.db._execute(
            "SELECT check_in, check_out FROM attendance WHERE mahasiswa_id=%s AND date=%s",
            (mahasiswa_id, today),
            fetch_one=True
        )
        if not row or not row['check_in']:
            return 'check_in'
        if row['check_in'] and not row['check_out']:
            # Hitung selisih waktu sejak check_in
            check_in_time = datetime.fromisoformat(str(row['check_in']))
            elapsed_seconds = (datetime.now() - check_in_time).total_seconds()
            if elapsed_seconds < self.CHECK_OUT_MIN_SECONDS:
                remaining = int(self.CHECK_OUT_MIN_SECONDS - elapsed_seconds)
                logger.info(
                    f"[{mahasiswa_id}] Cooldown check-out: sisa {remaining // 60} menit {remaining % 60} detik."
                )
                return 'cooldown'
            return 'check_out'
        return 'none'

    def process_frame(self, camera_id: str, frame: np.ndarray) -> dict:
        """
        Proses frame untuk deteksi QR code paper dan decode QR.
        Logika baru: Deteksi QR paper dengan YOLO, lalu decode QR code di area tersebut.
        """
        result = {
            'camera_id': camera_id,
            'timestamp': datetime.now().isoformat(),
            'qr_papers_detected': 0,
            'qr_scanned': None,
            'attendance': None
        }

        # Deteksi QR paper menggunakan YOLO
        qr_papers = self.yolo.detect_qr_papers(frame)
        result['qr_papers_detected'] = len(qr_papers)

        qr_decoded = []
        
        # Jika ada QR paper terdeteksi, coba decode QR code
        if qr_papers:
            # Decode QR code dari seluruh frame
            qr_results = QRCodeGenerator.decode_frame(frame)
            qr_decoded = qr_results
            
            for qr in qr_results:
                qr_data = qr['data']
                
                # Cek cooldown
                if self._is_qr_cooldown(qr_data):
                    continue

                # Cari mahasiswa berdasarkan QR code
                mahasiswa = self.db.get_mahasiswa_by_qr(qr_data)
                if not mahasiswa:
                    logger.warning(f"QR tidak dikenal: {qr_data}")
                    continue

                # Tentukan action (check_in atau check_out)
                action = self._determine_action(mahasiswa['id'])
                if action == 'none':
                    logger.info(f"[{mahasiswa['name']}] Sudah selesai absen hari ini.")
                    self._set_qr_cooldown(qr_data)  # tetap set cooldown 30 detik
                    continue
                if action == 'cooldown':
                    logger.info(f"[{mahasiswa['name']}] Ditolak: masih dalam jeda 1 jam sejak check-in.")
                    self._set_qr_cooldown(qr_data)  # blokir spam scan selama 30 detik
                    continue

                # Ambil confidence tertinggi dari QR paper yang terdeteksi
                max_conf = max(p['confidence'] for p in qr_papers) if qr_papers else 0.0
                
                # Simpan snapshot
                snapshot = self.cameras[camera_id].save_snapshot(mahasiswa['id'])

                # Record attendance
                att_result = self.db.record_attendance(
                    mahasiswa['id'], action, camera_id, snapshot, max_conf
                )

                # Set cooldown
                self._set_qr_cooldown(qr_data)
                self.db.update_camera_seen(camera_id)

                result['qr_scanned'] = qr_data
                result['attendance'] = {
                    'mahasiswa': mahasiswa,
                    'action': action,
                    'result': att_result,
                    'confidence': max_conf
                }

                log_msg = f"[{camera_id}] {mahasiswa['name']} — {action.upper()} | QR Conf: {max_conf:.2%}"
                logger.info(log_msg)
                break  # Proses satu QR per frame

        # Draw detections pada frame
        display_frame = self.yolo.draw_detections(frame, qr_papers, qr_decoded)
        with self._lock:
            self.latest_frames[camera_id] = display_frame

        return result

    def run_continuous(self, camera_id: str, callback=None):
        cam = self.cameras.get(camera_id)
        if not cam:
            raise ValueError(f"Kamera {camera_id} tidak ditemukan.")

        logger.info(f"[{camera_id}] Memulai continuous processing...")
        # Hitung frame interval berdasarkan target FPS
        # Untuk 30 FPS = 1/30 = 0.033 detik per frame
        frame_interval = 1.0 / FRAME_FPS

        while True:
            ret, frame = cam.get_frame()
            if not ret:
                time.sleep(0.5)
                continue

            result = self.process_frame(camera_id, frame)

            if result.get('attendance') and callback:
                callback(result)

            time.sleep(frame_interval)

    def start_all(self, callback=None):
        for cam_id in self.cameras:
            t = threading.Thread(
                target=self.run_continuous,
                args=(cam_id, callback),
                daemon=True,
                name=f"processor-{cam_id}"
            )
            t.start()
            logger.info(f"[{cam_id}] Processing thread dimulai.")

    def stop_all(self):
        for cam in self.cameras.values():
            cam.stop()

def create_system() -> tuple[DatabaseManager, YOLOProcessor, AttendanceProcessor]:
    db = DatabaseManager()
    yolo = YOLOProcessor(MODEL_PATH)
    processor = AttendanceProcessor(db, yolo)
    return db, yolo, processor

if __name__ == '__main__':
    print("="*60)
    print("  SISTEM ABSENSI QR CODE PAPER + YOLO + RTSP CCTV")
    print("  Mode: Deteksi QR Code Paper (Custom YOLO Model)")
    print("="*60)
    print("\n⚠️  CATATAN PENTING:")
    print("  - Model YOLO default (yolov8n.pt) belum dilatih untuk QR paper")
    print("  - Silakan latih model custom dengan dataset QR code paper")
    print("  - Setelah training, ganti model di models/yolov8n.pt")
    print("  - Update qr_paper_class_id di YOLOProcessor sesuai hasil training")
    print("="*60 + "\n")

    db, yolo, processor = create_system()

    qr_id = db.add_mahasiswa('MHS001', 'Budi Santoso', 'A', 'Teknik Informatika')
    db.add_mahasiswa('MHS002', 'Siti Rahayu', 'B', 'Sistem Informasi')


# RTSP CCTV
    processor.add_camera(
        camera_id='CAM-01',
        rtsp_url='rtsp://admin:admin123456@192.168.1.86:8554/profile0',
        name='Pintu Utama',
        location='Lobby Lantai 1'
    )

    def on_attendance(result):
        att = result['attendance']
        mhs = att['mahasiswa']
        action = "MASUK" if att['action'] == 'check_in' else "KELUAR"
        print(f"\n✅ ABSEN {action}: {mhs['name']} ({mhs['kelompok']}) "
              f"— QR Conf: {att['confidence']:.1%} @ {result['camera_id']}")

    processor.start_all(callback=on_attendance)
    print("\nSistem berjalan. Tekan Ctrl+C untuk berhenti.\n")

    try:
        while True:
            stats = db.get_attendance_stats()
            print(f"\r📊 Hari ini: Hadir={stats['present']} | "
                  f"Absen={stats['absent']} | Masih di dalam={stats['still_in']}", end='')
            time.sleep(10)
    except KeyboardInterrupt:
        print("\n\nMenghentikan sistem...")
        processor.stop_all()