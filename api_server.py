"""
SIABSEN API Server
REST API untuk sistem absensi dengan QR Code detection
"""

import sys
import os

# Fix Windows console encoding untuk Unicode characters
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

from flask import Flask, Response, jsonify, request, send_file, redirect
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
from functools import wraps

sys.path.insert(0, str(Path(__file__).parent))
from database_manager import DatabaseManager
from attendance_engine import QRCodeGenerator, QR_DIR, SNAPSHOT_DIR, create_system
from auth_manager import AuthManager
import logging

logger = logging.getLogger('VideoProcessor')

app = Flask(__name__)
CORS(app, supports_credentials=True)

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

# Initialize Authentication Manager
auth = AuthManager(db)

# ═══════════════════════════════════════════════════════════════
# Authentication Middleware & Decorators
# ═══════════════════════════════════════════════════════════════

def get_session_token():
    """Extract session token from request headers or cookies"""
    # Try Authorization header first
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        return auth_header.split(' ')[1]
    
    # Try cookie
    cookie_token = request.cookies.get('session_token')
    if cookie_token:
        return cookie_token
    
    # Try query parameter (for debugging only)
    query_token = request.args.get('token')
    if query_token:
        return query_token
    
    return None

def require_auth(roles=None):
    """
    Decorator untuk protect endpoints dengan authentication
    roles: list of allowed roles, e.g. ['admin', 'timdis']
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            token = get_session_token()
            
            if not token:
                return err('Authentication required', 401)
            
            # Validate session
            validation = auth.validate_session(token)
            
            if not validation['valid']:
                return err('Invalid or expired session', 401)
            
            user = validation['user']
            
            # Check role if specified
            if roles and user['role'] not in roles:
                return err('Access denied', 403)
            
            # Attach user to request context
            request.current_user = user
            
            return f(*args, **kwargs)
        
        return decorated_function
    return decorator

def optional_auth(f):
    """Decorator untuk endpoints yang bisa diakses dengan atau tanpa auth"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = get_session_token()
        
        if token:
            validation = auth.validate_session(token)
            if validation['valid']:
                request.current_user = validation['user']
            else:
                request.current_user = None
        else:
            request.current_user = None
        
        return f(*args, **kwargs)
    
    return decorated_function

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def allowed_bukti_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_BUKTI_EXTENSIONS

def ok(data=None, msg='OK'):
    return jsonify({'success': True, 'message': msg, 'data': data})

def err(msg, code=400):
    return jsonify({'success': False, 'message': msg}), code

# ═══════════════════════════════════════════════════════════════
# Authentication Endpoints
# ═══════════════════════════════════════════════════════════════

