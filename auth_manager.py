"""
Authentication & Authorization Manager
Mengelola user authentication, session, dan role-based access control
"""

import bcrypt
import secrets
from datetime import datetime, timedelta
from database_manager import DatabaseManager
import logging

logger = logging.getLogger('AuthManager')

class AuthManager:
    def __init__(self, db_manager: DatabaseManager):
        self.db = db_manager
        self._init_auth_tables()
        self._create_default_admin()
    
    def _init_auth_tables(self):
        """Inisialisasi tabel users dan sessions"""
        conn = self.db._get_conn()
        cursor = conn.cursor()
        
        # Tabel users
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                role ENUM('admin', 'timdis', 'mahasiswa') NOT NULL DEFAULT 'mahasiswa',
                mahasiswa_id VARCHAR(50),
                is_active TINYINT(1) DEFAULT 1,
                last_login DATETIME,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_username (username),
                INDEX idx_role (role),
                INDEX idx_mahasiswa (mahasiswa_id),
                FOREIGN KEY (mahasiswa_id) REFERENCES mahasiswa(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)
        
        # Tabel sessions
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                session_token VARCHAR(255) UNIQUE NOT NULL,
                ip_address VARCHAR(45),
                user_agent TEXT,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_token (session_token),
                INDEX idx_user (user_id),
                INDEX idx_expires (expires_at),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)
        
        # Tabel login_attempts (untuk security - rate limiting)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS login_attempts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                ip_address VARCHAR(45),
                success TINYINT(1) DEFAULT 0,
                attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_username (username),
                INDEX idx_ip (ip_address),
                INDEX idx_attempted (attempted_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)
        
        conn.commit()
        cursor.close()
        conn.close()
        logger.info("Tabel authentication berhasil diinisialisasi")
    
    def _create_default_admin(self):
        """Buat default admin jika belum ada"""
        existing = self.db._execute(
            "SELECT id FROM users WHERE role = 'admin' LIMIT 1",
            fetch_one=True
        )
        
        if not existing:
            # Create default admin: username=admin, password=admin123
            self.create_user(
                username='admin',
                password='admin123',
                full_name='Administrator',
                email='admin@siabsen.local',
                role='admin'
            )
            logger.info("[OK] Default admin created: username=admin, password=admin123")
    
    def hash_password(self, password: str) -> str:
        """Hash password menggunakan bcrypt"""
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    
    def verify_password(self, password: str, password_hash: str) -> bool:
        """Verifikasi password dengan hash"""
        try:
            return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
        except Exception as e:
            logger.error(f"Error verifying password: {e}")
            return False
    
    def create_user(self, username: str, password: str, full_name: str, 
                   email: str = '', role: str = 'mahasiswa', mahasiswa_id: str = None) -> dict:
        """
        Buat user baru
        Returns: {'success': bool, 'message': str, 'user_id': int}
        """
        try:
            # Validasi username unique
            existing = self.db._execute(
                "SELECT id FROM users WHERE username = %s",
                (username,),
                fetch_one=True
            )
            if existing:
                return {'success': False, 'message': 'Username sudah digunakan'}
            
            # Validasi role
            if role not in ['admin', 'timdis', 'mahasiswa']:
                return {'success': False, 'message': 'Role tidak valid'}
            
            # Jika role mahasiswa, validasi mahasiswa_id
            if role == 'mahasiswa':
                if not mahasiswa_id:
                    return {'success': False, 'message': 'mahasiswa_id wajib untuk role mahasiswa'}
                
                # Check mahasiswa exists
                mhs = self.db._execute(
                    "SELECT id FROM mahasiswa WHERE id = %s",
                    (mahasiswa_id,),
                    fetch_one=True
                )
                if not mhs:
                    return {'success': False, 'message': 'Mahasiswa tidak ditemukan'}
                
                # Check if mahasiswa already has user account
                existing_mhs = self.db._execute(
                    "SELECT id FROM users WHERE mahasiswa_id = %s",
                    (mahasiswa_id,),
                    fetch_one=True
                )
                if existing_mhs:
                    return {'success': False, 'message': 'Mahasiswa sudah memiliki akun'}
            
            # Hash password
            password_hash = self.hash_password(password)
            
            # Insert user
            user_id = self.db._execute("""
                INSERT INTO users (username, password_hash, full_name, email, role, mahasiswa_id)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (username, password_hash, full_name, email, role, mahasiswa_id))
            
            logger.info(f"User created: {username} (role: {role})")
            return {'success': True, 'message': 'User berhasil dibuat', 'user_id': user_id}
            
        except Exception as e:
            logger.error(f"Error creating user: {e}")
            return {'success': False, 'message': f'Gagal membuat user: {str(e)}'}
    
    def authenticate(self, username: str, password: str, ip_address: str = None) -> dict:
        """
        Authenticate user
        Returns: {'success': bool, 'message': str, 'user': dict, 'session_token': str}
        """
        try:
            # Log attempt
            self.db._execute("""
                INSERT INTO login_attempts (username, ip_address, success)
                VALUES (%s, %s, 0)
            """, (username, ip_address))
            
            # Check rate limiting (max 5 failed attempts in 15 minutes)
            recent_attempts = self.db._execute("""
                SELECT COUNT(*) as count FROM login_attempts
                WHERE username = %s AND success = 0
                AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
            """, (username,), fetch_one=True)
            
            if recent_attempts and recent_attempts['count'] >= 5:
                return {
                    'success': False,
                    'message': 'Terlalu banyak percobaan login gagal. Coba lagi dalam 15 menit.'
                }
            
            # Get user
            user = self.db._execute("""
                SELECT id, username, password_hash, full_name, email, role, mahasiswa_id, is_active
                FROM users WHERE username = %s
            """, (username,), fetch_one=True)
            
            if not user:
                return {'success': False, 'message': 'Username atau password salah'}
            
            if not user['is_active']:
                return {'success': False, 'message': 'Akun tidak aktif'}
            
            # Verify password
            if not self.verify_password(password, user['password_hash']):
                return {'success': False, 'message': 'Username atau password salah'}
            
            # Update last login
            self.db._execute("""
                UPDATE users SET last_login = NOW() WHERE id = %s
            """, (user['id'],))
            
            # Log successful attempt
            self.db._execute("""
                UPDATE login_attempts SET success = 1
                WHERE username = %s
                ORDER BY attempted_at DESC LIMIT 1
            """, (username,))
            
            # Create session
            session_token = self.create_session(user['id'], ip_address)
            
            # Remove password_hash from response
            del user['password_hash']
            
            logger.info(f"[OK] Login successful: {username} (role: {user['role']})")
            
            return {
                'success': True,
                'message': 'Login berhasil',
                'user': user,
                'session_token': session_token
            }
            
        except Exception as e:
            logger.error(f"Error authenticating user: {e}")
            return {'success': False, 'message': f'Gagal login: {str(e)}'}
    
    def create_session(self, user_id: int, ip_address: str = None, 
                      user_agent: str = None, expires_hours: int = 24) -> str:
        """Buat session token untuk user"""
        try:
            # Generate secure token
            session_token = secrets.token_urlsafe(32)
            
            # Calculate expiry
            expires_at = datetime.now() + timedelta(hours=expires_hours)
            
            # Insert session
            self.db._execute("""
                INSERT INTO sessions (user_id, session_token, ip_address, user_agent, expires_at)
                VALUES (%s, %s, %s, %s, %s)
            """, (user_id, session_token, ip_address, user_agent, expires_at.isoformat()))
            
            # Clean up old sessions for this user (keep only last 5)
            self.db._execute("""
                DELETE FROM sessions
                WHERE user_id = %s
                AND id NOT IN (
                    SELECT id FROM (
                        SELECT id FROM sessions
                        WHERE user_id = %s
                        ORDER BY created_at DESC
                        LIMIT 5
                    ) tmp
                )
            """, (user_id, user_id))
            
            return session_token
            
        except Exception as e:
            logger.error(f"Error creating session: {e}")
            return None
    
    def validate_session(self, session_token: str) -> dict:
        """
        Validasi session token
        Returns: {'valid': bool, 'user': dict or None}
        """
        try:
            if not session_token:
                return {'valid': False, 'user': None}
            
            # Get session with user info
            result = self.db._execute("""
                SELECT 
                    s.id as session_id,
                    s.user_id,
                    s.expires_at,
                    u.username,
                    u.full_name,
                    u.email,
                    u.role,
                    u.mahasiswa_id,
                    u.is_active
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.session_token = %s
            """, (session_token,), fetch_one=True)
            
            if not result:
                return {'valid': False, 'user': None}
            
            # Check if expired
            expires_at = result['expires_at']
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            
            if datetime.now() > expires_at:
                # Delete expired session
                self.db._execute("DELETE FROM sessions WHERE id = %s", (result['session_id'],))
                return {'valid': False, 'user': None}
            
            # Check if user is active
            if not result['is_active']:
                return {'valid': False, 'user': None}
            
            # Return user info
            user = {
                'user_id': result['user_id'],
                'username': result['username'],
                'full_name': result['full_name'],
                'email': result['email'],
                'role': result['role'],
                'mahasiswa_id': result['mahasiswa_id']
            }
            
            return {'valid': True, 'user': user}
            
        except Exception as e:
            logger.error(f"Error validating session: {e}")
            return {'valid': False, 'user': None}
    
    def logout(self, session_token: str) -> bool:
        """Logout user (delete session)"""
        try:
            self.db._execute("""
                DELETE FROM sessions WHERE session_token = %s
            """, (session_token,))
            return True
        except Exception as e:
            logger.error(f"Error logging out: {e}")
            return False
    
    def change_password(self, user_id: int, old_password: str, new_password: str) -> dict:
        """Ganti password user"""
        try:
            # Get current password hash
            user = self.db._execute("""
                SELECT password_hash FROM users WHERE id = %s
            """, (user_id,), fetch_one=True)
            
            if not user:
                return {'success': False, 'message': 'User tidak ditemukan'}
            
            # Verify old password
            if not self.verify_password(old_password, user['password_hash']):
                return {'success': False, 'message': 'Password lama salah'}
            
            # Hash new password
            new_hash = self.hash_password(new_password)
            
            # Update password
            self.db._execute("""
                UPDATE users SET password_hash = %s WHERE id = %s
            """, (new_hash, user_id))
            
            # Invalidate all sessions for this user (force re-login)
            self.db._execute("""
                DELETE FROM sessions WHERE user_id = %s
            """, (user_id,))
            
            logger.info(f"Password changed for user_id: {user_id}")
            return {'success': True, 'message': 'Password berhasil diubah'}
            
        except Exception as e:
            logger.error(f"Error changing password: {e}")
            return {'success': False, 'message': f'Gagal mengubah password: {str(e)}'}
    
    def get_user_by_id(self, user_id: int) -> dict:
        """Get user by ID"""
        return self.db._execute("""
            SELECT id, username, full_name, email, role, mahasiswa_id, is_active, last_login, created_at
            FROM users WHERE id = %s
        """, (user_id,), fetch_one=True)
    
    def get_all_users(self, role: str = None) -> list:
        """Get all users, optionally filtered by role"""
        if role:
            return self.db._execute("""
                SELECT id, username, full_name, email, role, mahasiswa_id, is_active, last_login, created_at
                FROM users WHERE role = %s
                ORDER BY created_at DESC
            """, (role,), fetch_all=True) or []
        else:
            return self.db._execute("""
                SELECT id, username, full_name, email, role, mahasiswa_id, is_active, last_login, created_at
                FROM users
                ORDER BY created_at DESC
            """, fetch_all=True) or []
    
    def update_user(self, user_id: int, full_name: str = None, email: str = None) -> dict:
        """Update user profile"""
        try:
            updates = []
            params = []
            
            if full_name:
                updates.append("full_name = %s")
                params.append(full_name)
            
            if email is not None:
                updates.append("email = %s")
                params.append(email)
            
            if not updates:
                return {'success': False, 'message': 'Tidak ada data yang diupdate'}
            
            params.append(user_id)
            query = f"UPDATE users SET {', '.join(updates)} WHERE id = %s"
            
            self.db._execute(query, tuple(params))
            
            return {'success': True, 'message': 'Profil berhasil diupdate'}
            
        except Exception as e:
            logger.error(f"Error updating user: {e}")
            return {'success': False, 'message': f'Gagal update profil: {str(e)}'}
    
    def deactivate_user(self, user_id: int) -> bool:
        """Deactivate user account"""
        try:
            self.db._execute("""
                UPDATE users SET is_active = 0 WHERE id = %s
            """, (user_id,))
            
            # Delete all sessions
            self.db._execute("""
                DELETE FROM sessions WHERE user_id = %s
            """, (user_id,))
            
            return True
        except Exception as e:
            logger.error(f"Error deactivating user: {e}")
            return False
    
    def activate_user(self, user_id: int) -> bool:
        """Activate user account"""
        try:
            self.db._execute("""
                UPDATE users SET is_active = 1 WHERE id = %s
            """, (user_id,))
            return True
        except Exception as e:
            logger.error(f"Error activating user: {e}")
            return False
    
    def cleanup_expired_sessions(self):
        """Cleanup expired sessions (run periodically)"""
        try:
            deleted = self.db._execute("""
                DELETE FROM sessions WHERE expires_at < NOW()
            """)
            if deleted:
                logger.info(f"Cleaned up {deleted} expired sessions")
        except Exception as e:
            logger.error(f"Error cleaning up sessions: {e}")
