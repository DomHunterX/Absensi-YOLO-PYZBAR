from flask import Flask, Response, jsonify, request, send_file
from flask_cors import CORS
from pathlib import Path
import json
import sys
import os
import cv2
import time
import base64
import threading
import signal
from werkzeug.utils import secure_filename

sys.path.insert(0, str(Path(__file__).parent))
from database_manager import DatabaseManager
from attendance_engine import QRCodeGenerator, QR_DIR, SNAPSHOT_DIR, create_system
import logging

logger = logging.getLogger('VideoProcessor')

app = Flask(__name__)
CORS(app)

# Konfigurasi upload
UPLOAD_FOLDER = Path('data/uploads')
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
BUKTI_FOLDER = Path('data/bukti_izin')
BUKTI_FOLDER.mkdir(parents=True, exist_ok=True)
ALLOWED_EXTENSIONS = {'mp4'}
ALLOWED_BUKTI_EXTENSIONS = {'jpg', 'jpeg', 'png', 'pdf'}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB
MAX_BUKTI_SIZE = 10 * 1024 * 1024  # 10MB

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['BUKTI_FOLDER'] = BUKTI_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

db, yolo, processor = create_system()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def allowed_bukti_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_BUKTI_EXTENSIONS

def ok(data=None, msg='OK'):
    return jsonify({'success': True, 'message': msg, 'data': data})

def err(msg, code=400):
    return jsonify({'success': False, 'message': msg}), code

@app.route('/api/stream/<camera_id>')
def video_stream(camera_id):
    def generate():
        while True:
            frame = processor.latest_frames.get(camera_id)
            if frame is None:
                time.sleep(0.1)
                continue
                
            ret, buffer = cv2.imencode('.jpg', frame)
            if not ret: continue
            
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            time.sleep(0.05)
    
    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/')
def index():
    return send_file('dashboard.html')

@app.route('/monitor')
def monitor():
    return send_file('monitor.html')

@app.route('/api/mahasiswa', methods=['GET'])
def list_mahasiswa():
    rows = db._execute("SELECT * FROM mahasiswa WHERE is_active=1 ORDER BY name", fetch_all=True)
    return ok(rows or [])

@app.route('/api/mahasiswa', methods=['POST'])
def create_mahasiswa():
    body = request.json
    required = ['id', 'name', 'kelompok', 'jurusan']
    if not all(k in body for k in required):
        return err('Field wajib: id, name, kelompok, jurusan')

    qr_id = db.add_mahasiswa(
        body['id'], body['name'], body['kelompok'], body['jurusan'],
        body.get('email', '')
    )

    qr_b64 = QRCodeGenerator.generate(qr_id, body['name'], QR_DIR)
    return ok({'qr_code_id': qr_id, 'qr_image_base64': qr_b64}, 'Mahasiswa berhasil ditambahkan')

@app.route('/api/mahasiswa/<mhs_id>/qr', methods=['GET'])
def get_mahasiswa_qr(mhs_id):
    mhs = db._execute("SELECT * FROM mahasiswa WHERE id=%s", (mhs_id,), fetch_one=True)
    if not mhs:
        return err('Mahasiswa tidak ditemukan', 404)
    qr_b64 = QRCodeGenerator.generate(mhs['qr_code_id'], mhs['name'], QR_DIR)
    return ok({'qr_image_base64': qr_b64, 'qr_code_id': mhs['qr_code_id']})

@app.route('/api/mahasiswa/<mhs_id>', methods=['DELETE'])
def deactivate_mahasiswa(mhs_id):
    db._execute("UPDATE mahasiswa SET is_active=0 WHERE id=%s", (mhs_id,))
    return ok(msg='Mahasiswa dinonaktifkan')

@app.route('/api/attendance/today', methods=['GET'])
def today_attendance():
    data = db.get_today_attendance()
    return ok(data)

@app.route('/api/attendance/stats', methods=['GET'])
def attendance_stats():
    target = request.args.get('date')
    stats = db.get_attendance_stats(target)
    return ok(stats)