@app.route('/login')
def login_page():
    """Serve login page"""
    return send_file('login.html')

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Login endpoint"""
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return err('Username dan password wajib diisi')
        
        # Get client IP
        ip_address = request.remote_addr
        
        # Authenticate
        result = auth.authenticate(username, password, ip_address)
        
        if result['success']:
            # Create response with user data and token
            response_data = {
                'user': result['user'],
                'session_token': result['session_token']
            }
            
            response = jsonify({
                'success': True,
                'message': result['message'],
                'data': response_data
            })
            
            # Set secure cookie
            response.set_cookie(
                'session_token',
                result['session_token'],
                max_age=24*60*60,  # 24 hours
                httponly=True,
                samesite='Lax',
                path='/'
            )
            
            return response
        else:
            return err(result['message'], 401)
            
    except Exception as e:
        logger.error(f"Login error: {e}")
        return err(f'Login gagal: {str(e)}', 500)

@app.route('/api/auth/logout', methods=['POST'])
@require_auth()
def logout():
    """Logout endpoint"""
    try:
        token = get_session_token()
        auth.logout(token)
        
        response = ok(msg='Logout berhasil')
        response.set_cookie('session_token', '', expires=0)
        
        return response
        
    except Exception as e:
        logger.error(f"Logout error: {e}")
        return err(f'Logout gagal: {str(e)}', 500)

@app.route('/api/auth/validate', methods=['GET'])
def validate_session():
    """Validate session token"""
    try:
        token = get_session_token()
        
        if not token:
            return err('No session token', 401)
        
        validation = auth.validate_session(token)
        
        if validation['valid']:
            return ok({'user': validation['user']}, 'Session valid')
        else:
            return err('Invalid session', 401)
            
    except Exception as e:
        logger.error(f"Validation error: {e}")
        return err(f'Validation gagal: {str(e)}', 500)

@app.route('/api/auth/me', methods=['GET'])
@require_auth()
def get_current_user():
    """Get current logged in user info with mahasiswa data if role is mahasiswa"""
    user = request.current_user
    
    # If user is mahasiswa, include mahasiswa data
    if user['role'] == 'mahasiswa' and user.get('mahasiswa_id'):
        mahasiswa = db._execute("""
            SELECT * FROM mahasiswa WHERE id = %s AND is_active = 1
        """, (user['mahasiswa_id'],), fetch_one=True)
        
        if mahasiswa:
            user['mahasiswa'] = mahasiswa
    
    return ok(user)

@app.route('/api/auth/change-password', methods=['POST'])
@require_auth()
def change_password():
    """Change password for current user"""
    try:
        data = request.get_json()
        old_password = data.get('old_password')
        new_password = data.get('new_password')
        
        if not old_password or not new_password:
            return err('Password lama dan baru wajib diisi')
        
        if len(new_password) < 6:
            return err('Password baru minimal 6 karakter')
        
        user_id = request.current_user['user_id']
        result = auth.change_password(user_id, old_password, new_password)
        
        if result['success']:
            return ok(msg=result['message'])
        else:
            return err(result['message'])
            
    except Exception as e:
        logger.error(f"Change password error: {e}")
        return err(f'Gagal mengubah password: {str(e)}', 500)

# ═══════════════════════════════════════════════════════════════
# User Management Endpoints (Admin only)
# ═══════════════════════════════════════════════════════════════

@app.route('/api/users', methods=['GET'])
@require_auth(roles=['admin'])
def list_users():
    """List all users (admin only)"""
    try:
        role = request.args.get('role')
        users = auth.get_all_users(role)
        return ok(users)
    except Exception as e:
        logger.error(f"List users error: {e}")
        return err(f'Gagal memuat users: {str(e)}', 500)

@app.route('/api/users', methods=['POST'])
@require_auth(roles=['admin'])
def create_user():
    """Create new user (admin only)"""
    try:
        data = request.get_json()
        
        required = ['username', 'password', 'full_name', 'role']
        if not all(k in data for k in required):
            return err('Field wajib: username, password, full_name, role')
        
        result = auth.create_user(
            username=data['username'],
            password=data['password'],
            full_name=data['full_name'],
            email=data.get('email', ''),
            role=data['role'],
            mahasiswa_id=data.get('mahasiswa_id')
        )
        
        if result['success']:
            return ok({'user_id': result['user_id']}, result['message'])
        else:
            return err(result['message'])
            
    except Exception as e:
        logger.error(f"Create user error: {e}")
        return err(f'Gagal membuat user: {str(e)}', 500)

@app.route('/api/users/<int:user_id>', methods=['GET'])
@require_auth(roles=['admin'])
def get_user(user_id):
    """Get user by ID (admin only)"""
    try:
        user = auth.get_user_by_id(user_id)
        if user:
            return ok(user)
        else:
            return err('User tidak ditemukan', 404)
    except Exception as e:
        logger.error(f"Get user error: {e}")
        return err(f'Gagal memuat user: {str(e)}', 500)

@app.route('/api/users/<int:user_id>', methods=['PUT'])
@require_auth(roles=['admin'])
def update_user(user_id):
    """Update user (admin only)"""
    try:
        data = request.get_json()
        result = auth.update_user(
            user_id,
            full_name=data.get('full_name'),
            email=data.get('email')
        )
        
        if result['success']:
            return ok(msg=result['message'])
        else:
            return err(result['message'])
            
    except Exception as e:
        logger.error(f"Update user error: {e}")
        return err(f'Gagal update user: {str(e)}', 500)

@app.route('/api/users/<int:user_id>/deactivate', methods=['POST'])
@require_auth(roles=['admin'])
def deactivate_user(user_id):
    """Deactivate user (admin only)"""
    try:
        if auth.deactivate_user(user_id):
            return ok(msg='User berhasil dinonaktifkan')
        else:
            return err('Gagal menonaktifkan user')
    except Exception as e:
        logger.error(f"Deactivate user error: {e}")
        return err(f'Gagal menonaktifkan user: {str(e)}', 500)

@app.route('/api/users/<int:user_id>/activate', methods=['POST'])
@require_auth(roles=['admin'])
def activate_user(user_id):
    """Activate user (admin only)"""
    try:
        if auth.activate_user(user_id):
            return ok(msg='User berhasil diaktifkan')
        else:
            return err('Gagal mengaktifkan user')
    except Exception as e:
        logger.error(f"Activate user error: {e}")
        return err(f'Gagal mengaktifkan user: {str(e)}', 500)

@app.route('/api/users/<int:user_id>/reset-password', methods=['POST'])
@require_auth(roles=['admin'])
def reset_user_password(user_id):
    """Reset user password (admin only)"""
    try:
        data = request.get_json()
        new_password = data.get('new_password')
        
        if not new_password:
            return err('Password baru wajib diisi')
        
        if len(new_password) < 6:
            return err('Password minimal 6 karakter')
        
        # Hash new password
        password_hash = auth.hash_password(new_password)
        
        # Update password directly (admin privilege)
        auth.db._execute("""
            UPDATE users SET password_hash = %s WHERE id = %s
        """, (password_hash, user_id))
        
        # Invalidate all sessions for this user (force re-login)
        auth.db._execute("""
            DELETE FROM sessions WHERE user_id = %s
        """, (user_id,))
        
        logger.info(f"Password reset by admin for user_id: {user_id}")
        return ok(msg='Password berhasil direset')
        
    except Exception as e:
        logger.error(f"Reset password error: {e}")
        return err(f'Gagal reset password: {str(e)}', 500)

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
    # Check authentication via cookie or header
    token = get_session_token()
    
    if not token:
        return redirect('/login')
    
    # Validate session
    validation = auth.validate_session(token)
    
    if not validation['valid']:
        # Clear invalid cookie
        response = redirect('/login')
        response.set_cookie('session_token', '', expires=0)
        return response
    
    # Check role and serve appropriate page
    user = validation['user']
    if user['role'] in ['admin', 'timdis']:
        return send_file('dashboard.html')
    else:
        return send_file('mahasiswa.html')

@app.route('/mahasiswa')
def mahasiswa_portal():
    # Check authentication
    token = get_session_token()
    
    if not token:
        return redirect('/login')
    
    validation = auth.validate_session(token)
    
    if not validation['valid']:
        response = redirect('/login')
        response.set_cookie('session_token', '', expires=0)
        return response
    
    return send_file('mahasiswa.html')

@app.route('/monitor')
def monitor():
    # Check authentication
    token = get_session_token()
    
    if not token:
        return redirect('/login')
    
    validation = auth.validate_session(token)
    
    if not validation['valid']:
        response = redirect('/login')
        response.set_cookie('session_token', '', expires=0)
        return response
    
    return send_file('monitor.html')

@app.route('/test-api')
def test_api():
    return send_file('test_api.html')

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
        body.get('email', ''),
        body.get('no_telp_mahasiswa', ''),
        body.get('no_telp_ortu', '')
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
    Form data: mahasiswa_id, type (izin/sakit), date, keterangan, bukti (file) - WAJIB
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
        
        # Handle file upload - WAJIB
        bukti_path = None
        if 'bukti' not in request.files:
            return err('Bukti wajib diupload (surat dokter, surat izin, dll)')
        
        file = request.files['bukti']
        if not file or file.filename == '':
            return err('Bukti wajib diupload (surat dokter, surat izin, dll)')
        
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
        # Use forward slash for cross-platform compatibility
        bukti_path = f"data/bukti_izin/{filename}"
        
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


# ─── Kehadiran Manual Endpoints ──────────────────────────────────────────────────
@app.route('/api/kehadiran/submit', methods=['POST'])
def submit_kehadiran_manual():
    """
    Endpoint untuk mahasiswa submit pengajuan kehadiran manual.
    Bukti WAJIB diupload. Jam masuk dan jam keluar WAJIB diisi.
    """
    try:
        mahasiswa_id = request.form.get('mahasiswa_id')
        date = request.form.get('date')
        check_in_time = request.form.get('check_in_time')
        check_out_time = request.form.get('check_out_time')
        keterangan = request.form.get('keterangan')
        
        if not all([mahasiswa_id, date, check_in_time, check_out_time, keterangan]):
            return err('Field wajib: mahasiswa_id, date, check_in_time, check_out_time, keterangan')
        
        # Handle file upload - WAJIB
        bukti_path = None
        if 'bukti' not in request.files:
            return err('Bukti wajib diupload (foto selfie di lokasi, foto kegiatan, dll)')
        
        file = request.files['bukti']
        if not file or file.filename == '':
            return err('Bukti wajib diupload (foto selfie di lokasi, foto kegiatan, dll)')
        
        if not allowed_bukti_file(file.filename):
            return err('Format file tidak didukung. Hanya JPG, PNG, PDF yang diperbolehkan')
        
        # Check file size
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)
        
        if file_size > MAX_BUKTI_SIZE:
            return err('Ukuran file terlalu besar. Maksimal 10MB')
        
        # Save file
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = secure_filename(f"{timestamp}_{mahasiswa_id}_{file.filename}")
        filepath = app.config['BUKTI_FOLDER'] / filename
        file.save(str(filepath))
        bukti_path = f"data/bukti_izin/{filename}"
        
        submission_id = db.submit_kehadiran_manual(
            mahasiswa_id, date, check_in_time, check_out_time, keterangan, bukti_path
        )
        
        return ok({'submission_id': submission_id}, 'Pengajuan kehadiran berhasil disubmit')
        
    except Exception as e:
        logger.error(f"Error submit kehadiran manual: {e}")
        return err(f'Gagal submit pengajuan: {str(e)}', 500)


@app.route('/api/kehadiran/list', methods=['GET'])
def list_kehadiran_submissions():
    """
    Endpoint untuk Timdis melihat semua pengajuan kehadiran manual.
    """
    try:
        status = request.args.get('status', '')
        submissions = db.get_kehadiran_submissions(status)
        
        # Convert datetime to ISO format
        for sub in submissions:
            if hasattr(sub.get('date'), 'isoformat'):
                sub['date'] = sub['date'].isoformat()
            if hasattr(sub.get('created_at'), 'isoformat'):
                sub['created_at'] = sub['created_at'].isoformat()
            if hasattr(sub.get('verified_at'), 'isoformat') and sub.get('verified_at'):
                sub['verified_at'] = sub['verified_at'].isoformat()
        
        # Calculate stats
        all_submissions = db.get_kehadiran_submissions('')
        stats = {
            'pending': len([s for s in all_submissions if s['status'] == 'pending']),
            'approved': len([s for s in all_submissions if s['status'] == 'approved']),
            'rejected': len([s for s in all_submissions if s['status'] == 'rejected'])
        }
        
        return ok({'submissions': submissions, 'stats': stats})
        
    except Exception as e:
        logger.error(f"Error list kehadiran submissions: {e}")
        return err(f'Gagal mengambil data: {str(e)}', 500)


@app.route('/api/kehadiran/verify', methods=['POST'])
def verify_kehadiran_submission():
    """
    Endpoint untuk Timdis verifikasi pengajuan kehadiran (approve/reject).
    """
    try:
        body = request.json
        submission_id = body.get('submission_id')
        action = body.get('action')  # 'approve' or 'reject'
        verified_by = body.get('verified_by', 'Timdis')
        reject_reason = body.get('reject_reason', '')
        
        if not all([submission_id, action]):
            return err('Field wajib: submission_id, action')
        
        if action not in ['approve', 'reject']:
            return err('Action harus approve atau reject')
        
        if action == 'reject' and not reject_reason:
            return err('Alasan penolakan wajib diisi')
        
        success = db.verify_kehadiran_submission(
            submission_id, action, verified_by, reject_reason
        )
        
        if success:
            msg = 'Pengajuan disetujui' if action == 'approve' else 'Pengajuan ditolak'
            return ok(None, msg)
        else:
            return err('Gagal memverifikasi pengajuan')
            
    except Exception as e:
        logger.error(f"Error verify kehadiran: {e}")
        return err(f'Gagal verifikasi: {str(e)}', 500)


@app.route('/api/kehadiran/mahasiswa/<mahasiswa_id>', methods=['GET'])
def get_kehadiran_by_mahasiswa(mahasiswa_id):
    """
    Endpoint untuk mahasiswa melihat riwayat pengajuan kehadiran mereka.
    """
    try:
        submissions = db.get_kehadiran_by_mahasiswa(mahasiswa_id)
        
        for sub in submissions:
            if hasattr(sub.get('date'), 'isoformat'):
                sub['date'] = sub['date'].isoformat()
            if hasattr(sub.get('created_at'), 'isoformat'):
                sub['created_at'] = sub['created_at'].isoformat()
            if hasattr(sub.get('verified_at'), 'isoformat') and sub.get('verified_at'):
                sub['verified_at'] = sub['verified_at'].isoformat()
        
        return ok({'submissions': submissions})
        
    except Exception as e:
        logger.error(f"Error get kehadiran by mahasiswa: {e}")
        return err(f'Gagal mengambil data: {str(e)}', 500)


# ─── Settings Management ─────────────────────────────────────────────────────────
SETTINGS_FILE = Path('data/settings.json')

def load_settings_from_file():
    """Load settings from JSON file"""
    if not SETTINGS_FILE.exists():
        # Create default settings
        default_settings = {
            'yolo': {
                'model_path': 'models/yolov8n.pt',
                'confidence': 0.3,
                'qr_cooldown': 30
            },
            'rtsp': {
                'frame_width': 1080,
                'frame_height': 720,
                'frame_fps': 30,
                'reconnect_delay': 5
            }
        }
        save_settings_to_file(default_settings)
        return default_settings
    
    try:
        with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading settings: {e}")
        return {}

def save_settings_to_file(settings):
    """Save settings to JSON file"""
    try:
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        logger.error(f"Error saving settings: {e}")
        return False

@app.route('/api/settings', methods=['GET'])
def get_settings():
    """Get all settings"""
    try:
        settings = load_settings_from_file()
        return ok(settings)
    except Exception as e:
        logger.error(f"Error getting settings: {e}")
        return err(f'Gagal memuat pengaturan: {str(e)}', 500)

@app.route('/api/models/list', methods=['GET'])
def list_models():
    """List available YOLO models in models/ directory"""
    try:
        models_dir = Path('models')
        if not models_dir.exists():
            models_dir.mkdir(parents=True, exist_ok=True)
            return ok([])
        
        models = []
        for model_file in models_dir.glob('*.pt'):
            size_bytes = model_file.stat().st_size
            # Format size
            if size_bytes < 1024:
                size_str = f"{size_bytes} B"
            elif size_bytes < 1024 * 1024:
                size_str = f"{size_bytes / 1024:.1f} KB"
            elif size_bytes < 1024 * 1024 * 1024:
                size_str = f"{size_bytes / (1024 * 1024):.1f} MB"
            else:
                size_str = f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"
            
            models.append({
                'name': model_file.name,
                'path': str(model_file).replace('\\', '/'),
                'size': size_str,
                'size_bytes': size_bytes
            })
        
        # Sort by name
        models.sort(key=lambda x: x['name'])
        return ok(models)
        
    except Exception as e:
        logger.error(f"Error listing models: {e}")
        return err(f'Gagal memuat daftar model: {str(e)}', 500)

@app.route('/api/settings/yolo', methods=['POST'])
def save_yolo_settings():
    """Save YOLO settings"""
    try:
        body = request.json
        if not body:
            return err('Body request kosong')
        
        # Load current settings
        settings = load_settings_from_file()
        
        # Update YOLO settings
        if 'yolo' not in settings:
            settings['yolo'] = {}
        
        if 'model_path' in body:
            model_path = body['model_path']
            # Validate model file exists
            if not Path(model_path).exists():
                return err(f'File model tidak ditemukan: {model_path}', 400)
            if not model_path.endswith('.pt'):
                return err('File model harus berformat .pt', 400)
            settings['yolo']['model_path'] = model_path
        if 'confidence' in body:
            confidence = float(body['confidence'])
            if confidence < 0.1 or confidence > 1.0:
                return err('Confidence harus antara 0.1 - 1.0', 400)
            settings['yolo']['confidence'] = confidence
        if 'qr_cooldown' in body:
            cooldown = int(body['qr_cooldown'])
            if cooldown < 5 or cooldown > 300:
                return err('QR Cooldown harus antara 5 - 300 detik', 400)
            settings['yolo']['qr_cooldown'] = cooldown
        
        # Save to file
        if save_settings_to_file(settings):
            return ok(settings['yolo'], 'Pengaturan YOLO berhasil disimpan')
        else:
            return err('Gagal menyimpan pengaturan', 500)
            
    except Exception as e:
        logger.error(f"Error saving YOLO settings: {e}")
        return err(f'Gagal menyimpan: {str(e)}', 500)

@app.route('/api/settings/rtsp', methods=['POST'])
def save_rtsp_settings():
    """Save RTSP settings"""
    try:
        body = request.json
        if not body:
            return err('Body request kosong')
        
        # Load current settings
        settings = load_settings_from_file()
        
        # Update RTSP settings
        if 'rtsp' not in settings:
            settings['rtsp'] = {}
        
        if 'frame_width' in body:
            width = int(body['frame_width'])
            if width < 320 or width > 3840:
                return err('Frame Width harus antara 320 - 3840', 400)
            settings['rtsp']['frame_width'] = width
        if 'frame_height' in body:
            height = int(body['frame_height'])
            if height < 240 or height > 2160:
                return err('Frame Height harus antara 240 - 2160', 400)
            settings['rtsp']['frame_height'] = height
        if 'frame_fps' in body:
            fps = int(body['frame_fps'])
            if fps < 1 or fps > 60:
                return err('Frame FPS harus antara 1 - 60', 400)
            settings['rtsp']['frame_fps'] = fps
        if 'reconnect_delay' in body:
            delay = int(body['reconnect_delay'])
            if delay < 1 or delay > 30:
                return err('Reconnect Delay harus antara 1 - 30 detik', 400)
            settings['rtsp']['reconnect_delay'] = delay
        
        # Save to file
        if save_settings_to_file(settings):
            return ok(settings['rtsp'], 'Pengaturan RTSP berhasil disimpan')
        else:
            return err('Gagal menyimpan pengaturan', 500)
            
    except Exception as e:
        logger.error(f"Error saving RTSP settings: {e}")
        return err(f'Gagal menyimpan: {str(e)}', 500)

# ═══════════════════════════════════════════════════════════════
# Enhanced Mahasiswa API Endpoints
# ═══════════════════════════════════════════════════════════════

@app.route('/api/mahasiswa/<mhs_id>/statistics', methods=['GET'])
def get_mahasiswa_statistics(mhs_id):
    """Get comprehensive statistics for a specific mahasiswa"""
    try:
        # Basic attendance stats
        stats_query = """
            SELECT 
                COUNT(CASE WHEN check_in_time IS NOT NULL THEN 1 END) as total_hadir,
                COUNT(CASE WHEN DATE_FORMAT(date, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m') 
                           AND check_in_time IS NOT NULL THEN 1 END) as hadir_bulan_ini,
                COUNT(CASE WHEN check_in_time IS NULL THEN 1 END) as tidak_hadir,
                AVG(CASE WHEN check_in_time IS NOT NULL AND check_out_time IS NOT NULL 
                         THEN TIMESTAMPDIFF(MINUTE, 
                              CONCAT(date, ' ', check_in_time), 
                              CONCAT(date, ' ', check_out_time)) END) as avg_duration_minutes
            FROM attendance 
            WHERE mahasiswa_id = %s AND date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
        """
        
        stats = db._execute(stats_query, (mhs_id,), fetch_one=True)
        
        # Izin/Sakit count
        izin_query = """
            SELECT COUNT(*) as total_izin 
            FROM izin_submissions 
            WHERE mahasiswa_id = %s AND status = 'approved'
        """
        izin_stats = db._execute(izin_query, (mhs_id,), fetch_one=True)
        
        # Calculate percentage
        total_days = stats['total_hadir'] + stats['tidak_hadir']
        percentage = round((stats['total_hadir'] / total_days * 100) if total_days > 0 else 0, 1)
        
        # Format average duration
        avg_minutes = stats['avg_duration_minutes'] or 0
        avg_hours = int(avg_minutes // 60)
        avg_mins = int(avg_minutes % 60)
        avg_duration_str = f"{avg_hours}j {avg_mins}m"
        
        # Calculate longest streak (simplified)
        streak_query = """
            SELECT MAX(streak) as longest_streak FROM (
                SELECT COUNT(*) as streak
                FROM attendance a1
                WHERE mahasiswa_id = %s AND check_in_time IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM attendance a2 
                    WHERE a2.mahasiswa_id = a1.mahasiswa_id 
                    AND a2.date = DATE_ADD(a1.date, INTERVAL 1 DAY)
                    AND a2.check_in_time IS NULL
                )
                GROUP BY DATE_FORMAT(date, '%Y-%m')
            ) streaks
        """
        streak_result = db._execute(streak_query, (mhs_id,), fetch_one=True)
        longest_streak = streak_result['longest_streak'] or 0
        
        # Count late arrivals (after 08:00)
        late_query = """
            SELECT COUNT(*) as late_count
            FROM attendance 
            WHERE mahasiswa_id = %s AND check_in_time > '08:00:00'
        """
        late_result = db._execute(late_query, (mhs_id,), fetch_one=True)
        
        result = {
            'totalHadir': stats['total_hadir'] or 0,
            'hadirBulanIni': stats['hadir_bulan_ini'] or 0,
            'tidakHadir': stats['tidak_hadir'] or 0,
            'totalIzin': izin_stats['total_izin'] or 0,
            'persentaseKehadiran': percentage,
            'rataRataDurasi': avg_duration_str,
            'streakTerpanjang': longest_streak,
            'terlambat': late_result['late_count'] or 0
        }
        
        return ok(result)
        
    except Exception as e:
        logger.error(f"Error getting mahasiswa statistics: {e}")
        return err(f'Gagal memuat statistik: {str(e)}', 500)

@app.route('/api/mahasiswa/<mhs_id>/chart/weekly', methods=['GET'])
def get_weekly_chart(mhs_id):
    """Get weekly attendance chart data"""
    try:
        query = """
            SELECT DAYOFWEEK(date) as day_of_week, COUNT(*) as count
            FROM attendance 
            WHERE mahasiswa_id = %s 
            AND check_in_time IS NOT NULL 
            AND date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY DAYOFWEEK(date)
            ORDER BY DAYOFWEEK(date)
        """
        
        rows = db._execute(query, (mhs_id,), fetch_all=True)
        
        # Initialize with zeros for all days (1=Sunday, 2=Monday, etc.)
        attendance = [0] * 7
        for row in rows:
            day_index = (row['day_of_week'] + 5) % 7  # Convert to Mon=0, Tue=1, etc.
            attendance[day_index] = row['count']
        
        return ok({'attendance': attendance})
        
    except Exception as e:
        logger.error(f"Error getting weekly chart: {e}")
        return err(f'Gagal memuat chart: {str(e)}', 500)

@app.route('/api/mahasiswa/<mhs_id>/chart/monthly', methods=['GET'])
def get_monthly_chart(mhs_id):
    """Get monthly attendance chart data"""
    try:
        query = """
            SELECT MONTH(date) as month, COUNT(*) as count
            FROM attendance 
            WHERE mahasiswa_id = %s 
            AND check_in_time IS NOT NULL 
            AND date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY MONTH(date)
            ORDER BY MONTH(date)
        """
        
        rows = db._execute(query, (mhs_id,), fetch_all=True)
        
        # Initialize with zeros for last 6 months
        monthly = [0] * 6
        for row in rows:
            month_index = (row['month'] - 1) % 6
            monthly[month_index] = row['count']
        
        return ok({'monthly': monthly})
        
    except Exception as e:
        logger.error(f"Error getting monthly chart: {e}")
        return err(f'Gagal memuat chart bulanan: {str(e)}', 500)

@app.route('/api/mahasiswa/<mhs_id>/activity', methods=['GET'])
def get_recent_activity(mhs_id):
    """Get recent activity for mahasiswa"""
    try:
        query = """
            SELECT 
                date,
                check_in_time,
                check_out_time,
                'checkin' as type,
                CONCAT('Check-in pada ', TIME_FORMAT(check_in_time, '%H:%i')) as title,
                CONCAT('Masuk kantor') as description,
                CONCAT(date, ' ', check_in_time) as timestamp
            FROM attendance 
            WHERE mahasiswa_id = %s AND check_in_time IS NOT NULL
            
            UNION ALL
            
            SELECT 
                date,
                check_in_time,
                check_out_time,
                'checkout' as type,
                CONCAT('Check-out pada ', TIME_FORMAT(check_out_time, '%H:%i')) as title,
                CONCAT('Keluar kantor') as description,
                CONCAT(date, ' ', check_out_time) as timestamp
            FROM attendance 
            WHERE mahasiswa_id = %s AND check_out_time IS NOT NULL
            
            ORDER BY timestamp DESC
            LIMIT 10
        """
        
        activities = db._execute(query, (mhs_id, mhs_id), fetch_all=True)
        return ok(activities or [])
        
    except Exception as e:
        logger.error(f"Error getting recent activity: {e}")
        return err(f'Gagal memuat aktivitas: {str(e)}', 500)

@app.route('/api/mahasiswa/riwayat', methods=['GET'])
def get_mahasiswa_riwayat():
    """Get filtered attendance history for mahasiswa"""
    try:
        mhs_id = request.args.get('mahasiswa_id')
        if not mhs_id:
            return err('mahasiswa_id diperlukan')
        
        hari = request.args.get('hari')  # 0-6 (Sunday-Saturday)
        bulan = request.args.get('bulan')  # 01-12
        tahun = request.args.get('tahun')  # YYYY
        status = request.args.get('status')  # present, izin, sakit
        
        query = """
            SELECT 
                a.date,
                a.check_in_time,
                a.check_out_time,
                CASE 
                    WHEN a.check_in_time IS NOT NULL THEN 'present'
                    WHEN i.status = 'approved' AND i.type = 'izin' THEN 'izin'
                    WHEN i.status = 'approved' AND i.type = 'sakit' THEN 'sakit'
                    ELSE 'absent'
                END as status
            FROM attendance a
            LEFT JOIN izin_submissions i ON a.mahasiswa_id = i.mahasiswa_id AND a.date = i.date
            WHERE a.mahasiswa_id = %s
        """
        params = [mhs_id]
        
        if hari:
            query += " AND DAYOFWEEK(a.date) = %s"
            params.append(int(hari) + 1)  # Convert 0-6 to 1-7
            
        if bulan:
            query += " AND MONTH(a.date) = %s"
            params.append(int(bulan))
            
        if tahun:
            query += " AND YEAR(a.date) = %s"
            params.append(int(tahun))
        
        query += " ORDER BY a.date DESC LIMIT 100"
        
        rows = db._execute(query, tuple(params), fetch_all=True)
        
        # Filter by status if specified
        if status and rows:
            rows = [row for row in rows if row['status'] == status]
        
        return ok(rows or [])
        
    except Exception as e:
        logger.error(f"Error getting riwayat: {e}")
        return err(f'Gagal memuat riwayat: {str(e)}', 500)

@app.route('/api/mahasiswa/riwayat/export', methods=['GET'])
def export_riwayat_csv():
    """Export attendance history to CSV"""
    try:
        mhs_id = request.args.get('mahasiswa_id')
        if not mhs_id:
            return err('mahasiswa_id diperlukan')
        
        # Get mahasiswa info
        mhs = db._execute("SELECT name FROM mahasiswa WHERE id = %s", (mhs_id,), fetch_one=True)
        if not mhs:
            return err('Mahasiswa tidak ditemukan')
        
        # Get filtered data (reuse the same logic as riwayat endpoint)
        hari = request.args.get('hari')
        bulan = request.args.get('bulan')
        tahun = request.args.get('tahun')
        status = request.args.get('status')
        
        query = """
            SELECT 
                a.date,
                a.check_in_time,
                a.check_out_time,
                CASE 
                    WHEN a.check_in_time IS NOT NULL THEN 'Hadir'
                    WHEN i.status = 'approved' AND i.type = 'izin' THEN 'Izin'
                    WHEN i.status = 'approved' AND i.type = 'sakit' THEN 'Sakit'
                    ELSE 'Tidak Hadir'
                END as status
            FROM attendance a
            LEFT JOIN izin_submissions i ON a.mahasiswa_id = i.mahasiswa_id AND a.date = i.date
            WHERE a.mahasiswa_id = %s
        """
        params = [mhs_id]
        
        if hari:
            query += " AND DAYOFWEEK(a.date) = %s"
            params.append(int(hari) + 1)
        if bulan:
            query += " AND MONTH(a.date) = %s"
            params.append(int(bulan))
        if tahun:
            query += " AND YEAR(a.date) = %s"
            params.append(int(tahun))
        
        query += " ORDER BY a.date DESC"
        
        rows = db._execute(query, tuple(params), fetch_all=True)
        
        if status and rows:
            status_map = {'present': 'Hadir', 'izin': 'Izin', 'sakit': 'Sakit', 'absent': 'Tidak Hadir'}
            target_status = status_map.get(status, status)
            rows = [row for row in rows if row['status'] == target_status]
        
        # Generate CSV
        import io
        import csv
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow(['Tanggal', 'Hari', 'Jam Masuk', 'Jam Keluar', 'Status', 'Durasi'])
        
        # Data
        for row in rows:
            date_obj = row['date']
            hari_nama = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'][date_obj.weekday()]
            
            jam_masuk = row['check_in_time'].strftime('%H:%M') if row['check_in_time'] else '-'
            jam_keluar = row['check_out_time'].strftime('%H:%M') if row['check_out_time'] else '-'
            
            # Calculate duration
            durasi = '-'
            if row['check_in_time'] and row['check_out_time']:
                from datetime import datetime, timedelta
                start = datetime.combine(date_obj, row['check_in_time'])
                end = datetime.combine(date_obj, row['check_out_time'])
                if end < start:
                    end += timedelta(days=1)
                diff = end - start
                hours = diff.seconds // 3600
                minutes = (diff.seconds % 3600) // 60
                durasi = f"{hours}j {minutes}m"
            
            writer.writerow([
                date_obj.strftime('%d/%m/%Y'),
                hari_nama,
                jam_masuk,
                jam_keluar,
                row['status'],
                durasi
            ])
        
        # Create response
        output.seek(0)
        
        from flask import make_response
        response = make_response(output.getvalue())
        response.headers['Content-Type'] = 'text/csv'
        response.headers['Content-Disposition'] = f'attachment; filename=riwayat_{mhs["name"]}_{mhs_id}.csv'
        
        return response
        
    except Exception as e:
        logger.error(f"Error exporting CSV: {e}")
        return err(f'Gagal export CSV: {str(e)}', 500)

@app.route('/api/mahasiswa/<mhs_id>', methods=['GET'])
def get_mahasiswa_detail(mhs_id):
    """Get detailed mahasiswa information"""
    try:
        mhs = db._execute("SELECT * FROM mahasiswa WHERE id = %s", (mhs_id,), fetch_one=True)
        if not mhs:
            return err('Mahasiswa tidak ditemukan', 404)
        return ok(mhs)
    except Exception as e:
        logger.error(f"Error getting mahasiswa detail: {e}")
        return err(f'Gagal memuat detail: {str(e)}', 500)

@app.route('/api/mahasiswa/<mhs_id>', methods=['PUT'])
def update_mahasiswa_profile(mhs_id):
    """Update mahasiswa profile"""
    try:
        body = request.json
        required = ['name', 'kelompok', 'jurusan']
        if not all(k in body for k in required):
            return err('Field wajib: name, kelompok, jurusan')
        
        db._execute("""
            UPDATE mahasiswa 
            SET name = %s, kelompok = %s, jurusan = %s, email = %s
            WHERE id = %s
        """, (body['name'], body['kelompok'], body['jurusan'], body.get('email', ''), mhs_id))
        
        return ok(msg='Profil berhasil diperbarui')
        
    except Exception as e:
        logger.error(f"Error updating mahasiswa profile: {e}")
        return err(f'Gagal memperbarui profil: {str(e)}', 500)

# ═══════════════════════════════════════════════════════════════
# Excel Upload Endpoints
# ═══════════════════════════════════════════════════════════════

@app.route('/api/mahasiswa/excel-template', methods=['GET'])
def download_excel_template():
    """Download Excel template for bulk mahasiswa upload"""
    try:
        import pandas as pd
        import io
        
        # Create sample data
        template_data = {
            'mahasiswa_id': ['MHS001', 'MHS002', 'MHS003'],
            'name': ['Contoh Nama 1', 'Contoh Nama 2', 'Contoh Nama 3'],
            'kelompok': ['A', 'B', 'A'],
            'jurusan': ['Teknik Informatika', 'Sistem Informasi', 'Teknik Komputer'],
            'email': ['contoh1@student.ac.id', 'contoh2@student.ac.id', 'contoh3@student.ac.id']
        }
        
        df = pd.DataFrame(template_data)
        
        # Create Excel file in memory
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Mahasiswa', index=False)
            
            # Add instructions sheet
            instructions = pd.DataFrame({
                'Kolom': ['mahasiswa_id', 'name', 'kelompok', 'jurusan', 'email'],
                'Deskripsi': [
                    'ID unik mahasiswa (contoh: MHS001)',
                    'Nama lengkap mahasiswa',
                    'Kelompok/kelas (contoh: A, B, C)',
                    'Nama jurusan',
                    'Email mahasiswa (opsional)'
                ],
                'Wajib': ['Ya', 'Ya', 'Ya', 'Ya', 'Tidak']
            })
            instructions.to_excel(writer, sheet_name='Instruksi', index=False)
        
        output.seek(0)
        
        return send_file(
            io.BytesIO(output.read()),
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name='template_mahasiswa.xlsx'
        )
        
    except Exception as e:
        logger.error(f"Error creating Excel template: {e}")
        return err(f'Gagal membuat template: {str(e)}', 500)

@app.route('/api/mahasiswa/excel-preview', methods=['POST'])
def preview_excel_data():
    """Preview Excel data before upload"""
    try:
        if 'excel_file' not in request.files:
            return err('File Excel tidak ditemukan')
        
        file = request.files['excel_file']
        if file.filename == '':
            return err('Tidak ada file yang dipilih')
        
        if not file.filename.lower().endswith(('.xlsx', '.xls')):
            return err('Format file harus Excel (.xlsx atau .xls)')
        
        import pandas as pd
        
        # Read Excel file
        df = pd.read_excel(file)
        
        # Validate required columns
        required_cols = ['mahasiswa_id', 'name', 'kelompok', 'jurusan']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            return err(f'Kolom yang hilang: {", ".join(missing_cols)}')
        
        # Get existing mahasiswa IDs
        existing_ids = set()
        existing_rows = db._execute("SELECT id FROM mahasiswa", fetch_all=True)
        if existing_rows:
            existing_ids = {row['id'] for row in existing_rows}
        
        # Process each row
        preview_rows = []
        for index, row in df.iterrows():
            row_data = {
                'mahasiswa_id': str(row['mahasiswa_id']).strip() if pd.notna(row['mahasiswa_id']) else '',
                'name': str(row['name']).strip() if pd.notna(row['name']) else '',
                'kelompok': str(row['kelompok']).strip() if pd.notna(row['kelompok']) else '',
                'jurusan': str(row['jurusan']).strip() if pd.notna(row['jurusan']) else '',
                'email': str(row['email']).strip() if pd.notna(row.get('email', '')) else '',
                'errors': [],
                'is_duplicate': False
            }
            
            # Validation
            if not row_data['mahasiswa_id']:
                row_data['errors'].append('ID mahasiswa kosong')
            elif row_data['mahasiswa_id'] in existing_ids:
                row_data['is_duplicate'] = True
            
            if not row_data['name']:
                row_data['errors'].append('Nama kosong')
            
            if not row_data['kelompok']:
                row_data['errors'].append('Kelompok kosong')
            
            if not row_data['jurusan']:
                row_data['errors'].append('Jurusan kosong')
            
            # Email validation (optional)
            if row_data['email'] and '@' not in row_data['email']:
                row_data['errors'].append('Format email tidak valid')
            
            preview_rows.append(row_data)
        
        return ok({'rows': preview_rows})
        
    except Exception as e:
        logger.error(f"Error previewing Excel: {e}")
        return err(f'Gagal preview Excel: {str(e)}', 500)

@app.route('/api/mahasiswa/excel-upload', methods=['POST'])
def upload_excel_mahasiswa():
    """Upload mahasiswa data from Excel file"""
    try:
        if 'excel_file' not in request.files:
            return err('File Excel tidak ditemukan')
        
        file = request.files['excel_file']
        if file.filename == '':
            return err('Tidak ada file yang dipilih')
        
        import pandas as pd
        
        # Read and validate Excel file (reuse preview logic)
        df = pd.read_excel(file)
        
        required_cols = ['mahasiswa_id', 'name', 'kelompok', 'jurusan']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            return err(f'Kolom yang hilang: {", ".join(missing_cols)}')
        
        # Get existing IDs
        existing_ids = set()
        existing_rows = db._execute("SELECT id FROM mahasiswa", fetch_all=True)
        if existing_rows:
            existing_ids = {row['id'] for row in existing_rows}
        
        # Process and insert valid rows
        inserted_count = 0
        errors = []
        
        for index, row in df.iterrows():
            try:
                mhs_id = str(row['mahasiswa_id']).strip()
                name = str(row['name']).strip()
                kelompok = str(row['kelompok']).strip()
                jurusan = str(row['jurusan']).strip()
                email = str(row.get('email', '')).strip()
                
                # Skip if required fields are empty or duplicate
                if not all([mhs_id, name, kelompok, jurusan]) or mhs_id in existing_ids:
                    continue
                
                # Insert mahasiswa
                qr_id = db.add_mahasiswa(mhs_id, name, kelompok, jurusan, email)
                
                # Generate QR code
                QRCodeGenerator.generate(qr_id, name, QR_DIR)
                
                inserted_count += 1
                existing_ids.add(mhs_id)  # Prevent duplicates within the same file
                
            except Exception as e:
                errors.append(f'Baris {index + 2}: {str(e)}')
                continue
        
        result = {
            'inserted': inserted_count,
            'errors': errors
        }
        
        if inserted_count > 0:
            return ok(result, f'Berhasil menambahkan {inserted_count} mahasiswa')
        else:
            return err('Tidak ada data valid yang dapat diproses', 400)
        
    except Exception as e:
        logger.error(f"Error uploading Excel: {e}")
        return err(f'Gagal upload Excel: {str(e)}', 500)


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
# ═══════════════════════════════════════════════════════════════
# Izin/Sakit Submission Endpoints
# ═══════════════════════════════════════════════════════════════

@app.route('/api/mahasiswa/<mhs_id>/izin-history', methods=['GET'])
def get_mahasiswa_izin_history(mhs_id):
    """Get izin/sakit history for specific mahasiswa"""
    try:
        history = db.get_mahasiswa_izin_submissions(mhs_id)
        return ok(history or [])
    except Exception as e:
        logger.error(f"Error getting izin history: {e}")
        return err(f'Gagal memuat riwayat izin: {str(e)}', 500)

@app.route('/api/izin-submissions/<submission_id>', methods=['GET'])
def get_izin_submission_detail(submission_id):
    """Get detailed izin submission"""
    try:
        query = """
            SELECT i.*, m.name as mahasiswa_name, m.kelompok, m.jurusan
            FROM izin_submissions i
            JOIN mahasiswa m ON i.mahasiswa_id = m.id
            WHERE i.id = %s
        """
        submission = db._execute(query, (submission_id,), fetch_one=True)
        
        if not submission:
            return err('Pengajuan tidak ditemukan', 404)
        
        return ok(submission)
    except Exception as e:
        logger.error(f"Error getting izin detail: {e}")
        return err(f'Gagal memuat detail: {str(e)}', 500)

# ═══════════════════════════════════════════════════════════════
# Kehadiran Manual Submission Endpoints  
# ═══════════════════════════════════════════════════════════════

@app.route('/api/kehadiran-submissions', methods=['POST'])
def submit_kehadiran_manual():
    """Submit manual attendance request"""
    try:
        # Get form data
        mahasiswa_id = request.form.get('mahasiswa_id')
        date = request.form.get('date')
        check_in_time = request.form.get('check_in_time')
        check_out_time = request.form.get('check_out_time')
        keterangan = request.form.get('keterangan')
        
        # Validate required fields
        if not all([mahasiswa_id, date, check_in_time, check_out_time, keterangan]):
            return err('Semua field wajib diisi')
        
        # Validate mahasiswa exists
        mhs = db._execute("SELECT * FROM mahasiswa WHERE id = %s", (mahasiswa_id,), fetch_one=True)
        if not mhs:
            return err('Mahasiswa tidak ditemukan')
        
        # Handle file upload
        bukti_path = None
        if 'bukti' in request.files:
            file = request.files['bukti']
            if file and file.filename:
                if not allowed_bukti_file(file.filename):
                    return err('Format file tidak didukung. Gunakan JPG, PNG, atau PDF')
                
                # Save file
                filename = secure_filename(f"{mahasiswa_id}_{date}_{int(time.time())}_{file.filename}")
                file_path = BUKTI_FOLDER / filename
                file.save(file_path)
                # Use forward slash for cross-platform compatibility
                bukti_path = f"data/bukti_izin/{filename}"
        
        # Insert kehadiran submission
        query = """
            INSERT INTO kehadiran_submissions 
            (mahasiswa_id, date, check_in_time, check_out_time, keterangan, bukti_path, status, submitted_at)
            VALUES (%s, %s, %s, %s, %s, %s, 'pending', NOW())
        """
        
        submission_id = db._execute(query, (
            mahasiswa_id, date, check_in_time, check_out_time, keterangan, bukti_path
        ))
        
        return ok({'submission_id': submission_id}, 'Pengajuan kehadiran berhasil dikirim')
        
    except Exception as e:
        logger.error(f"Error submitting kehadiran: {e}")
        return err(f'Gagal mengirim pengajuan: {str(e)}', 500)

@app.route('/api/mahasiswa/<mhs_id>/kehadiran-history', methods=['GET'])
def get_mahasiswa_kehadiran_history(mhs_id):
    """Get kehadiran submission history for specific mahasiswa"""
    try:
        query = """
            SELECT k.*, m.name as mahasiswa_name, m.kelompok, m.jurusan
            FROM kehadiran_submissions k
            JOIN mahasiswa m ON k.mahasiswa_id = m.id
            WHERE k.mahasiswa_id = %s
            ORDER BY k.submitted_at DESC
        """
        
        history = db._execute(query, (mhs_id,), fetch_all=True)
        return ok(history or [])
        
    except Exception as e:
        logger.error(f"Error getting kehadiran history: {e}")
        return err(f'Gagal memuat riwayat kehadiran: {str(e)}', 500)

# ═══════════════════════════════════════════════════════════════
# Sertifikat Endpoints
# ═══════════════════════════════════════════════════════════════

@app.route('/api/mahasiswa/<mhs_id>/sertifikat/preview', methods=['POST'])
def preview_sertifikat_stats(mhs_id):
    """Preview statistics for certificate generation"""
    try:
        body = request.json
        periode_type = body.get('type')
        
        # Build date filter based on periode type
        date_filter = ""
        params = [mhs_id]
        
        if periode_type == 'monthly':
            month = body.get('month')
            year = body.get('year')
            date_filter = "AND YEAR(a.date) = %s AND MONTH(a.date) = %s"
            params.extend([year, month])
            
        elif periode_type == 'semester':
            semester = body.get('semester')
            year = body.get('year')
            if semester == 'ganjil':
                date_filter = "AND YEAR(a.date) = %s AND MONTH(a.date) IN (9,10,11,12,1)"
                params.append(year)
            else:  # genap
                date_filter = "AND YEAR(a.date) = %s AND MONTH(a.date) IN (2,3,4,5,6)"
                params.append(year)
                
        elif periode_type == 'yearly':
            year = body.get('year')
            date_filter = "AND YEAR(a.date) = %s"
            params.append(year)
            
        elif periode_type == 'custom':
            start_date = body.get('startDate')
            end_date = body.get('endDate')
            date_filter = "AND a.date BETWEEN %s AND %s"
            params.extend([start_date, end_date])
        
        # Get statistics
        query = f"""
            SELECT 
                COUNT(CASE WHEN a.check_in_time IS NOT NULL THEN 1 END) as total_hadir,
                COUNT(*) as total_hari,
                COUNT(CASE WHEN i.status = 'approved' THEN 1 END) as total_izin
            FROM attendance a
            LEFT JOIN izin_submissions i ON a.mahasiswa_id = i.mahasiswa_id AND a.date = i.date
            WHERE a.mahasiswa_id = %s {date_filter}
        """
        
        stats = db._execute(query, tuple(params), fetch_one=True)
        
        # Calculate percentage
        total_hari = stats['total_hari'] or 1
        persentase = round((stats['total_hadir'] / total_hari) * 100, 1)
        
        result = {
            'totalHadir': stats['total_hadir'] or 0,
            'totalHari': total_hari,
            'totalIzin': stats['total_izin'] or 0,
            'persentase': persentase
        }
        
        return ok(result)
        
    except Exception as e:
        logger.error(f"Error previewing sertifikat: {e}")
        return err(f'Gagal preview sertifikat: {str(e)}', 500)

@app.route('/api/mahasiswa/<mhs_id>/sertifikat/generate', methods=['POST'])
def generate_sertifikat_pdf(mhs_id):
    """Generate certificate PDF"""
    try:
        body = request.json
        template = body.get('template', 'formal')
        
        # Get mahasiswa info
        mhs = db._execute("SELECT * FROM mahasiswa WHERE id = %s", (mhs_id,), fetch_one=True)
        if not mhs:
            return err('Mahasiswa tidak ditemukan', 404)
        
        # Get statistics (reuse preview logic)
        periode_type = body.get('type')
        date_filter = ""
        params = [mhs_id]
        
        if periode_type == 'monthly':
            month = body.get('month')
            year = body.get('year')
            date_filter = "AND YEAR(a.date) = %s AND MONTH(a.date) = %s"
            params.extend([year, month])
        elif periode_type == 'semester':
            semester = body.get('semester')
            year = body.get('year')
            if semester == 'ganjil':
                date_filter = "AND YEAR(a.date) = %s AND MONTH(a.date) IN (9,10,11,12,1)"
                params.append(year)
            else:
                date_filter = "AND YEAR(a.date) = %s AND MONTH(a.date) IN (2,3,4,5,6)"
                params.append(year)
        elif periode_type == 'yearly':
            year = body.get('year')
            date_filter = "AND YEAR(a.date) = %s"
            params.append(year)
        elif periode_type == 'custom':
            start_date = body.get('startDate')
            end_date = body.get('endDate')
            date_filter = "AND a.date BETWEEN %s AND %s"
            params.extend([start_date, end_date])
        
        query = f"""
            SELECT 
                COUNT(CASE WHEN a.check_in_time IS NOT NULL THEN 1 END) as total_hadir,
                COUNT(*) as total_hari,
                COUNT(CASE WHEN i.status = 'approved' THEN 1 END) as total_izin
            FROM attendance a
            LEFT JOIN izin_submissions i ON a.mahasiswa_id = i.mahasiswa_id AND a.date = i.date
            WHERE a.mahasiswa_id = %s {date_filter}
        """
        
        stats = db._execute(query, tuple(params), fetch_one=True)
        persentase = round((stats['total_hadir'] / (stats['total_hari'] or 1)) * 100, 1)
        
        # Generate PDF certificate
        pdf_content = generate_certificate_pdf(mhs, stats, body, template)
        
        # Save to history
        history_query = """
            INSERT INTO sertifikat_history 
            (mahasiswa_id, periode, template, total_hadir, persentase, created_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
        """
        
        db._execute(history_query, (
            mhs_id, 
            json.dumps(body), 
            template, 
            stats['total_hadir'], 
            persentase
        ))
        
        # Return PDF
        from flask import make_response
        response = make_response(pdf_content)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'attachment; filename=sertifikat_{mhs["name"]}_{mhs_id}.pdf'
        
        return response
        
    except Exception as e:
        logger.error(f"Error generating sertifikat: {e}")
        return err(f'Gagal generate sertifikat: {str(e)}', 500)

def generate_certificate_pdf(mahasiswa, stats, periode_info, template):
    """Generate PDF certificate content"""
    try:
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import inch
        from reportlab.lib.colors import HexColor
        import io
        
        buffer = io.BytesIO()
        
        # Use landscape orientation for certificate
        p = canvas.Canvas(buffer, pagesize=landscape(A4))
        width, height = landscape(A4)
        
        # Colors based on template
        if template == 'formal':
            primary_color = HexColor('#2D5BFF')
            secondary_color = HexColor('#6B7A90')
        elif template == 'modern':
            primary_color = HexColor('#06D6A0')
            secondary_color = HexColor('#2D5BFF')
        else:  # classic
            primary_color = HexColor('#8B4513')
            secondary_color = HexColor('#DAA520')
        
        # Header
        p.setFillColor(primary_color)
        p.setFont("Helvetica-Bold", 24)
        p.drawCentredText(width/2, height - 80, "SERTIFIKAT KEHADIRAN")
        
        # Subtitle
        p.setFillColor(secondary_color)
        p.setFont("Helvetica", 14)
        p.drawCentredText(width/2, height - 110, "Sistem Absensi Digital")
        
        # Main content
        p.setFillColor(HexColor('#000000'))
        p.setFont("Helvetica", 12)
        
        y_pos = height - 180
        
        # Certificate text
        p.drawCentredText(width/2, y_pos, "Diberikan kepada:")
        
        y_pos -= 40
        p.setFont("Helvetica-Bold", 20)
        p.drawCentredText(width/2, y_pos, mahasiswa['name'])
        
        y_pos -= 30
        p.setFont("Helvetica", 12)
        p.drawCentredText(width/2, y_pos, f"ID: {mahasiswa['id']} | Kelompok: {mahasiswa['kelompok']} | {mahasiswa['jurusan']}")
        
        y_pos -= 60
        p.drawCentredText(width/2, y_pos, "Atas partisipasi dan kehadiran yang baik dengan pencapaian:")
        
        # Statistics box
        y_pos -= 60
        box_width = 400
        box_height = 120
        box_x = (width - box_width) / 2
        box_y = y_pos - box_height
        
        p.setStrokeColor(primary_color)
        p.setLineWidth(2)
        p.rect(box_x, box_y, box_width, box_height)
        
        # Statistics content
        p.setFont("Helvetica-Bold", 14)
        stat_y = box_y + box_height - 30
        
        p.drawCentredText(width/2, stat_y, f"Total Kehadiran: {stats['total_hadir']} dari {stats['total_hari']} hari")
        stat_y -= 25
        p.drawCentredText(width/2, stat_y, f"Persentase Kehadiran: {round((stats['total_hadir'] / (stats['total_hari'] or 1)) * 100, 1)}%")
        stat_y -= 25
        p.drawCentredText(width/2, stat_y, f"Izin/Sakit: {stats['total_izin']} hari")
        
        # Period info
        y_pos = box_y - 40
        p.setFont("Helvetica", 10)
        periode_text = format_periode_text(periode_info)
        p.drawCentredText(width/2, y_pos, f"Periode: {periode_text}")
        
        # Footer
        y_pos -= 60
        p.setFont("Helvetica", 10)
        p.drawCentredText(width/2, y_pos, f"Diterbitkan pada: {datetime.now().strftime('%d %B %Y')}")
        
        y_pos -= 20
        p.drawCentredText(width/2, y_pos, "Sistem Absensi Digital - SIABSEN v2.4")
        
        p.showPage()
        p.save()
        
        buffer.seek(0)
        return buffer.getvalue()
        
    except Exception as e:
        logger.error(f"Error generating PDF: {e}")
        raise

def format_periode_text(periode_info):
    """Format periode information for display"""
    periode_type = periode_info.get('type')
    
    if periode_type == 'monthly':
        month_names = {
            '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
            '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
            '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember'
        }
        month_name = month_names.get(periode_info.get('month'), periode_info.get('month'))
        return f"{month_name} {periode_info.get('year')}"
        
    elif periode_type == 'semester':
        semester = 'Ganjil' if periode_info.get('semester') == 'ganjil' else 'Genap'
        return f"Semester {semester} {periode_info.get('year')}"
        
    elif periode_type == 'yearly':
        return f"Tahun {periode_info.get('year')}"
        
    elif periode_type == 'custom':
        return f"{periode_info.get('startDate')} s/d {periode_info.get('endDate')}"
    
    return "Periode Tidak Diketahui"

@app.route('/api/mahasiswa/<mhs_id>/sertifikat/history', methods=['GET'])
def get_sertifikat_history(mhs_id):
    """Get certificate generation history"""
    try:
        query = """
            SELECT * FROM sertifikat_history 
            WHERE mahasiswa_id = %s 
            ORDER BY created_at DESC
        """
        
        history = db._execute(query, (mhs_id,), fetch_all=True)
        return ok(history or [])
        
    except Exception as e:
        logger.error(f"Error getting sertifikat history: {e}")
        return err(f'Gagal memuat riwayat sertifikat: {str(e)}', 500)