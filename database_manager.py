import mysql.connector
from datetime import datetime, date
import logging
from config_db import MYSQL_CONFIG

logger = logging.getLogger('DatabaseManager')

class DatabaseManager:
    def __init__(self):
        logger.info(f"Menggunakan MySQL: {MYSQL_CONFIG['host']}:{MYSQL_CONFIG['port']}/{MYSQL_CONFIG['database']}")
        self._init_db()

    def _get_conn(self):
        """Dapatkan koneksi MySQL"""
        return mysql.connector.connect(**MYSQL_CONFIG)

    def _execute(self, query, params=None, fetch_one=False, fetch_all=False):
        """Execute query MySQL"""
        conn = self._get_conn()
        cursor = conn.cursor()
        
        try:
            # Convert ? ke %s untuk MySQL
            if params:
                query = query.replace('?', '%s')
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            
            result = None
            if fetch_one:
                row = cursor.fetchone()
                if row:
                    columns = [desc[0] for desc in cursor.description]
                    result = dict(zip(columns, row))
            elif fetch_all:
                rows = cursor.fetchall()
                columns = [desc[0] for desc in cursor.description]
                result = [dict(zip(columns, row)) for row in rows]
            else:
                conn.commit()
                result = cursor.lastrowid
            
            return result
        finally:
            cursor.close()
            conn.close()

    def _init_db(self):
        """Inisialisasi database MySQL"""
        conn = self._get_conn()
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS mahasiswa (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                kelompok VARCHAR(100) NOT NULL,
                jurusan VARCHAR(100) NOT NULL,
                email VARCHAR(255),
                qr_code_id VARCHAR(100) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active TINYINT(1) DEFAULT 1,
                INDEX idx_qr_code (qr_code_id),
                INDEX idx_active (is_active)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance (
                id INT AUTO_INCREMENT PRIMARY KEY,
                mahasiswa_id VARCHAR(50) NOT NULL,
                check_in DATETIME,
                check_out DATETIME,
                date DATE NOT NULL,
                status VARCHAR(20) DEFAULT 'present',
                camera_id VARCHAR(50),
                snapshot_path TEXT,
                yolo_confidence FLOAT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_date (date),
                INDEX idx_mahasiswa (mahasiswa_id),
                INDEX idx_checkin (check_in)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS camera_streams (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                rtsp_url TEXT NOT NULL,
                location VARCHAR(255),
                is_active TINYINT(1) DEFAULT 1,
                last_seen DATETIME,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_active (is_active)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS system_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                level VARCHAR(20),
                message TEXT,
                camera_id VARCHAR(50),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_timestamp (timestamp),
                INDEX idx_level (level)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)
        
        conn.commit()
        cursor.close()
        conn.close()
        logger.info("Database MySQL diinisialisasi.")

    def add_mahasiswa(self, mhs_id, name, kelompok, jurusan, email=''):
        """Tambah mahasiswa baru"""
        qr_code_id = f"{mhs_id}"
        
        query = """
            INSERT INTO mahasiswa (id, name, kelompok, jurusan, email, qr_code_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
            name=VALUES(name), kelompok=VALUES(kelompok), jurusan=VALUES(jurusan),
            email=VALUES(email)
        """
        
        self._execute(query, (mhs_id, name, kelompok, jurusan, email, qr_code_id))
        logger.info(f"Mahasiswa ditambahkan: {name} ({mhs_id})")
        return qr_code_id

    def get_mahasiswa_by_qr(self, qr_code_id: str):
        """Cari mahasiswa berdasarkan QR code"""
        query = "SELECT * FROM mahasiswa WHERE qr_code_id = %s AND is_active = 1"
        return self._execute(query, (qr_code_id,), fetch_one=True)

    def record_attendance(self, mahasiswa_id, action, camera_id, snapshot_path, confidence):
        """Record kehadiran"""
        today = date.today().isoformat()
        now = datetime.now()
        
        # Cek existing attendance
        existing = self._execute(
            "SELECT * FROM attendance WHERE mahasiswa_id = %s AND date = %s",
            (mahasiswa_id, today),
            fetch_one=True
        )

        if action == 'check_in':
            if existing:
                logger.info(f"[{mahasiswa_id}] Sudah absen masuk hari ini.")
                return {'status': 'already_checked_in', 'time': existing['check_in']}
            
            self._execute("""
                INSERT INTO attendance (mahasiswa_id, check_in, date, status, camera_id, snapshot_path, yolo_confidence)
                VALUES (%s, %s, %s, 'present', %s, %s, %s)
            """, (mahasiswa_id, now.isoformat(), today, camera_id, snapshot_path, confidence))
            return {'status': 'checked_in', 'time': now.isoformat()}

        elif action == 'check_out':
            if not existing:
                logger.warning(f"[{mahasiswa_id}] Belum absen masuk!")
                return {'status': 'not_checked_in'}
            if existing['check_out']:
                return {'status': 'already_checked_out', 'time': existing['check_out']}
            
            self._execute("""
                UPDATE attendance SET check_out = %s, snapshot_path = %s
                WHERE mahasiswa_id = %s AND date = %s
            """, (now.isoformat(), snapshot_path, mahasiswa_id, today))
            return {'status': 'checked_out', 'time': now.isoformat()}

    def get_today_attendance(self):
        """Ambil data absensi hari ini"""
        today = date.today().isoformat()
        query = """
            SELECT a.*, m.name, m.kelompok, m.jurusan
            FROM attendance a
            JOIN mahasiswa m ON a.mahasiswa_id = m.id
            WHERE a.date = %s
            ORDER BY a.check_in DESC
        """
        return self._execute(query, (today,), fetch_all=True) or []

    def get_attendance_stats(self, target_date=None):
        """Statistik kehadiran"""
        if not target_date:
            target_date = date.today().isoformat()
        
        total_mhs = self._execute(
            "SELECT COUNT(*) as cnt FROM mahasiswa WHERE is_active=1",
            fetch_one=True
        )['cnt']
        
        present = self._execute(
            "SELECT COUNT(DISTINCT mahasiswa_id) as cnt FROM attendance WHERE date=%s AND check_in IS NOT NULL",
            (target_date,),
            fetch_one=True
        )['cnt']
        
        checked_out = self._execute(
            "SELECT COUNT(*) as cnt FROM attendance WHERE date=%s AND check_out IS NOT NULL",
            (target_date,),
            fetch_one=True
        )['cnt']
        
        return {
            'date': target_date,
            'total_mahasiswa': total_mhs,
            'present': present,
            'absent': total_mhs - present,
            'checked_out': checked_out,
            'still_in': present - checked_out
        }

    def add_camera(self, cam_id, name, rtsp_url, location=''):
        """Tambah kamera"""
        query = """
            INSERT INTO camera_streams (id, name, rtsp_url, location)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
            name=VALUES(name), rtsp_url=VALUES(rtsp_url), location=VALUES(location)
        """
        
        self._execute(query, (cam_id, name, rtsp_url, location))
        logger.info(f"Kamera ditambahkan: {name} ({cam_id})")

    def update_camera_seen(self, cam_id):
        """Update last seen kamera"""
        self._execute(
            "UPDATE camera_streams SET last_seen = %s WHERE id = %s",
            (datetime.now().isoformat(), cam_id)
        )
