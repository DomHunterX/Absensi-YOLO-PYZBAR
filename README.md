# SIABSEN — Sistem Absensi Mahasiswa
*CATATAN UNTUK PENGEMBANG: SAAT INI MODEL YOLO YANG SUDAH DI TRAINING BELUM DI IMPORT*

Sistem absensi otomatis menggunakan **YOLO object detection** untuk mendeteksi **QR code paper** dan **pyzbar** untuk decode QR code, terintegrasi dengan **RTSP CCTV streams** dan **MySQL database**.

## 🎯 Cara Kerja Sistem

### Mode Deteksi: QR Code Paper

1. **YOLO mendeteksi kertas QR code** dalam frame CCTV
2. **Pyzbar decode QR code** dari area yang terdeteksi
3. **Sistem validasi** QR code dengan database mahasiswa
4. **Auto record** attendance (check-in/check-out)
5. **Cooldown mechanism** mencegah scan berulang (30 detik)

### Alur Proses

```
CCTV Stream → YOLO Detection (QR Paper) → QR Decode → Mahasiswa Lookup → Record Attendance
```

## ⚠️ PENTING: Training Model YOLO

**Model default (`yolov8n.pt`) BELUM dilatih untuk mendeteksi QR code paper!**

Anda perlu melatih model custom terlebih dahulu. Lihat panduan lengkap di:

📖 **[TRAINING_GUIDE.md](TRAINING_GUIDE.md)**

## 🚀 Quick Start

### Prerequisites

- **Python 3.11+**
- **MySQL 8.0+**
- **OS**: Ubuntu 22.04+ / Debian / Windows 10+

### Instalasi

```bash
# 1. Clone repository
git clone https://github.com/yourorg/siabsen.git
cd siabsen

# 2. Buat virtual environment
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Install library sistem (Ubuntu/Debian)
sudo apt install -y libzbar0 libzbar-dev ffmpeg libgl1-mesa-glx mysql-server
```

### Setup MySQL

```bash
# Buat database
sudo mysql -u root -p
```

```sql
CREATE DATABASE siabsen CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'siabsen'@'localhost' IDENTIFIED BY 'password_anda';
GRANT ALL PRIVILEGES ON siabsen.* TO 'siabsen'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Konfigurasi

Edit `config_db.py`:
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
python api_server.py
```

Akses dashboard: **http://localhost:5000**

## 📁 Struktur Project

```
.
├── attendance_engine.py      # Core engine (YOLO + QR + RTSP)
├── api_server.py             # Flask REST API
├── database_manager.py       # MySQL database manager
├── config_db.py              # Konfigurasi database MySQL
├── migrate_to_mysql.py       # Script migrasi dari SQLite (opsional)
├── dashboard.html            # Web dashboard
├── static/
│   ├── css/style.css        # UI styling
│   └── js/script.js         # Frontend logic
├── data/
│   ├── qrcodes/             # Generated QR codes mahasiswa
│   └── snapshots/           # Attendance snapshots
├── models/
│   └── yolov8n.pt          # YOLO model (perlu training!)
├── logs/
│   └── attendance.log       # System logs
├── MIGRASI_MYSQL.md         # Panduan setup MySQL
├── MYSQL_SETUP.md           # Dokumentasi lengkap MySQL
├── TRAINING_GUIDE.md        # Panduan training YOLO
└── requirements.txt
```

## 🌐 API Endpoints

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

### Cameras
- `GET /api/cameras` - List semua kamera
- `POST /api/cameras` - Tambah kamera
- `PUT /api/cameras/<id>` - Update kamera
- `DELETE /api/cameras/<id>` - Hapus kamera
- `GET /api/stream/<id>` - MJPEG stream

### Dashboard
- `GET /api/dashboard` - Data lengkap dashboard

## 👥 Menambah Mahasiswa

### Via Dashboard

1. Klik "+ Tambah Mahasiswa"
2. Isi data mahasiswa:
   - ID Mahasiswa (contoh: MHS001)
   - Nama Lengkap
   - Kelompok (contoh: A, B, C)
   - Jurusan (contoh: Teknik Informatika)
   - Email (opsional)
3. Sistem auto-generate QR code
4. Download dan cetak QR code

### Via API

```bash
curl -X POST http://localhost:5000/api/mahasiswa \
  -H "Content-Type: application/json" \
  -d '{
    "id": "MHS001",
    "name": "Budi Santoso",
    "kelompok": "A",
    "jurusan": "Teknik Informatika",
    "email": "budi@student.ac.id"
  }'
```

## 🎥 Menambah Kamera CCTV

### Via Dashboard

1. Buka dashboard: `http://localhost:5000`
2. Klik "Kamera CCTV"
3. Klik "+ Tambah Kamera"
4. Isi form dan submit

### Format URL RTSP

| Brand Kamera | Format URL |
|---|---|
| Hikvision | `rtsp://user:pass@ip:554/Streaming/Channels/101` |
| Dahua | `rtsp://user:pass@ip:554/cam/realmonitor?channel=1&subtype=0` |
| Axis | `rtsp://user:pass@ip/axis-media/media.amp` |
| Generic | `rtsp://user:pass@ip:554/stream1` |

