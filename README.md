# SIABSEN — Sistem Absensi Mahasiswa

Sistem absensi otomatis menggunakan **YOLO object detection** untuk mendeteksi **QR code paper** dan **pyzbar** untuk decode QR code, terintegrasi dengan **RTSP CCTV streams**, **Upload Video MP4**, **Form Pengajuan Izin/Sakit**, dan **MySQL database**.

## 🎯 Cara Kerja Sistem

### Mode Deteksi: QR Code Paper

1. **YOLO mendeteksi kertas QR code** dalam frame CCTV/Video
2. **Pyzbar decode QR code** dari area yang terdeteksi
3. **Sistem validasi** QR code dengan database mahasiswa
4. **Auto record** attendance (check-in/check-out)
5. **Cooldown mechanism** mencegah scan berulang (30 detik)

### Alur Proses

```
CCTV Stream / Video MP4 → YOLO Detection (QR Paper) → QR Decode → Mahasiswa Lookup → Record Attendance
```

## ✨ Fitur Utama

### 1. 📹 Real-time CCTV Monitoring
- Deteksi QR code dari RTSP stream
- Multi-camera support
- Live preview dengan bounding box
- Auto check-in/check-out

### 2. 🎬 Upload & Deteksi Video MP4
- Upload video rekaman untuk deteksi offline
- Preview video dengan bounding box real-time (jsQR)
- Pilih action: Check-in atau Check-out
- Batch processing untuk multiple QR codes
- Validasi duplikasi (mencegah check-in/out 2x di hari yang sama)
- Hasil langsung masuk ke "Absensi Hari Ini"

### 3. 📝 Form Pengajuan Izin/Sakit & Kehadiran Manual
**Untuk Mahasiswa:**
- **Form Izin/Sakit**: Pengajuan ketidakhadiran dengan alasan
  - Upload bukti **WAJIB** (surat dokter, surat izin, dll)
  - Format: JPG, PNG, PDF (max 10MB)
  - Riwayat pengajuan dengan status real-time
- **Form Kehadiran Manual**: Pengajuan kehadiran yang tidak tercatat sistem
  - Untuk mahasiswa yang hadir tapi tidak tercatat (lupa kartu QR, kamera mati, dll)
  - Upload bukti **WAJIB** (foto selfie di lokasi, foto kegiatan, dll)
  - Jam masuk dan jam keluar **WAJIB** diisi
  - Format: JPG, PNG, PDF (max 10MB)
- Tab navigation untuk switch antara form izin/sakit dan kehadiran manual
- Pencarian mahasiswa dengan filter kelompok dan jurusan

**Untuk Tim Disiplin (Timdis):**
- **Verifikasi Izin/Sakit**: Dashboard untuk approve/reject pengajuan izin/sakit
  - Filter status: Pending/Disetujui/Ditolak
  - Approve: Status attendance = izin/sakit
  - Reject: Isi alasan penolakan
  - Preview bukti (gambar/PDF)
- **Verifikasi Kehadiran Manual**: Dashboard untuk approve/reject pengajuan kehadiran
  - Filter status: Pending/Disetujui/Ditolak
  - Approve: Data masuk ke attendance dengan status "manual"
  - Reject: Isi alasan penolakan
  - Preview bukti (gambar/PDF)
- Badge notifikasi untuk pending submissions
- Stats cards: Pending, Disetujui, Ditolak

### 4. 📊 Dashboard & Reporting
- Statistik kehadiran real-time dengan status izin/sakit
- Export data ke CSV dengan mapping status (Izin, Sakit, Lengkap, Hadir, Absen)
- Riwayat absensi lengkap dengan badge status
- Grafik kehadiran per kelompok
- Pencarian mahasiswa dengan filter kelompok dan jurusan
- Material Icons untuk UI yang lebih clean (no emoji)

