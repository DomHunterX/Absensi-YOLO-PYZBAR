# 🔐 Authentication & Authorization System

## Overview

SIABSEN v2.5 sekarang dilengkapi dengan **sistem authentication & authorization** yang lengkap untuk mengamankan akses ke sistem.

### Fitur Utama

✅ **Login/Logout System** dengan session management  
✅ **Password Hashing** menggunakan bcrypt  
✅ **Role-Based Access Control (RBAC)** - 3 role: Admin, Timdis, Mahasiswa  
✅ **Session Token** dengan expiry time (24 jam)  
✅ **Rate Limiting** untuk login attempts (max 5 gagal dalam 15 menit)  
✅ **Secure Cookies** untuk browser-based authentication  
✅ **API Token Authentication** untuk mobile/external apps  

---

## 📋 Database Schema

### Tabel: `users`

| Kolom | Tipe | Deskripsi |
|-------|------|-----------|
| `id` | INT (PK) | User ID |
| `username` | VARCHAR(50) UNIQUE | Username untuk login |
| `password_hash` | VARCHAR(255) | Password yang di-hash dengan bcrypt |
| `full_name` | VARCHAR(255) | Nama lengkap user |
| `email` | VARCHAR(255) | Email user (opsional) |
| `role` | ENUM | Role: 'admin', 'timdis', 'mahasiswa' |
| `mahasiswa_id` | VARCHAR(50) | Foreign key ke tabel mahasiswa (untuk role mahasiswa) |
| `is_active` | TINYINT(1) | Status aktif user |
| `last_login` | DATETIME | Waktu login terakhir |
| `created_at` | TIMESTAMP | Waktu pembuatan akun |
| `updated_at` | TIMESTAMP | Waktu update terakhir |

### Tabel: `sessions`

| Kolom | Tipe | Deskripsi |
|-------|------|-----------|
| `id` | INT (PK) | Session ID |
| `user_id` | INT (FK) | Foreign key ke users |
| `session_token` | VARCHAR(255) UNIQUE | Token session (32 bytes random) |
| `ip_address` | VARCHAR(45) | IP address client |
| `user_agent` | TEXT | Browser/client info |
| `expires_at` | DATETIME | Waktu expiry session |
| `created_at` | TIMESTAMP | Waktu pembuatan session |

### Tabel: `login_attempts`

| Kolom | Tipe | Deskripsi |
|-------|------|-----------|
| `id` | INT (PK) | Attempt ID |
| `username` | VARCHAR(50) | Username yang dicoba |
| `ip_address` | VARCHAR(45) | IP address |
| `success` | TINYINT(1) | Berhasil atau tidak |
| `attempted_at` | TIMESTAMP | Waktu percobaan |

---

## 🎭 Role-Based Access Control (RBAC)

### 1. **Admin** 
- **Akses penuh** ke semua fitur sistem
- Dapat mengelola users (create, update, deactivate)
- Akses ke dashboard admin
- Dapat verifikasi pengajuan izin/sakit dan kehadiran manual
- Dapat mengelola data mahasiswa, kamera, settings

### 2. **Timdis** (Tim Disiplin)
- Akses ke dashboard admin (read-only untuk beberapa fitur)
- **Dapat verifikasi** pengajuan izin/sakit dan kehadiran manual
- Dapat melihat data absensi dan riwayat
- **Tidak dapat** mengelola users atau settings sistem

### 3. **Mahasiswa**
- Akses ke **portal mahasiswa** (`/mahasiswa`)
- Dapat melihat riwayat absensi sendiri
- Dapat submit pengajuan izin/sakit
- Dapat submit pengajuan kehadiran manual
- Dapat download sertifikat kehadiran
- **Tidak dapat** akses dashboard admin

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install bcrypt>=4.0.0
```

Atau install semua dependencies:

```bash
pip install -r requirements.txt
```

### 2. Jalankan API Server

```bash
python api_server.py
```

Server akan otomatis:
- Membuat tabel `users`, `sessions`, `login_attempts`
- Membuat **default admin account**:
  - Username: `admin`
  - Password: `admin123`

### 3. Login

Buka browser dan akses:

```
http://localhost:5000/login
```

Login dengan credentials default:
- **Username**: `admin`
- **Password**: `admin123`

⚠️ **PENTING**: Ganti password default setelah login pertama!

---

## 📡 API Endpoints

### Authentication Endpoints

#### 1. **POST** `/api/auth/login`

Login user dan dapatkan session token.

**Request Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Login berhasil",
  "data": {
    "user": {
      "user_id": 1,
      "username": "admin",
      "full_name": "Administrator",
      "email": "admin@siabsen.local",
      "role": "admin",
      "mahasiswa_id": null
    },
    "session_token": "abc123xyz..."
  }
}
```

**Response (Failed):**
```json
{
  "success": false,
  "message": "Username atau password salah"
}
```

---