## 📊 Monitoring

### Logs

```bash
tail -f logs/attendance.log
```

### Database MySQL

```bash
mysql -u siabsen -p siabsen
```

```sql
-- Cek attendance hari ini
SELECT * FROM attendance WHERE date = CURDATE();

-- Statistik per kelompok
SELECT m.kelompok, COUNT(*) as total
FROM attendance a
JOIN mahasiswa m ON a.mahasiswa_id = m.id
WHERE a.date = CURDATE()
GROUP BY m.kelompok;

-- List mahasiswa aktif
SELECT * FROM mahasiswa WHERE is_active = 1;
```

## 🗄️ Database Schema

### Tabel: mahasiswa
```sql
CREATE TABLE mahasiswa (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    kelompok VARCHAR(100) NOT NULL,
    jurusan VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    qr_code_id VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active TINYINT(1) DEFAULT 1
);
```

### Tabel: attendance
```sql
CREATE TABLE attendance (
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🐛 Troubleshooting

### Database MySQL

**Setup awal:**
Lihat panduan lengkap di [MIGRASI_MYSQL.md](MIGRASI_MYSQL.md)

**Error koneksi:**
```bash
# Cek status MySQL
sudo systemctl status mysql

# Start MySQL
sudo systemctl start mysql

# Cek kredensial di config_db.py
```

**Migrasi dari SQLite (jika ada data lama):**
```bash
python migrate_to_mysql.py
```

**Reset database:**
```sql
DROP DATABASE siabsen;
CREATE DATABASE siabsen CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```
Kemudian restart aplikasi untuk auto-create tabel.

### YOLO tidak mendeteksi QR paper

**Penyebab:** Model belum dilatih untuk QR paper

**Solusi:**
1. Ikuti panduan di `TRAINING_GUIDE.md`
2. Training model custom
3. Ganti model di `models/yolov8n.pt`

### RTSP stream tidak connect

**Solusi:**
1. Cek URL RTSP: `ffplay rtsp://...`
2. Pastikan kamera support RTSP
3. Cek firewall/network
4. Coba turunkan resolusi

### QR code tidak terbaca

**Solusi:**
1. Pastikan QR code jelas dan tidak blur
2. Cek pencahayaan
3. Jarak optimal: 50cm - 2m dari kamera
4. QR code minimal 5x5 cm

## 📈 Performance Tips

1. **Gunakan GPU** untuk YOLO inference
   ```bash
   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
   ```

2. **Optimize MySQL**
   ```sql
   -- Tambah index jika perlu
   CREATE INDEX idx_custom ON attendance(mahasiswa_id, date);
   
   -- Optimize tables
   OPTIMIZE TABLE mahasiswa, attendance;
   ```

3. **Skip frames** jika CPU terbatas (process setiap 2-3 frame)
4. **Resize frame** sebelum inference
5. **Gunakan yolov8n** (nano) untuk speed

## 🔐 Security Notes

1. **Ganti default credentials MySQL**
2. **Gunakan environment variables** untuk password
   ```bash
   # .env file
   MYSQL_PASSWORD=secure_password_here
   ```
3. **Gunakan HTTPS** untuk production
4. **Implement authentication** untuk API
5. **Backup database** secara berkala
   ```bash
   mysqldump -u siabsen -p siabsen > backup_$(date +%Y%m%d).sql
   ```

## KONFIGURASI RTSP CAMERA
1. **Buka File Attendance_engine.py**
2. **Cari Fungsi  processor.add_camera**
3. **Sesuaikan dengan ip camera yang anda miliki**

## PATCH KEHADIRAN/SCANING QR-CODE
/monitor

## 📚 Dokumentasi Tambahan

- [MIGRASI_MYSQL.md](MIGRASI_MYSQL.md) - Panduan setup MySQL
- [MYSQL_SETUP.md](MYSQL_SETUP.md) - Dokumentasi lengkap MySQL
- [TRAINING_GUIDE.md](TRAINING_GUIDE.md) - Panduan training YOLO
- [TRAINING_GOOGLE_COLAB_GUIDE.md](TRAINING_COLAB.md) - Panduan training model roboflow ke Google Colab

## 📝 License

MIT License - Feel free to use and modify

## 🤝 Contributing

Contributions welcome! Please:
1. Fork repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

---

**Version:** 3.0 (MySQL + Mahasiswa Mode)  
**Last Updated:** 2026-04-16

---

## 💻🔥 Team Structure
1. **Dody Setiawan = Project Manager, Backend**
2. **Alwan Nabil Priyanto = Frontend, Databse**
3. **Mala Fauziati = Quality Asurance, YOLO Trained**

API Server & Engine Absensi berbasis **YOLO v8 + QR Code + RTSP CCTV + MySQL**. Sistem ini mendeteksi kehadiran mahasiswa secara otomatis melalui kamera CCTV: YOLO mendeteksi QR code paper, kemudian QR Code dipindai untuk identifikasi, dan hasilnya dicatat ke database MySQL secara real-time.