### 5. ⚙️ Pengaturan Sistem
- **Konfigurasi YOLO**: Model path (browsable), Confidence threshold, QR cooldown
- **Konfigurasi RTSP**: Frame width, Frame height, **Frame FPS**, Reconnect delay
- Browse model YOLO dari folder `models/` dengan preview ukuran file
- Validasi input untuk semua pengaturan
- Auto-save ke `data/settings.json`
- Restart engine/kamera untuk menerapkan perubahan

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
├── monitor.html              # Live monitoring page
├── mahasiswa.html              # Portal mahasiswa (izin/sakit & kehadiran manual)
├── static/
│   ├── css/
│   │   ├── style.css        # UI styling dashboard
│   │   ├── monitor.css      # UI styling monitor
│   │   └── mahasiswa.css    # UI styling portal mahasiswa (standalone)
│   ├── js/
│   │   ├── script.js        # Frontend logic dashboard
│   │   ├── monitor.js       # Frontend logic monitor
│   │   └── mahasiswa.js     # Frontend logic portal mahasiswa (eksternal)
│   ├── img/
│   │   └── logo.png         # Logo aplikasi
│   └── sounds/
│       └── beep.mp3         # Sound notification
├── data/
│   ├── qrcodes/             # Generated QR codes mahasiswa
│   ├── snapshots/           # Attendance snapshots
│   ├── uploads/             # Uploaded video files (MP4)
│   ├── bukti_izin/          # Bukti pengajuan izin/sakit & kehadiran manual
│   └── settings.json        # Pengaturan sistem (YOLO & RTSP)
├── models/
│   └── yolov8n.pt          # YOLO model (perlu training!)
├── logs/
│   └── attendance.log       # System logs
├── MIGRASI_MYSQL.md         # Panduan setup MySQL
├── MYSQL_SETUP.md           # Dokumentasi lengkap MySQL
├── TRAINING_GUIDE.md        # Panduan training YOLO
├── TRAINING_COLAB.md        # Panduan training di Google Colab
├── UPDATE_VIDEO_TO_ATTENDANCE.md  # Dokumentasi fitur video upload
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

### Video Upload (NEW! 🎬)
- `POST /api/video/preview_frames` - Preview frame video dengan bounding box
- `POST /api/video/process` - Upload & proses video MP4 untuk deteksi QR
  - Form data: `video` (file), `action` (check_in/check_out)
  - Response: deteksi QR, jumlah tercatat, mahasiswa yang dilewati

### Izin/Sakit (NEW! 📝)
- `POST /api/izin/submit` - Submit pengajuan izin/sakit (Mahasiswa)
  - Form data: `mahasiswa_id`, `type` (izin/sakit), `date`, `keterangan`, `bukti` (file) - **WAJIB**
- `GET /api/izin/list` - List semua pengajuan (Timdis)
  - Query: `?status=pending|approved|rejected`
- `POST /api/izin/verify` - Approve/Reject pengajuan (Timdis)
  - JSON: `submission_id`, `action` (approve/reject), `verified_by`, `rejection_reason`
- `GET /api/izin/mahasiswa/<id>` - Riwayat pengajuan per mahasiswa
- `GET /api/izin/bukti/<filename>` - Download/view file bukti

### Kehadiran Manual (NEW! 🙋)
- `POST /api/kehadiran/submit` - Submit pengajuan kehadiran manual (Mahasiswa)
  - Form data: `mahasiswa_id`, `date`, `check_in_time`, `check_out_time`, `keterangan`, `bukti` (file) - **SEMUA WAJIB**
- `GET /api/kehadiran/list` - List semua pengajuan (Timdis)
  - Query: `?status=pending|approved|rejected`
- `POST /api/kehadiran/verify` - Approve/Reject pengajuan (Timdis)
  - JSON: `submission_id`, `action` (approve/reject), `verified_by`, `rejection_reason`
- `GET /api/kehadiran/mahasiswa/<id>` - Riwayat pengajuan per mahasiswa

### Settings (NEW! ⚙️)
- `GET /api/settings` - Get semua pengaturan sistem
- `POST /api/settings/yolo` - Update pengaturan YOLO
  - JSON: `model_path`, `confidence`, `qr_cooldown`
- `POST /api/settings/rtsp` - Update pengaturan RTSP
  - JSON: `frame_width`, `frame_height`, `frame_fps`, `reconnect_delay`
- `GET /api/models/list` - List semua model YOLO di folder `models/`

### Cameras
- `GET /api/cameras` - List semua kamera
- `POST /api/cameras` - Tambah kamera
- `PUT /api/cameras/<id>` - Update kamera
- `DELETE /api/cameras/<id>` - Hapus kamera
- `GET /api/stream/<id>` - MJPEG stream