#### 2. **POST** `/api/auth/logout`

Logout user dan hapus session.

**Headers:**
```
Authorization: Bearer <session_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logout berhasil"
}
```

---

#### 3. **GET** `/api/auth/validate`

Validasi session token.

**Headers:**
```
Authorization: Bearer <session_token>
```

**Response (Valid):**
```json
{
  "success": true,
  "message": "Session valid",
  "data": {
    "user": {
      "user_id": 1,
      "username": "admin",
      "full_name": "Administrator",
      "role": "admin"
    }
  }
}
```

---

#### 4. **GET** `/api/auth/me`

Get current logged in user info.

**Headers:**
```
Authorization: Bearer <session_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": 1,
    "username": "admin",
    "full_name": "Administrator",
    "email": "admin@siabsen.local",
    "role": "admin"
  }
}
```

---

#### 5. **POST** `/api/auth/change-password`

Ganti password user yang sedang login.

**Headers:**
```
Authorization: Bearer <session_token>
```

**Request Body:**
```json
{
  "old_password": "admin123",
  "new_password": "newpassword456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password berhasil diubah"
}
```

---

### User Management Endpoints (Admin Only)

#### 1. **GET** `/api/users`

List semua users.

**Headers:**
```
Authorization: Bearer <admin_session_token>
```

**Query Parameters:**
- `role` (optional): Filter by role ('admin', 'timdis', 'mahasiswa')

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "username": "admin",
      "full_name": "Administrator",
      "email": "admin@siabsen.local",
      "role": "admin",
      "mahasiswa_id": null,
      "is_active": 1,
      "last_login": "2026-04-23T10:30:00",
      "created_at": "2026-04-20T08:00:00"
    }
  ]
}
```

---

#### 2. **POST** `/api/users`

Buat user baru (admin only).

**Headers:**
```
Authorization: Bearer <admin_session_token>
```

**Request Body:**
```json
{
  "username": "timdis01",
  "password": "password123",
  "full_name": "Tim Disiplin 1",
  "email": "timdis01@siabsen.local",
  "role": "timdis"
}
```

Untuk role mahasiswa, tambahkan `mahasiswa_id`:
```json
{
  "username": "mhs001",
  "password": "password123",
  "full_name": "Budi Santoso",
  "email": "budi@student.ac.id",
  "role": "mahasiswa",
  "mahasiswa_id": "MHS001"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User berhasil dibuat",
  "data": {
    "user_id": 2
  }
}
```

---

#### 3. **GET** `/api/users/<user_id>`

Get user by ID.

**Headers:**
```
Authorization: Bearer <admin_session_token>
```

---

#### 4. **PUT** `/api/users/<user_id>`

Update user profile.

**Headers:**
```
Authorization: Bearer <admin_session_token>
```

**Request Body:**
```json
{
  "full_name": "New Name",
  "email": "newemail@example.com"
}
```

---

#### 5. **POST** `/api/users/<user_id>/deactivate`

Nonaktifkan user.

**Headers:**
```
Authorization: Bearer <admin_session_token>
```

---

#### 6. **POST** `/api/users/<user_id>/activate`

Aktifkan user.

**Headers:**
```
Authorization: Bearer <admin_session_token>
```

---

## 🔒 Protecting Endpoints

### Menggunakan Decorator `@require_auth()`

Untuk protect endpoint agar hanya bisa diakses oleh user yang sudah login:

```python
@app.route('/api/mahasiswa', methods=['GET'])
@require_auth()  # Semua role bisa akses
def list_mahasiswa():
    # User info tersedia di request.current_user
    user = request.current_user
    return ok(data)
```

### Restrict by Role

Untuk restrict endpoint hanya untuk role tertentu:

```python
@app.route('/api/users', methods=['GET'])
@require_auth(roles=['admin'])  # Hanya admin
def list_users():
    return ok(users)

@app.route('/api/izin/verify', methods=['POST'])
@require_auth(roles=['admin', 'timdis'])  # Admin atau Timdis
def verify_izin():
    return ok(result)
```

### Optional Authentication

Untuk endpoint yang bisa diakses dengan atau tanpa auth:

```python
@app.route('/api/dashboard', methods=['GET'])
@optional_auth
def dashboard():
    if request.current_user:
        # User logged in
        user = request.current_user
    else:
        # Anonymous user
        pass
    return ok(data)