@app.route('/api/attendance/manual', methods=['POST'])
def manual_attendance():
    body = request.json
    mhs = db.get_mahasiswa_by_qr(body.get('qr_code_id', ''))
    if not mhs:
        return err('QR Code tidak valid atau mahasiswa tidak ditemukan')

    result = db.record_attendance(
        mhs['id'],
        body.get('action', 'check_in'),
        'API-MANUAL',
        '',
        1.0
    )
    return ok({'mahasiswa': mhs, 'result': result})

@app.route('/api/attendance/history', methods=['GET'])
def attendance_history():
    start = request.args.get('start', '')
    end = request.args.get('end', '')
    mhs_id = request.args.get('mahasiswa_id', '')

    query = """
        SELECT a.*, m.name, m.kelompok, m.jurusan
        FROM attendance a JOIN mahasiswa m ON a.mahasiswa_id = m.id
        WHERE 1=1
    """
    params = []
    if start:
        query += " AND a.date >= %s"
        params.append(start)
    if end:
        query += " AND a.date <= %s"
        params.append(end)
    if mhs_id:
        query += " AND a.mahasiswa_id = %s"
        params.append(mhs_id)
    query += " ORDER BY a.date DESC, a.check_in DESC LIMIT 200"

    rows = db._execute(query, tuple(params), fetch_all=True)
    return ok(rows or [])

@app.route('/api/cameras', methods=['GET'])
def list_cameras():
    rows = db._execute("SELECT * FROM camera_streams ORDER BY name", fetch_all=True)
    return ok(rows or [])

@app.route('/api/cameras', methods=['POST'])
def add_camera():
    body = request.json
    if not all(k in body for k in ['id', 'name', 'rtsp_url']):
        return err('Field wajib: id, name, rtsp_url')
    db.add_camera(body['id'], body['name'], body['rtsp_url'], body.get('location', ''))
    return ok(msg='Kamera berhasil ditambahkan')

@app.route('/api/cameras/<camera_id>', methods=['PUT'])
def update_camera(camera_id):
    body = request.json
    if not all(k in body for k in ['name', 'rtsp_url']):
        return err('Field wajib: name, rtsp_url')
    
    db._execute("""
        UPDATE camera_streams 
        SET name=?, rtsp_url=?, location=?
        WHERE id=?
    """, (body['name'], body['rtsp_url'], body.get('location', ''), camera_id))
    return ok(msg='Kamera berhasil diperbarui')

@app.route('/api/cameras/<camera_id>', methods=['DELETE'])
def delete_camera(camera_id):
    db._execute("DELETE FROM camera_streams WHERE id=?", (camera_id,))
    return ok(msg='Kamera berhasil dihapus')

@app.route('/api/dashboard', methods=['GET'])
def dashboard():
    stats = db.get_attendance_stats()
    today_list = db.get_today_attendance()

    # Query untuk trend (MySQL)
    trend_query = """
        SELECT date, COUNT(DISTINCT mahasiswa_id) as present
        FROM attendance
        WHERE date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY date ORDER BY date
    """
    dept_query = """
        SELECT m.kelompok, COUNT(DISTINCT a.mahasiswa_id) as count
        FROM attendance a JOIN mahasiswa m ON a.mahasiswa_id = m.id
        WHERE a.date = CURDATE()
        GROUP BY m.kelompok
    """

    trend = db._execute(trend_query, fetch_all=True) or []
    by_dept = db._execute(dept_query, fetch_all=True) or []

    return ok({
        'stats': stats,
        'today': today_list[:10],
        'trend': trend,
        'by_kelompok': by_dept
    })

