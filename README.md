# SIABSEN — Sistem Absensi Mahasiswa

Sistem absensi otomatis menggunakan **YOLO object detection** untuk mendeteksi **QR code paper** dan **pyzbar** untuk decode QR code, terintegrasi dengan **Webcam Lokal**, **Upload Video MP4**, **Form Pengajuan Izin/Sakit**, **Authentication System**, **Role-Based Access Control (RBAC)**, dan **MySQL database**.

## 📋 Fitur Utama

### 1. 📹 Real-time Webcam Monitoring
- Deteksi QR code dari webcam lokal (built-in atau USB)
- Auto-detect available webcams
- Multi-camera support (multiple USB webcams)
- Live preview dengan bounding box
- Auto check-in/check-out
- Simplified setup (no RTSP configuration needed)

### 2. 🎬 Upload & Deteksi Video MP4
- Upload video rekaman untuk deteksi offline
- Preview video dengan bounding box real-time
- Batch processing untuk multiple QR codes
- Validasi duplikasi

### 3. 📝 Form Pengajuan Izin/Sakit & Kehadiran Manual
- Pengajuan izin/sakit dengan upload bukti
- Pengajuan kehadiran manual
- Verifikasi oleh Tim Disiplin (Timdis)
- Riwayat pengajuan dengan status real-time

### 4. 📊 Dashboard & Reporting
- Statistik kehadiran real-time
- Export data ke CSV
- Grafik kehadiran per kelompok
- Material Icons untuk UI yang clean

### 5. 🔐 Authentication & Authorization
- Login/Logout dengan session management
- Password hashing menggunakan bcrypt
- Role-Based Access Control (Admin, Timdis, Mahasiswa)
- Session token dengan expiry 24 jam

## 🚀 Quick Start

### Prerequisites

- **Python 3.11+**
- **MySQL 8.0+**
- **Webcam** (built-in atau USB)
- **OS**: Windows 10+, Ubuntu 22.04+, atau macOS

### Instalasi

```bash
# 1. Clone repository
git clone <repository-url>
cd siabsen

# 2. Buat virtual environment
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Install library sistem (Ubuntu/Debian)
sudo apt install -y libzbar0 libzbar-dev ffmpeg libgl1-mesa-glx mysql-server
```

### Setup MySQL

```bash
# Buat database
mysql -u root -p
```

```sql
CREATE DATABASE siabsen CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'siabsen'@'localhost' IDENTIFIED BY 'password_anda';
GRANT ALL PRIVILEGES ON siabsen.* TO 'siabsen'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Konfigurasi Database

Edit `app/config_db.py`:
```python
MYSQL_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'siabsen',
    'password': 'password_anda',  # Ganti!
    'database': 'siabsen',
}
```

### Jalankan Aplikasi

```bash
# Start API Server
python run.py
```

Server akan otomatis:
- Membuat tabel database
- Membuat default admin: `admin` / `admin123`

Akses aplikasi:
- **Login**: http://localhost:5000/login
- **Dashboard**: http://localhost:5000
- **Portal Mahasiswa**: http://localhost:5000/mahasiswa
- **Monitor**: http://localhost:5000/monitor

### First Login

1. Buka http://localhost:5000/login
2. Login dengan:
   - **Username**: `admin`
   - **Password**: `admin123`
3. ⚠️ **PENTING**: Ganti password default setelah login pertama!

## 📁 Struktur Project

```
siabsen/
├── app/                          # Aplikasi utama
│   ├── __init__.py
│   ├── api_server.py            # Flask API server
│   ├── attendance_engine.py     # Core engine (YOLO + QR)
│   ├── database_manager.py      # MySQL database manager
│   ├── auth_manager.py          # Authentication & RBAC
│   └── config_db.py             # Database configuration
│
├── templates/                    # HTML templates
│   ├── dashboard.html           # Admin/Timdis dashboard
│   ├── mahasiswa.html           # Portal mahasiswa
│   ├── monitor.html             # Live monitoring
│   └── login.html               # Login page
│
├── static/                       # Static assets
│   ├── css/                     # Stylesheets
│   ├── js/                      # JavaScript files
│   ├── img/                     # Images
│   └── sounds/                  # Sound notifications
│
├── scripts/                      # Utility scripts
│   └── create_users.py          # User management script
│
├── data/                         # Runtime data
│   ├── qrcodes/                 # Generated QR codes
│   ├── snapshots/               # Attendance snapshots
│   ├── uploads/                 # Uploaded videos
│   ├── bukti_izin/              # Bukti pengajuan
│   └── settings.json            # System settings
│
├── models/                       # YOLO models
│   └── qr_paper_model.pt        # Custom trained model
│
├── logs/                         # Application logs
│   └── attendance.log
│
├── docs/                         # Documentation
│   └── README.md                # Full documentation
│
├── run.py                        # Main entry point
├── requirements.txt              # Python dependencies
└── .gitignore
```

## 🎓 Training Model YOLO

Model default belum dilatih untuk mendeteksi QR code paper. Anda perlu melatih model custom terlebih dahulu.

Lihat dokumentasi lengkap di `docs/README.md` untuk panduan training.

## 🔐 User Management

### Create Default Users

```bash
# Create admin and timdis accounts
python scripts/create_users.py default