```

---

## 🛡️ Security Features

### 1. **Password Hashing**
- Menggunakan **bcrypt** dengan salt
- Password tidak pernah disimpan dalam plaintext
- Hash menggunakan cost factor 12 (default bcrypt)

### 2. **Session Management**
- Session token: 32 bytes random (URL-safe)
- Expiry time: 24 jam (configurable)
- Auto cleanup expired sessions
- Max 5 active sessions per user

### 3. **Rate Limiting**
- Max 5 failed login attempts dalam 15 menit
- Automatic lockout setelah 5 kali gagal
- Tracking per username dan IP address

### 4. **Secure Cookies**
- HttpOnly flag (tidak bisa diakses JavaScript)
- SameSite=Lax (CSRF protection)
- Secure flag untuk HTTPS (production)

### 5. **SQL Injection Prevention**
- Semua query menggunakan parameterized statements
- Input validation di semua endpoints

---

## 📝 Best Practices

### 1. **Ganti Password Default**

Setelah login pertama kali dengan admin default, segera ganti password:

```bash
curl -X POST http://localhost:5000/api/auth/change-password \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "old_password": "admin123",
    "new_password": "YourStrongPassword123!"
  }'
```

### 2. **Buat User untuk Timdis**

Jangan gunakan admin account untuk verifikasi sehari-hari. Buat user dengan role `timdis`:

```python
# Via API
POST /api/users
{
  "username": "timdis01",
  "password": "secure_password",
  "full_name": "Tim Disiplin 1",
  "role": "timdis"
}
```

### 3. **Buat User untuk Mahasiswa**

Setiap mahasiswa sebaiknya punya akun sendiri untuk akses portal:

```python
# Via API
POST /api/users
{
  "username": "mhs001",
  "password": "password123",
  "full_name": "Budi Santoso",
  "role": "mahasiswa",
  "mahasiswa_id": "MHS001"
}
```

### 4. **Logout Setelah Selesai**

Selalu logout setelah selesai menggunakan sistem, terutama di komputer publik.

### 5. **Monitor Login Attempts**

Secara berkala check tabel `login_attempts` untuk mendeteksi suspicious activity:

```sql
SELECT username, ip_address, COUNT(*) as attempts
FROM login_attempts
WHERE success = 0 AND attempted_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
GROUP BY username, ip_address
HAVING attempts > 3
ORDER BY attempts DESC;
```

---

## 🔧 Configuration

### Session Expiry Time

Default: 24 jam. Untuk mengubah, edit di `auth_manager.py`:

```python
def create_session(self, user_id: int, ip_address: str = None, 
                  user_agent: str = None, expires_hours: int = 24):
    # Ubah expires_hours sesuai kebutuhan
```

### Rate Limiting

Default: 5 attempts dalam 15 menit. Untuk mengubah, edit di `auth_manager.py`:

```python
recent_attempts = self.db._execute("""
    SELECT COUNT(*) as count FROM login_attempts
    WHERE username = %s AND success = 0
    AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)  # Ubah interval
""", (username,), fetch_one=True)

if recent_attempts and recent_attempts['count'] >= 5:  # Ubah max attempts
```

---

## 🐛 Troubleshooting

### Problem: "bcrypt not found"

**Solution:**
```bash
pip install bcrypt
```

### Problem: "Invalid or expired session"

**Solution:**
- Session sudah expired (> 24 jam)
- Login ulang untuk mendapatkan session token baru

### Problem: "Terlalu banyak percobaan login gagal"

**Solution:**
- Tunggu 15 menit
- Atau hapus manual dari database:
```sql
DELETE FROM login_attempts 
WHERE username = 'your_username' 
AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE);
```

### Problem: "Access denied (403)"

**Solution:**
- User tidak punya permission untuk endpoint tersebut
- Check role user dan endpoint requirements

---

## 📊 Monitoring & Logging

### Check Active Sessions

```sql
SELECT 
    s.session_token,
    u.username,
    u.role,
    s.ip_address,
    s.created_at,
    s.expires_at
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE s.expires_at > NOW()
ORDER BY s.created_at DESC;
```

### Check Login History

```sql
SELECT 
    username,
    ip_address,
    success,
    attempted_at
FROM login_attempts
ORDER BY attempted_at DESC
LIMIT 50;
```

### Check User Activity

```sql
SELECT 
    id,
    username,
    full_name,
    role,
    last_login,
    is_active
FROM users
ORDER BY last_login DESC;
```

---

## 🎯 Next Steps

Setelah authentication system berjalan, langkah selanjutnya:

1. ✅ **Update Frontend** - Tambahkan login check di dashboard.html dan mahasiswa.html
2. ✅ **Protect All Endpoints** - Tambahkan `@require_auth()` ke semua endpoint sensitif
3. ✅ **User Management UI** - Buat halaman admin untuk manage users
4. ⏳ **Notifikasi System** - Email/WhatsApp notification untuk status pengajuan
5. ⏳ **Advanced Analytics** - Dashboard analytics dengan role-based views
6. ⏳ **Mobile App** - Mobile app dengan token-based authentication

---

## 📚 References

- [bcrypt Documentation](https://github.com/pyca/bcrypt/)
- [Flask Security Best Practices](https://flask.palletsprojects.com/en/latest/security/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

**SIABSEN v2.5** — Sistem Absensi Cerdas dengan Authentication & Authorization  
© 2026 | Developed with ❤️
