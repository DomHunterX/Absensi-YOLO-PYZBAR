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
        
        # Tabel untuk pengajuan izin/sakit
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS izin_submissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                mahasiswa_id VARCHAR(50) NOT NULL,
                submission_type ENUM('izin', 'sakit') NOT NULL,
                date DATE NOT NULL,
                keterangan TEXT NOT NULL,
                bukti_path TEXT,
                status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
                verified_by VARCHAR(100),
                verified_at DATETIME,
                rejection_reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_mahasiswa (mahasiswa_id),
                INDEX idx_date (date),
                INDEX idx_status (status),
                INDEX idx_created (created_at),
                FOREIGN KEY (mahasiswa_id) REFERENCES mahasiswa(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)
        
        # Tabel untuk pengajuan kehadiran manual
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS kehadiran_submissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                mahasiswa_id VARCHAR(50) NOT NULL,
                date DATE NOT NULL,
                check_in_time TIME NOT NULL,
                check_out_time TIME NOT NULL,
                keterangan TEXT NOT NULL,
                bukti_path TEXT NOT NULL,
                status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
                verified_by VARCHAR(100),
                verified_at DATETIME,
                rejection_reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_mahasiswa (mahasiswa_id),
                INDEX idx_date (date),
                INDEX idx_status (status),
                INDEX idx_created (created_at),
                FOREIGN KEY (mahasiswa_id) REFERENCES mahasiswa(id) ON DELETE CASCADE
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

    # ===== IZIN/SAKIT SUBMISSION METHODS =====
    
    def submit_izin(self, mahasiswa_id, submission_type, date_str, keterangan, bukti_path=None):
        """Submit pengajuan izin/sakit oleh mahasiswa"""
        query = """
            INSERT INTO izin_submissions 
            (mahasiswa_id, submission_type, date, keterangan, bukti_path, status)
            VALUES (%s, %s, %s, %s, %s, 'pending')
        """
        
        submission_id = self._execute(
            query, 
            (mahasiswa_id, submission_type, date_str, keterangan, bukti_path)
        )
        
        logger.info(f"Pengajuan {submission_type} disubmit: {mahasiswa_id} untuk tanggal {date_str}")
        return submission_id
    
    def get_all_izin_submissions(self, status=None):
        """Get semua pengajuan izin/sakit (untuk Timdis)"""
        if status:
            query = """
                SELECT i.*, m.name, m.kelompok, m.jurusan
                FROM izin_submissions i
                JOIN mahasiswa m ON i.mahasiswa_id = m.id
                WHERE i.status = %s
                ORDER BY i.created_at DESC
            """
            return self._execute(query, (status,), fetch_all=True) or []
        else:
            query = """
                SELECT i.*, m.name, m.kelompok, m.jurusan
                FROM izin_submissions i
                JOIN mahasiswa m ON i.mahasiswa_id = m.id
                ORDER BY i.created_at DESC
            """
            return self._execute(query, fetch_all=True) or []
    
    def get_izin_by_mahasiswa(self, mahasiswa_id):
        """Get pengajuan izin/sakit by mahasiswa ID"""
        query = """
            SELECT i.*, m.name, m.kelompok
            FROM izin_submissions i
            JOIN mahasiswa m ON i.mahasiswa_id = m.id
            WHERE i.mahasiswa_id = %s
            ORDER BY i.created_at DESC
        """
        return self._execute(query, (mahasiswa_id,), fetch_all=True) or []
    
    def verify_izin(self, submission_id, action, verified_by, rejection_reason=None):
        """Verifikasi pengajuan izin/sakit oleh Timdis (approve/reject)"""
        now = datetime.now()
        
        # Get submission details
        submission = self._execute(
            "SELECT * FROM izin_submissions WHERE id = %s",
            (submission_id,),
            fetch_one=True
        )
        
        if not submission:
            return {'status': 'error', 'message': 'Pengajuan tidak ditemukan'}
        
        if submission['status'] != 'pending':
            return {'status': 'error', 'message': f'Pengajuan sudah {submission["status"]}'}
        
        # Update submission status
        if action == 'approve':
            self._execute("""
                UPDATE izin_submissions 
                SET status = 'approved', verified_by = %s, verified_at = %s
                WHERE id = %s
            """, (verified_by, now.isoformat(), submission_id))
            
            # Update attendance status
            mahasiswa_id = submission['mahasiswa_id']
            date_str = submission['date'].isoformat() if hasattr(submission['date'], 'isoformat') else str(submission['date'])
            submission_type = submission['submission_type']
            
            # Check if attendance record exists
            existing = self._execute(
                "SELECT * FROM attendance WHERE mahasiswa_id = %s AND date = %s",
                (mahasiswa_id, date_str),
                fetch_one=True
            )
            
            if existing:
                # Update existing record
                self._execute("""
                    UPDATE attendance 
                    SET status = %s, notes = %s
                    WHERE mahasiswa_id = %s AND date = %s
                """, (submission_type, f"Disetujui: {submission['keterangan']}", mahasiswa_id, date_str))
            else:
                # Create new attendance record
                self._execute("""
                    INSERT INTO attendance 
                    (mahasiswa_id, date, status, notes, camera_id)
                    VALUES (%s, %s, %s, %s, 'IZIN-SYSTEM')
                """, (mahasiswa_id, date_str, submission_type, f"Disetujui: {submission['keterangan']}"))
            
            logger.info(f"Pengajuan #{submission_id} APPROVED oleh {verified_by}")
            return {'status': 'approved', 'message': 'Pengajuan disetujui'}
            
        elif action == 'reject':
            self._execute("""
                UPDATE izin_submissions 
                SET status = 'rejected', verified_by = %s, verified_at = %s, rejection_reason = %s
                WHERE id = %s
            """, (verified_by, now.isoformat(), rejection_reason, submission_id))
            
            logger.info(f"Pengajuan #{submission_id} REJECTED oleh {verified_by}")
            return {'status': 'rejected', 'message': 'Pengajuan ditolak'}
        
        return {'status': 'error', 'message': 'Action tidak valid'}
    
    def get_izin_stats(self):
        """Get statistik pengajuan izin/sakit"""
        stats = {}
        
        # Total pending
        pending = self._execute(
            "SELECT COUNT(*) as cnt FROM izin_submissions WHERE status = 'pending'",
            fetch_one=True
        )
        stats['pending'] = pending['cnt'] if pending else 0
        
        # Total approved
        approved = self._execute(
            "SELECT COUNT(*) as cnt FROM izin_submissions WHERE status = 'approved'",
            fetch_one=True
        )
        stats['approved'] = approved['cnt'] if approved else 0
        
        # Total rejected
        rejected = self._execute(
            "SELECT COUNT(*) as cnt FROM izin_submissions WHERE status = 'rejected'",
            fetch_one=True
        )
        stats['rejected'] = rejected['cnt'] if rejected else 0
        
        return stats

    # ─── Kehadiran Manual Functions ──────────────────────────────────────────────
    def submit_kehadiran_manual(self, mahasiswa_id, date, check_in_time, check_out_time, keterangan, bukti_path=None):
        """Submit pengajuan kehadiran manual"""
        query = """
            INSERT INTO kehadiran_submissions 
            (mahasiswa_id, date, check_in_time, check_out_time, keterangan, bukti_path, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'pending')
        """
        
        submission_id = self._execute(query, (mahasiswa_id, date, check_in_time, check_out_time, keterangan, bukti_path))
        logger.info(f"Kehadiran manual submitted: {mahasiswa_id} - {date}")
        return submission_id
    
    def get_kehadiran_submissions(self, status=''):
        """Get semua pengajuan kehadiran manual (untuk Timdis)"""
        if status:
            query = """
                SELECT 
                    ks.id, ks.mahasiswa_id, ks.date, ks.check_in_time, ks.check_out_time,
                    ks.keterangan, ks.bukti_path, ks.status, ks.verified_by, ks.verified_at,
                    ks.rejection_reason, ks.created_at,
                    m.name, m.kelompok, m.jurusan
                FROM kehadiran_submissions ks
                JOIN mahasiswa m ON ks.mahasiswa_id = m.id
                WHERE ks.status = %s
                ORDER BY ks.created_at DESC
            """
            return self._execute(query, (status,), fetch_all=True) or []
        else:
            query = """
                SELECT 
                    ks.id, ks.mahasiswa_id, ks.date, ks.check_in_time, ks.check_out_time,
                    ks.keterangan, ks.bukti_path, ks.status, ks.verified_by, ks.verified_at,
                    ks.rejection_reason, ks.created_at,
                    m.name, m.kelompok, m.jurusan
                FROM kehadiran_submissions ks
                JOIN mahasiswa m ON ks.mahasiswa_id = m.id
                ORDER BY ks.created_at DESC
            """
            return self._execute(query, fetch_all=True) or []
    
    def verify_kehadiran_submission(self, submission_id, action, verified_by, reject_reason=''):
        """Verifikasi pengajuan kehadiran (approve/reject)"""
        if action == 'approve':
            # Update status ke approved
            query = """
                UPDATE kehadiran_submissions 
                SET status = 'approved', verified_by = %s, verified_at = NOW()
                WHERE id = %s
            """
            self._execute(query, (verified_by, submission_id))
            
            # Ambil data submission
            sub = self._execute(
                "SELECT * FROM kehadiran_submissions WHERE id = %s",
                (submission_id,),
                fetch_one=True
            )
            
            if sub:
                # Insert ke tabel attendance sebagai kehadiran manual
                att_query = """
                    INSERT INTO attendance 
                    (mahasiswa_id, date, check_in, check_out, status, notes)
                    VALUES (%s, %s, %s, %s, 'manual', %s)
                """
                check_in_datetime = f"{sub['date']} {sub['check_in_time']}"
                check_out_datetime = f"{sub['date']} {sub['check_out_time']}" if sub['check_out_time'] else None
                notes = f"Kehadiran manual - {sub['keterangan']}"
                
                self._execute(att_query, (
                    sub['mahasiswa_id'],
                    sub['date'],
                    check_in_datetime,
                    check_out_datetime,
                    notes
                ))
                
            logger.info(f"Kehadiran approved: submission #{submission_id}")
            return True
            
        elif action == 'reject':
            query = """
                UPDATE kehadiran_submissions 
                SET status = 'rejected', verified_by = %s, verified_at = NOW(), rejection_reason = %s
                WHERE id = %s
            """
            self._execute(query, (verified_by, reject_reason, submission_id))
            logger.info(f"Kehadiran rejected: submission #{submission_id}")
            return True
        
        return False
    
    def get_kehadiran_by_mahasiswa(self, mahasiswa_id):
        """Get riwayat pengajuan kehadiran manual by mahasiswa"""
        query = """
            SELECT 
                ks.id, ks.mahasiswa_id, ks.date, ks.check_in_time, ks.check_out_time,
                ks.keterangan, ks.bukti_path, ks.status, ks.verified_by, ks.verified_at,
                ks.rejection_reason, ks.created_at,
                m.name, m.kelompok, m.jurusan
            FROM kehadiran_submissions ks
            JOIN mahasiswa m ON ks.mahasiswa_id = m.id
            WHERE ks.mahasiswa_id = %s
            ORDER BY ks.created_at DESC
        """
        return self._execute(query, (mahasiswa_id,), fetch_all=True) or []