### Dashboard
- `GET /api/dashboard` - Data lengkap dashboard

## 🎬 Upload Video MP4 untuk Deteksi

### Cara Menggunakan

1. **Buka Dashboard** → Menu "Upload Video MP4"
2. **Pilih Action**: Check-in atau Check-out
3. **Upload Video**: Pilih file MP4 (max 500MB)
4. **Preview**: Video akan ditampilkan dengan bounding box real-time
   - Putar video untuk melihat deteksi QR code
   - Bounding box kuning muncul saat QR terdeteksi
5. **Proses**: Klik "Upload & Proses Video"
6. **Hasil**: Lihat hasil di "Absensi Hari Ini"

### Fitur Video Upload

✅ **Preview Real-time** dengan jsQR library  
✅ **Bounding box kuning** seperti di attendance_engine.py  
✅ **Auto-scale** untuk semua orientasi video (portrait/landscape)  
✅ **Validasi duplikasi** - mencegah check-in/out 2x di hari yang sama  
✅ **Batch processing** - deteksi multiple mahasiswa dalam 1 video  
✅ **Skip duplicate** - mahasiswa yang sama hanya tercatat 1x  
✅ **Detail report** - menampilkan mahasiswa yang dilewati dengan alasan  

### Format Video yang Didukung

- **Format**: MP4
- **Codec**: H.264, H.265
- **Resolusi**: Semua (auto-scale)
- **Orientasi**: Portrait, Landscape, Square
- **Ukuran**: Maksimal 500MB
- **FPS**: Semua (diproses 5 frame/detik)

### Tips Rekam Video

1. **Pencahayaan**: Pastikan cukup terang
2. **Jarak**: 50cm - 2m dari QR code
3. **Fokus**: QR code harus jelas, tidak blur
4. **Ukuran QR**: Minimal 5x5 cm
5. **Kecepatan**: Jangan terlalu cepat, beri jeda 1-2 detik per QR

## 📝 Form Pengajuan Izin/Sakit & Kehadiran Manual

### Untuk Mahasiswa

#### Form Izin/Sakit (Tidak Hadir)
1. **Buka Portal Mahasiswa** → `http://localhost:5000/mahasiswa`
2. **Tab "Izin/Sakit"** (default)
3. **Pilih Mahasiswa**: Dari dropdown
4. **Pilih Jenis**: Izin atau Sakit
5. **Isi Tanggal**: Tanggal ketidakhadiran
6. **Isi Keterangan**: Minimal 10 karakter
7. **Upload Bukti** (**WAJIB**): JPG, PNG, atau PDF (max 10MB)
   - Contoh: Surat dokter, surat izin, dll
8. **Kirim Pengajuan**
9. **Lihat Status**: Di tabel "Riwayat Pengajuan Saya"

#### Form Kehadiran Manual (Hadir tapi Tidak Tercatat)
1. **Buka Portal Mahasiswa** → `http://localhost:5000/mahasiswa`
2. **Tab "Kehadiran Manual"**
3. **Pilih Mahasiswa**: Dari dropdown (independen dari tab Izin/Sakit)
4. **Isi Tanggal**: Tanggal kehadiran
5. **Isi Jam Masuk** (**WAJIB**): Waktu masuk
6. **Isi Jam Keluar** (**WAJIB**): Waktu keluar
7. **Isi Keterangan**: Minimal 10 karakter
   - Contoh: "Lupa bawa kartu QR", "Kamera CCTV mati", dll
8. **Upload Bukti** (**WAJIB**): JPG, PNG, atau PDF (max 10MB)
   - Contoh: Foto selfie di lokasi, foto kegiatan, dll
9. **Kirim Pengajuan**
10. **Lihat Status**: Di tabel "Riwayat Pengajuan Saya"

### Untuk Tim Disiplin (Timdis)

#### Verifikasi Izin/Sakit
1. **Buka Dashboard** → Menu "Verifikasi Izin/Sakit"
2. **Lihat Pengajuan**: Filter berdasarkan status
   - Pending (perlu verifikasi)
   - Disetujui
   - Ditolak
3. **Verifikasi**:
   - **Setujui**: Status kehadiran mahasiswa otomatis diupdate ke izin/sakit
   - **Tolak**: Isi alasan penolakan
