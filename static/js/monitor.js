const API_URL = '/api';
const COOLDOWN_MS = 60 * 60 * 1000; // 1 jam dalam milidetik
const beepSound = new Audio('/static/sounds/beep.mp3');

let lastActionCount = 0;
let pollingActive = false;

// ===== JAM REAL-TIME =====
function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('id-ID');

    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('date-label').textContent = now.toLocaleDateString('id-ID', opts);
}
setInterval(updateClock, 1000);
updateClock();

// ===== INISIALISASI KAMERA =====
async function initCamera() {
    try {
        const res = await fetch(`${API_URL}/cameras`);
        const data = await res.json();
        if (data.success && data.data.length > 0) {
            const cam = data.data.find(c => c.is_active === 1) || data.data[0];
            document.getElementById('live-feed').src = `${API_URL}/stream/${cam.id}`;
        }
    } catch (err) {
        console.warn('Kamera tidak tersedia:', err);
    }
}

// ===== COOLDOWN: simpan waktu check-in tiap mahasiswa =====
// Key: NIM atau record.id | Value: timestamp ISO check-in
function getCooldownMap() {
    try {
        const raw = sessionStorage.getItem('siabsen_checkin_times');
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

function setCooldownMap(map) {
    try { sessionStorage.setItem('siabsen_checkin_times', JSON.stringify(map)); }
    catch { /* ignore */ }
}

/**
 * Periksa apakah mahasiswa masih dalam masa cooldown 1 jam sejak check-in.
 * Jika ia sudah check-out, tidak perlu cooldown lagi.
 * @returns {number|null} Sisa detik cooldown, atau null jika boleh aksi
 */
function getCooldownRemaining(record) {
    // Jika sudah check-out, tidak ada cooldown
    if (record.check_out) return null;

    const map = getCooldownMap();
    const key = String(record.mahasiswa_id || record.id || record.name);
    const checkInTime = map[key] || record.check_in;

    if (!checkInTime) return null;

    const checkedInAt = new Date(checkInTime).getTime();
    const now = Date.now();
    const elapsed = now - checkedInAt;
    const remaining = COOLDOWN_MS - elapsed;

    return remaining > 0 ? Math.ceil(remaining / 1000) : null;
}

/**
 * Simpan waktu check-in ke sessionStorage saat data baru diterima
 */
function syncCooldownMap(attendanceData) {
    const map = getCooldownMap();
    attendanceData.forEach(record => {
        if (!record.check_out && record.check_in) {
            const key = String(record.mahasiswa_id || record.id || record.name);
            if (!map[key]) {
                map[key] = record.check_in;
            }
        }
    });
    setCooldownMap(map);
}

// ===== FORMAT SISA WAKTU COOLDOWN =====
function formatCooldown(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) return `${m} menit ${s} detik`;
    return `${s} detik`;
}

// ===== INISIAL AVATAR =====
function getInitials(name) {
    return name
        .split(' ')
        .slice(0, 2)
        .map(w => w[0] || '')
        .join('')
        .toUpperCase();
}

// ===== RENDER LOG ABSENSI =====
function renderRecentScans(attendanceData) {
    const container = document.getElementById('recent-scans');
    const countEl = document.getElementById('log-count');

    if (!attendanceData || attendanceData.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <path d="M14 14h.01M14 17h3M17 14h3M20 17v3M17 20h3"/>
                </svg>
                <p>Belum ada absensi hari ini</p>
            </div>`;
        countEl.textContent = '0';
        return;
    }

    countEl.textContent = attendanceData.length;

    // Ambil 10 data teratas
    const recent = attendanceData.slice(0, 10);

    container.innerHTML = recent.map(record => {
        const isCheckout = !!record.check_out;
        const timeRaw = isCheckout ? record.check_out : record.check_in;
        const timeShow = timeRaw ? timeRaw.slice(11, 19) : '--:--:--';
        const actionText = isCheckout ? 'KELUAR' : 'MASUK';
        const initials = getInitials(record.name || 'U N');

        // Hitung cooldown jika masih check-in (belum check-out)
        const remainingSec = !isCheckout ? getCooldownRemaining(record) : null;
        const inCooldown = remainingSec !== null;

        let cooldownBadge = '';
        if (inCooldown) {
            cooldownBadge = `
                <div style="margin-top:6px;font-size:10px;color:#92400e;background:#fffbeb;border:1px solid #fcd34d;border-radius:4px;padding:3px 8px;display:inline-block;">
                    ⏳ Bisa keluar dalam ${formatCooldown(remainingSec)}
                </div>`;
        }

        return `
            <div class="log-item ${isCheckout ? 'checkout' : ''} ${inCooldown ? '' : ''}">
                <div class="log-avatar">${initials}</div>
                <div class="log-body">
                    <div class="mhs-name">${record.name}</div>
                    <div class="mhs-info">
                        <span>${record.kelompok || '—'}</span>
                        <span class="action-badge ${isCheckout ? 'keluar' : 'masuk'}">${actionText}</span>
                    </div>
                    ${cooldownBadge}
                </div>
                <div class="scan-time">${timeShow}</div>
            </div>`;
    }).join('');
}

// ===== UPDATE STATISTIK =====
function updateStats(data) {
    const total = data.length;
    const hadir = new Set(data.map(r => r.mahasiswa_id || r.name)).size;
    const masih = data.filter(r => !r.check_out).length;

    const elTotal = document.getElementById('stat-total');
    const elHadir = document.getElementById('stat-hadir');
    const elMasih = document.getElementById('stat-masih');

    if (elTotal) elTotal.textContent = hadir;
    if (elHadir) elHadir.textContent = hadir;
    if (elMasih) elMasih.textContent = masih;
}

// ===== UPDATE FOOTER =====
function updateFooter() {
    const el = document.getElementById('last-update');
    if (el) {
        const now = new Date().toLocaleTimeString('id-ID');
        el.textContent = `Diperbarui: ${now}`;
    }

    const dot = document.getElementById('polling-dot');
    if (dot) {
        dot.classList.add('active');
        setTimeout(() => dot.classList.remove('active'), 600);
        setTimeout(() => dot.classList.add('active'), 1200);
    }
}

// ===== POLLING DATA ABSENSI =====
async function fetchLatestAttendance() {
    try {
        const res = await fetch(`${API_URL}/attendance/today`);
        const data = await res.json();

        if (data.success) {
            syncCooldownMap(data.data);

            // Hitung total aktivitas: setiap check-in dihitung 1, setiap check-out dihitung 1
            let currentActionCount = 0;
            data.data.forEach(record => {
                if (record.check_in) currentActionCount++;
                if (record.check_out) currentActionCount++;
            });

            // Deteksi jika ada aktivitas baru (masuk maupun keluar)
            if (currentActionCount > lastActionCount && lastActionCount !== 0) {
                playBeep();
            }
            lastActionCount = currentActionCount; // Simpan jumlah aktivitas terakhir

            renderRecentScans(data.data);
            updateStats(data.data);
            updateFooter();
        }
    } catch (err) {
        console.warn('Gagal memuat data absensi:', err);
    }
}

// ===== SUARA BEEP SAAT ABSEN BARU =====
let isAudioUnlocked = false;

// Fungsi yang dipanggil saat tombol OK di alert diklik
function aktifkanSuara() {
    isAudioUnlocked = true;
    
    // Trik: Mainkan dengan volume 0 (tidak terdengar) untuk membuka kunci dari browser
    beepSound.volume = 0; 
    beepSound.play().then(() => {
        beepSound.pause();
        beepSound.currentTime = 0;
        beepSound.volume = 1; // Kembalikan volume ke 100% untuk absen selanjutnya
    }).catch(err => console.warn('Izin audio gagal dibuka:', err));
    
    // Hapus custom alert dari layar
    const alertBox = document.getElementById('audio-alert');
    if (alertBox) {
        alertBox.remove();
    }
}

// 3. Fungsi playBeep yang dipanggil HANYA saat ada absen baru
function playBeep() {
    // Jangan lakukan apa-apa jika user belum klik OK di alert
    if (!isAudioUnlocked) return; 

    try {
        beepSound.currentTime = 0; // Pastikan suara diputar dari awal
        beepSound.play().catch(err => console.warn('Gagal memutar beep absensi:', err));
    } catch (err) { 
        console.warn('Error audio:', err);
    }
}

// ===== MULAI =====
initCamera();
fetchLatestAttendance();

// Refresh data absensi setiap 2 detik
setInterval(fetchLatestAttendance, 3000);

// Re-render tiap 10 detik untuk update countdown cooldown
setInterval(() => {
    const container = document.getElementById('recent-scans');
    if (container && !container.querySelector('.empty-state')) {
        fetchLatestAttendance();
    }
}, 10000);