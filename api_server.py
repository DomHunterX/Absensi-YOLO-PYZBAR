from flask import Flask, Response, jsonify, request, send_file
from flask_cors import CORS
from pathlib import Path
import json
import sys
import os
import cv2
import time
import threading
import signal

sys.path.insert(0, str(Path(__file__).parent))
from database_manager import DatabaseManager
from attendance_engine import QRCodeGenerator, QR_DIR, create_system

app = Flask(__name__)
CORS(app)

db, yolo, processor = create_system()

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