4. **Lihat Bukti**: Klik icon attachment untuk preview

#### Verifikasi Kehadiran Manual
1. **Buka Dashboard** → Menu "Verifikasi Kehadiran"
2. **Lihat Pengajuan**: Filter berdasarkan status
   - Pending (perlu verifikasi)
   - Disetujui
   - Ditolak
3. **Verifikasi**:
   - **Setujui**: Data masuk ke tabel attendance dengan status "manual"
   - **Tolak**: Isi alasan penolakan
4. **Lihat Bukti**: Klik icon attachment untuk preview

### Status Pengajuan

| Status | Keterangan | Aksi |
|--------|-----------|------|
| 🟡 **Pending** | Menunggu verifikasi Timdis | Timdis bisa approve/reject |
| 🟢 **Disetujui** | Pengajuan diterima | Status attendance diupdate |
| 🔴 **Ditolak** | Pengajuan tidak diterima | Status tetap tidak hadir |

### Alur Izin/Sakit

```
Mahasiswa Submit (Izin/Sakit) → Pending → Timdis Approve → Update Attendance (status=izin/sakit)
```

### Alur Kehadiran Manual

```
Mahasiswa Submit (Kehadiran) → Pending → Timdis Approve → Insert Attendance (status=manual)
```

### Perbedaan Izin/Sakit vs Kehadiran Manual

| Aspek | Izin/Sakit | Kehadiran Manual |
|-------|-----------|------------------|
| **Tujuan** | Mahasiswa **TIDAK HADIR** | Mahasiswa **HADIR** tapi tidak tercatat |
| **Bukti** | Surat dokter, surat izin | Foto selfie, foto kegiatan |
| **Data** | Tanggal, jenis, keterangan | Tanggal, jam masuk, jam keluar, keterangan |
| **Hasil** | Status: izin/sakit | Status: manual (hadir) |
| **Jam** | Tidak perlu | Jam masuk & keluar **WAJIB** |

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
    status VARCHAR(20) DEFAULT 'present',  -- present, izin, sakit
    camera_id VARCHAR(50),
    snapshot_path TEXT,
    yolo_confidence FLOAT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Tabel: izin_submissions (NEW! 📝)
```sql
CREATE TABLE izin_submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mahasiswa_id VARCHAR(50) NOT NULL,
    submission_type ENUM('izin', 'sakit') NOT NULL,
    date DATE NOT NULL,
    keterangan TEXT NOT NULL,
    bukti_path TEXT NOT NULL,  -- WAJIB
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    verified_by VARCHAR(100),
    verified_at DATETIME,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (mahasiswa_id) REFERENCES mahasiswa(id) ON DELETE CASCADE
);
```

### Tabel: kehadiran_submissions (NEW! 🙋)
```sql
CREATE TABLE kehadiran_submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mahasiswa_id VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    check_in_time TIME NOT NULL,
    check_out_time TIME NOT NULL,  -- WAJIB
    keterangan TEXT NOT NULL,
    bukti_path TEXT NOT NULL,  -- WAJIB
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    verified_by VARCHAR(100),
    verified_at DATETIME,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (mahasiswa_id) REFERENCES mahasiswa(id) ON DELETE CASCADE
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

### Video upload gagal

**Solusi:**
1. Cek format video: harus MP4
2. Cek ukuran: maksimal 500MB
3. Pastikan folder `data/uploads` ada dan writable
4. Cek log: `tail -f logs/attendance.log`

### Preview video tidak menampilkan bounding box

**Solusi:**
1. Pastikan jsQR library ter-load (cek console browser)
2. QR code harus jelas dan tidak terlalu kecil
3. Putar video untuk trigger deteksi
4. Cek pencahayaan dalam video

### Form izin/sakit tidak muncul

**Solusi:**
1. Refresh browser (Ctrl+F5)
2. Cek console browser untuk error JavaScript
3. Pastikan API server berjalan
4. Cek endpoint: `curl http://localhost:5000/api/izin/list`

### Bukti izin tidak bisa diupload

**Solusi:**
1. Cek format: hanya JPG, PNG, PDF
2. Cek ukuran: maksimal 10MB
3. Pastikan folder `data/bukti_izin` ada dan writable
4. Cek permission folder
5. **Bukti WAJIB diupload** - tidak bisa submit tanpa bukti