# Create accounts untuk semua mahasiswa
python scripts/create_users.py mahasiswa

# Create custom user (interactive)
python scripts/create_users.py custom

# List all users
python scripts/create_users.py list
```

### Roles & Permissions

| Role | Dashboard | Verifikasi | Manage Users | Settings | Portal Mahasiswa |
|------|-----------|------------|--------------|----------|------------------|
| **Admin** | ✅ Full | ✅ | ✅ | ✅ | ✅ |
| **Timdis** | ✅ Read | ✅ | ❌ | ❌ | ✅ |
| **Mahasiswa** | ❌ | ❌ | ❌ | ❌ | ✅ |

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/validate` - Validate session
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password

### User Management (Admin only)
- `GET /api/users` - List all users
- `POST /api/users` - Create new user
- `GET /api/users/<id>` - Get user by ID
- `PUT /api/users/<id>` - Update user
- `POST /api/users/<id>/activate` - Activate user
- `POST /api/users/<id>/deactivate` - Deactivate user
- `POST /api/users/<id>/reset-password` - Reset password

### Mahasiswa
- `GET /api/mahasiswa` - List semua mahasiswa
- `POST /api/mahasiswa` - Tambah mahasiswa baru
- `GET /api/mahasiswa/<id>/qr` - Get QR code mahasiswa
- `DELETE /api/mahasiswa/<id>` - Nonaktifkan mahasiswa

### Attendance
- `GET /api/attendance/today` - Absensi hari ini
- `GET /api/attendance/stats` - Statistik absensi
- `GET /api/attendance/history` - Riwayat absensi
- `POST /api/attendance/manual` - Manual attendance

### Video Upload
- `POST /api/video/preview_frames` - Preview frame video
- `POST /api/video/process` - Upload & proses video MP4

### Izin/Sakit
- `POST /api/izin/submit` - Submit pengajuan izin/sakit
- `GET /api/izin/list` - List semua pengajuan
- `POST /api/izin/verify` - Approve/Reject pengajuan
- `GET /api/izin/mahasiswa/<id>` - Riwayat per mahasiswa

### Kehadiran Manual
- `POST /api/kehadiran/submit` - Submit pengajuan kehadiran
- `GET /api/kehadiran/list` - List semua pengajuan
- `POST /api/kehadiran/verify` - Approve/Reject pengajuan
- `GET /api/kehadiran/mahasiswa/<id>` - Riwayat per mahasiswa

## 🐛 Troubleshooting

### Database Connection Error
```bash
# Check MySQL status
sudo systemctl status mysql

# Restart MySQL
sudo systemctl restart mysql

# Check credentials in app/config_db.py
```

### Import Error
```bash
# Make sure you're in the project root directory
cd /path/to/siabsen

# Activate virtual environment
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# Run the application
python run.py
```

### Webcam Not Detected
```bash
# Test webcam with OpenCV
python -c "import cv2; print(cv2.VideoCapture(0).isOpened())"

# If False, check:
# 1. Webcam is connected
# 2. Webcam drivers are installed
# 3. No other application is using the webcam
```

## 📝 License

Copyright © 2026 SIABSEN Team. All rights reserved.

## 👥 Team

- **Developer**: SIABSEN Development Team
- **Version**: 2.5.0
- **Last Updated**: May 2026
- **Major Changes**: 
  - v2.5.0: RTSP → Webcam refactoring
  - v2.4.0: Project restructuring

---

Untuk dokumentasi lengkap, lihat `docs/README.md`