@app.route('/api/video/preview_frames', methods=['POST'])
def preview_video_frames():
    """
    Endpoint untuk mengambil sample frames dari video dengan bounding box.
    Dipakai untuk preview sebelum user klik 'Upload & Proses'.
    Mengembalikan beberapa frame sebagai base64 JPEG.
    """
    if 'video' not in request.files:
        return err('Tidak ada file video')
    
    file = request.files['video']
    if not allowed_file(file.filename):
        return err('Format tidak didukung')
    
    try:
        # Simpan sementara
        filename = secure_filename(file.filename)
        tmp_path = app.config['UPLOAD_FOLDER'] / f"tmp_{time.strftime('%Y%m%d_%H%M%S')}_{filename}"
        file.save(str(tmp_path))
        
        cap = cv2.VideoCapture(str(tmp_path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps if fps > 0 else 0
        
        # Ambil sample frames: setiap 2 detik, max 10 frame
        sample_interval = max(1, int(fps * 2))
        sample_frames = []
        frame_number = 0
        
        while len(sample_frames) < 10:
            ret, frame = cap.read()
            if not ret:
                break
            frame_number += 1
            if frame_number % sample_interval != 0:
                continue
            
            # Decode QR langsung dengan pyzbar
            qr_results = QRCodeGenerator.decode_frame(frame)
            
            # Coba YOLO untuk bounding box
            try:
                qr_papers = yolo.detect_qr_papers(frame)
            except Exception:
                qr_papers = []
            
            # Draw bounding box seperti di draw_detections engine
            display = yolo.draw_detections(frame, qr_papers, qr_results)
            
            # Tambahkan label nama mahasiswa di atas polygon pyzbar
            for qr in qr_results:
                mahasiswa = db.get_mahasiswa_by_qr(qr['data'])
                if mahasiswa:
                    pts = qr['polygon']
                    center = pts.mean(axis=0).astype(int)
                    name = mahasiswa['name']
                    tw, th = cv2.getTextSize(name, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
                    cv2.rectangle(display,
                        (center[0] - tw//2 - 5, center[1] - th - 30),
                        (center[0] + tw//2 + 5, center[1] - 10),
                        (0, 200, 100), -1)
                    cv2.putText(display, name,
                        (center[0] - tw//2, center[1] - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
            
            # Encode ke JPEG base64
            _, buf = cv2.imencode('.jpg', display, [cv2.IMWRITE_JPEG_QUALITY, 75])
            b64 = base64.b64encode(buf).decode('utf-8')
            
            sample_frames.append({
                'frame_number': frame_number,
                'timestamp': round(frame_number / fps, 2),
                'image': b64,
                'qr_detected': len(qr_results),
                'yolo_detected': len(qr_papers)
            })
        
        cap.release()
        os.remove(str(tmp_path))
        
        return ok({
            'total_frames': total_frames,
            'duration': round(duration, 2),
            'fps': round(fps, 1),
            'sample_frames': sample_frames
        })
    
    except Exception as e:
        logger.error(f"[PREVIEW] Error: {e}")
        return err(f'Gagal preview: {str(e)}', 500)

@app.route('/api/video/process', methods=['POST'])
def process_video():
    """
    Endpoint untuk upload dan proses video MP4.
    Mendeteksi QR Code menggunakan YOLO dan pyzbar.
    """
    if 'video' not in request.files:
        return err('Tidak ada file video yang diunggah')
    
    file = request.files['video']
    action = request.form.get('action', 'check_in')  # Default check_in
    
    if file.filename == '':
        return err('Nama file kosong')
    
    if not allowed_file(file.filename):
        return err('Format file tidak didukung. Hanya MP4 yang diperbolehkan')
    
    if action not in ['check_in', 'check_out']:
        return err('Action tidak valid. Harus check_in atau check_out')
    
    try:
        # Simpan file
        filename = secure_filename(file.filename)
        timestamp = time.strftime('%Y%m%d_%H%M%S')
        filename = f"{timestamp}_{filename}"
        filepath = app.config['UPLOAD_FOLDER'] / filename
        file.save(str(filepath))
        
        # Proses video dengan action
        results = process_video_file(str(filepath), action)
        
        # Hapus file setelah diproses (opsional)
        # os.remove(str(filepath))
        
        action_label = 'Check-in' if action == 'check_in' else 'Check-out'
        return ok(results, f'Video berhasil diproses untuk {action_label}')
        
    except Exception as e:
        return err(f'Gagal memproses video: {str(e)}', 500)

def process_video_file(video_path: str, action: str = 'check_in') -> dict:
    """
    Memproses file video untuk mendeteksi QR Code.
    Logic: Langsung decode QR dengan pyzbar di setiap frame,
    YOLO dipakai untuk draw bounding box jika terdeteksi.
    """
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        raise ValueError('Tidak dapat membuka file video')
    
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0
    
    detections = []
    frame_number = 0
    recorded_mahasiswa = set()
    
    # Proses 5 frame per detik untuk performa
    skip_frames = max(1, int(fps / 5))
    
    action_label = 'Check-in' if action == 'check_in' else 'Check-out'
    logger.info(f"[VIDEO] Mulai proses: {Path(video_path).name} | {action_label} | {total_frames} frames @ {fps:.1f}fps")
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        frame_number += 1
        if frame_number % skip_frames != 0:
            continue
        
        # Langsung decode QR dari frame (sama seperti engine saat QR paper terdeteksi)
        qr_results = QRCodeGenerator.decode_frame(frame)
        
        if not qr_results:
            continue
        
        # Juga coba deteksi YOLO untuk confidence info (opsional, tidak blocking)
        try:
            qr_papers = yolo.detect_qr_papers(frame)
            max_conf = max(p['confidence'] for p in qr_papers) if qr_papers else 1.0
        except Exception:
            max_conf = 1.0
        
        for qr in qr_results:
            qr_data = qr['data']
            
            mahasiswa = db.get_mahasiswa_by_qr(qr_data)
            if not mahasiswa:
                logger.warning(f"[VIDEO] QR tidak dikenal: {qr_data}")
                continue
            
            mahasiswa_id = mahasiswa['id']
            timestamp = frame_number / fps
            already_recorded = mahasiswa_id in recorded_mahasiswa
            
            attendance_result = None
            status_message = None
            
            if not already_recorded:
                snapshot_path = save_video_frame(frame, mahasiswa_id, frame_number, video_path)
                attendance_result = db.record_attendance(
                    mahasiswa_id,
                    action,
                    'VIDEO-UPLOAD',
                    snapshot_path,
                    max_conf
                )
                
                # Check if already checked in/out today
                if attendance_result['status'] == 'already_checked_in':
                    status_message = f"Sudah check-in hari ini"
                    logger.info(f"[VIDEO] ⚠ {mahasiswa['name']} — Sudah check-in sebelumnya")
                elif attendance_result['status'] == 'already_checked_out':
                    status_message = f"Sudah check-out hari ini"
                    logger.info(f"[VIDEO] ⚠ {mahasiswa['name']} — Sudah check-out sebelumnya")
                elif attendance_result['status'] == 'not_checked_in':
                    status_message = f"Belum check-in, tidak bisa check-out"
                    logger.info(f"[VIDEO] ⚠ {mahasiswa['name']} — Belum check-in")
                else:
                    recorded_mahasiswa.add(mahasiswa_id)
                    logger.info(f"[VIDEO] ✓ {mahasiswa['name']} — {action_label} | frame #{frame_number} | conf {max_conf:.2%}")
            
            detections.append({
                'frame_number': frame_number,
                'timestamp': timestamp,
                'qr_code': qr_data,
                'mahasiswa_name': mahasiswa['name'],
                'mahasiswa_id': mahasiswa_id,
                'kelompok': mahasiswa['kelompok'],
                'confidence': max_conf,
                'recorded': not already_recorded and attendance_result and attendance_result['status'] in ['checked_in', 'checked_out'],
                'attendance_result': attendance_result,
                'status_message': status_message
            })
    
    cap.release()
    
    recorded_count = len(recorded_mahasiswa)
    
    # Hitung mahasiswa yang sudah check-in/out sebelumnya (unique only)
    already_processed = [d for d in detections if d.get('status_message')]
    skipped_count = len(set(d['mahasiswa_id'] for d in already_processed))
    
    # Buat list unique mahasiswa yang dilewati (tidak duplikat)
    skipped_unique = {}
    for d in already_processed:
        if d['mahasiswa_id'] not in skipped_unique:
            skipped_unique[d['mahasiswa_id']] = {
                'name': d['mahasiswa_name'],
                'reason': d['status_message']
            }
    
    logger.info(f"[VIDEO] Selesai: {recorded_count} {action_label} tercatat dari {len(detections)} deteksi")
    if skipped_count > 0:
        logger.info(f"[VIDEO] {skipped_count} mahasiswa dilewati (sudah {action_label} hari ini)")
    
    return {
        'filename': Path(video_path).name,
        'duration': duration,
        'fps': fps,
        'total_frames': total_frames,
        'processed_frames': frame_number,
        'detections': detections,
        'unique_qr_codes': len(set(d['qr_code'] for d in detections)),
        'recorded_count': recorded_count,
        'unique_mahasiswa': recorded_count,
        'skipped_count': skipped_count,
        'skipped_mahasiswa': list(skipped_unique.values()),  # Unique list only
        'action': action
    }

def save_video_frame(frame, mahasiswa_id: str, frame_number: int, video_path: str) -> str:
    """
    Simpan frame dari video sebagai snapshot.
    """
    timestamp = time.strftime('%Y%m%d_%H%M%S')
    video_name = Path(video_path).stem
    filename = SNAPSHOT_DIR / f"{mahasiswa_id}_VIDEO_{video_name}_frame{frame_number}_{timestamp}.jpg"
    cv2.imwrite(str(filename), frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return str(filename)


# ===== IZIN/SAKIT ENDPOINTS =====

@app.route('/api/izin/submit', methods=['POST'])
def submit_izin():
    """
    Endpoint untuk mahasiswa submit pengajuan izin/sakit.
    Form data: mahasiswa_id, type (izin/sakit), date, keterangan, bukti (file)
    """
    try:
        mahasiswa_id = request.form.get('mahasiswa_id')
        submission_type = request.form.get('type')  # 'izin' or 'sakit'
        date_str = request.form.get('date')
        keterangan = request.form.get('keterangan')
        
        # Validasi input
        if not all([mahasiswa_id, submission_type, date_str, keterangan]):
            return err('Semua field wajib diisi (mahasiswa_id, type, date, keterangan)')
        
        if submission_type not in ['izin', 'sakit']:
            return err('Type harus "izin" atau "sakit"')
        
        # Validasi mahasiswa exists
        mahasiswa = db._execute(
            "SELECT * FROM mahasiswa WHERE id = %s",
            (mahasiswa_id,),
            fetch_one=True
        )
        if not mahasiswa:
            return err('Mahasiswa tidak ditemukan')
        
        # Handle file upload (optional)
        bukti_path = None
        if 'bukti' in request.files:
            file = request.files['bukti']
            if file and file.filename != '':
                if not allowed_bukti_file(file.filename):
                    return err('Format file tidak didukung. Hanya JPG, PNG, PDF yang diperbolehkan')
                
                # Check file size
                file.seek(0, os.SEEK_END)
                file_size = file.tell()
                file.seek(0)
                
                if file_size > MAX_BUKTI_SIZE:
                    return err('Ukuran file terlalu besar. Maksimal 10MB')
                
                # Save file
                filename = secure_filename(file.filename)
                timestamp = time.strftime('%Y%m%d_%H%M%S')
                filename = f"{timestamp}_{mahasiswa_id}_{filename}"
                filepath = app.config['BUKTI_FOLDER'] / filename
                file.save(str(filepath))
                bukti_path = str(filepath)
        
        # Submit to database
        submission_id = db.submit_izin(
            mahasiswa_id,
            submission_type,
            date_str,
            keterangan,
            bukti_path
        )
        
        return ok({
            'submission_id': submission_id,
            'mahasiswa_name': mahasiswa['name'],
            'type': submission_type,
            'date': date_str,
            'status': 'pending'
        }, f'Pengajuan {submission_type} berhasil dikirim')
        
    except Exception as e:
        logger.error(f"Error submit izin: {e}")
        return err(f'Gagal submit pengajuan: {str(e)}', 500)


@app.route('/api/izin/list', methods=['GET'])
def list_izin():
    """
    Endpoint untuk Timdis melihat daftar pengajuan.
    Query params: status (optional) = 'pending', 'approved', 'rejected'
    """
    try:
        status = request.args.get('status')
        submissions = db.get_all_izin_submissions(status)
        
        # Convert date objects to string
        for sub in submissions:
            if hasattr(sub.get('date'), 'isoformat'):
                sub['date'] = sub['date'].isoformat()
            if hasattr(sub.get('created_at'), 'isoformat'):
                sub['created_at'] = sub['created_at'].isoformat()
            if hasattr(sub.get('verified_at'), 'isoformat') and sub.get('verified_at'):
                sub['verified_at'] = sub['verified_at'].isoformat()
        
        stats = db.get_izin_stats()
        
        return ok({
            'submissions': submissions,
            'stats': stats
        })
        
    except Exception as e:
        logger.error(f"Error list izin: {e}")
        return err(f'Gagal mengambil data: {str(e)}', 500)


@app.route('/api/izin/verify', methods=['POST'])
def verify_izin():
    """
    Endpoint untuk Timdis verifikasi pengajuan (approve/reject).
    JSON body: submission_id, action ('approve'/'reject'), verified_by, rejection_reason (optional)
    """
    try:
        data = request.get_json()
        submission_id = data.get('submission_id')
        action = data.get('action')
        verified_by = data.get('verified_by')
        rejection_reason = data.get('rejection_reason', '')
        
        if not all([submission_id, action, verified_by]):
            return err('Field submission_id, action, dan verified_by wajib diisi')
        
        if action not in ['approve', 'reject']:
            return err('Action harus "approve" atau "reject"')
        
        if action == 'reject' and not rejection_reason:
            return err('Alasan penolakan wajib diisi untuk action reject')
        
        result = db.verify_izin(submission_id, action, verified_by, rejection_reason)
        
        if result['status'] == 'error':
            return err(result['message'])
        
        return ok(result, result['message'])
        
    except Exception as e:
        logger.error(f"Error verify izin: {e}")
        return err(f'Gagal verifikasi: {str(e)}', 500)


@app.route('/api/izin/mahasiswa/<mahasiswa_id>', methods=['GET'])
def get_izin_by_mahasiswa(mahasiswa_id):
    """
    Endpoint untuk mahasiswa melihat riwayat pengajuan mereka sendiri.
    """
    try:
        submissions = db.get_izin_by_mahasiswa(mahasiswa_id)
        
        for sub in submissions:
            if hasattr(sub.get('date'), 'isoformat'):
                sub['date'] = sub['date'].isoformat()
            if hasattr(sub.get('created_at'), 'isoformat'):
                sub['created_at'] = sub['created_at'].isoformat()
            if hasattr(sub.get('verified_at'), 'isoformat') and sub.get('verified_at'):
                sub['verified_at'] = sub['verified_at'].isoformat()
        
        return ok({'submissions': submissions})
        
    except Exception as e:
        logger.error(f"Error get izin by mahasiswa: {e}")
        return err(f'Gagal mengambil data: {str(e)}', 500)


@app.route('/api/izin/bukti/<path:filename>', methods=['GET'])
def get_bukti_file(filename):
    """
    Endpoint untuk download/view file bukti.
    """
    try:
        filepath = app.config['BUKTI_FOLDER'] / filename
        if not filepath.exists():
            return err('File tidak ditemukan', 404)
        return send_file(str(filepath))
        
    except Exception as e:
        logger.error(f"Error get bukti file: {e}")
        return err(f'Gagal mengambil file: {str(e)}', 500)


if __name__ == '__main__':
    # Sample data mahasiswa
    db.add_mahasiswa('MHS001', 'Budi Santoso', 'A', 'Teknik Informatika', 'budi@student.ac.id')
    db.add_mahasiswa('MHS002', 'Siti Rahayu', 'B', 'Sistem Informasi', 'siti@student.ac.id')
    db.add_mahasiswa('MHS003', 'Ahmad Fauzi', 'A', 'Teknik Komputer', 'ahmad@student.ac.id')
    db.add_mahasiswa('MHS004', 'Dewi Lestari', 'C', 'Teknik Informatika', 'dewi@student.ac.id')
    db.add_mahasiswa('MHS005', 'Reza Pratama', 'B', 'Sistem Informasi', 'reza@student.ac.id')
    db.add_mahasiswa('EMP005', 'Reza Pratama', 'Operasional', 'Koordinator', 'reza@gmail.com')

    cameras = db._execute("SELECT * FROM camera_streams WHERE is_active=1", fetch_all=True) or []
    for cam in cameras:
        processor.add_camera(cam['id'], cam['rtsp_url'], cam['name'], cam['location'])
            
    processor.start_all() 

    def pemusnah_mutlak(sig, frame):
        print("\n[INFO] Sinyal CTRL+C OS")
        try:
            processor.stop_all() 
        except: 
            pass
        os._exit(0)

    signal.signal(signal.SIGINT, pemusnah_mutlak)
    app.run(debug=True, port=5000, host='0.0.0.0', use_reloader=False)