### Dropdown kehadiran manual kosong

**Solusi:**
1. Refresh halaman (Ctrl+F5)
2. Dropdown kehadiran manual sekarang **independen** dari dropdown izin/sakit
3. Kedua dropdown terisi otomatis saat halaman load
4. Tidak perlu pilih mahasiswa di tab izin/sakit terlebih dahulu

### Pengaturan sistem tidak tersimpan

**Solusi:**
1. Cek file `data/settings.json` ada dan writable
2. Cek log error di console browser
3. Restart engine/kamera setelah ubah pengaturan
4. Validasi input: pastikan nilai dalam range yang benar

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

## 🆕 Changelog

### Version 4.0 (2026-04-22)
- ✅ **Kehadiran Manual** - Form pengajuan untuk mahasiswa yang hadir tapi tidak tercatat
- ✅ **Jam keluar WAJIB** di form kehadiran manual
- ✅ **Bukti WAJIB** untuk izin/sakit dan kehadiran manual
- ✅ **Pengaturan Sistem** - Konfigurasi YOLO dan RTSP dengan FPS
- ✅ **Browse Model YOLO** - Pilih model dari folder dengan preview ukuran
- ✅ **Pencarian Mahasiswa** - Filter nama, kelompok, jurusan
- ✅ **Status Izin/Sakit** di dashboard dan export CSV
- ✅ **Material Icons** menggantikan emoji untuk UI lebih professional
- ✅ **Hapus kolom ID** di tabel verifikasi (hanya tampilkan data penting)
- ✅ **Hapus tap highlight** untuk UX mobile yang lebih baik
- ✅ **Dropdown independen** - Kehadiran manual tidak bergantung pada izin/sakit
- ✅ **Mahasiswa.js eksternal** - JavaScript terpisah dari HTML
- ✅ **Mahasiswa.css standalone** - CSS tidak bergantung pada style.css

### Version 3.2 (2026-04-20)
- ✅ **Form Pengajuan Izin/Sakit** dengan upload bukti
- ✅ **Dashboard Verifikasi Timdis** untuk approve/reject
- ✅ **Auto-update status attendance** saat pengajuan disetujui
- ✅ **Preview bukti** (gambar/PDF) dalam modal
- ✅ **Notifikasi real-time** untuk mahasiswa dan timdis

### Version 3.1 (2026-04-18)
- ✅ **Upload Video MP4** untuk deteksi offline
- ✅ **Preview video real-time** dengan bounding box (jsQR)
- ✅ **Validasi duplikasi** check-in/check-out
- ✅ **Batch processing** multiple QR codes
- ✅ **Auto-scale video** untuk semua orientasi
- ✅ **Detail report** mahasiswa yang dilewati

### Version 3.0 (2026-04-16)
- ✅ Migrasi dari SQLite ke **MySQL**
- ✅ Mode **Mahasiswa** (sebelumnya Employee)
- ✅ Multi-camera RTSP support
- ✅ Dashboard web responsive
- ✅ Export data CSV/Excel

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

**Version:** 4.0 (MySQL + Video Upload + Izin/Sakit + Kehadiran Manual + Settings)  
**Last Updated:** 2026-04-22

---

## 💻🔥 Team Structure
1. **Dody Setiawan = Project Manager, Backend**
2. **Alwan Nabil Priyanto = Frontend, Database**
3. **Mala Fauziati = Quality Assurance, YOLO Trained**

API Server & Engine Absensi berbasis **YOLO v8 + QR Code + RTSP CCTV + Video Upload + Form Izin/Sakit + Kehadiran Manual + MySQL**. Sistem ini mendeteksi kehadiran mahasiswa secara otomatis melalui kamera CCTV atau video upload: YOLO mendeteksi QR code paper, kemudian QR Code dipindai untuk identifikasi, dan hasilnya dicatat ke database MySQL secara real-time. Dilengkapi dengan sistem pengajuan izin/sakit untuk mahasiswa yang tidak hadir dan pengajuan kehadiran manual untuk mahasiswa yang hadir tapi tidak tercatat sistem, dengan verifikasi dari Tim Disiplin.
