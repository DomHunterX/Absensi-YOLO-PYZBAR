const API = 'http://localhost:5000/api';
let mahasiswaData = [];
let currentMahasiswa = null; // Store current logged-in mahasiswa

// ─── Authentication Check & URL Cleanup ────────────────────────────────────
(function() {
  // Get token from URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get('token');
  
  // If token in URL, save to sessionStorage and clean URL
  if (tokenFromUrl) {
    sessionStorage.setItem('session_token', tokenFromUrl);
    // Clean URL without reloading page
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  
  // Check if user is authenticated
  const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
  
  if (!token) {
    // No token, redirect to login
    window.location.href = '/login';
    return;
  }
  
  // Validate token with server and get current user
  fetch(API + '/auth/me', {
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    credentials: 'include'
  })
  .then(res => res.json())
  .then(result => {
    if (!result.success) {
      // Invalid token, clear storage and redirect to login
      localStorage.removeItem('session_token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('session_token');
      sessionStorage.removeItem('user');
      window.location.href = '/login';
    } else {
      // Store current user
      const user = result.data;
      
      console.log('[AUTH] User data received:', user);
      
      // Check if user is mahasiswa
      if (user.role === 'mahasiswa') {
        if (user.mahasiswa) {
          // Store mahasiswa data
          currentMahasiswa = user.mahasiswa;
          console.log('[AUTH] Current mahasiswa loaded:', currentMahasiswa);
          
          // Wait for DOM to be ready before initializing
          if (document.readyState === 'loading') {
            console.log('[AUTH] Waiting for DOM...');
            document.addEventListener('DOMContentLoaded', function() {
              console.log('[AUTH] DOM ready, initializing portal...');
              initializeMahasiswaPortal();
            });
          } else {
            console.log('[AUTH] DOM already ready, initializing portal now...');
            // DOM already loaded, initialize immediately
            setTimeout(() => initializeMahasiswaPortal(), 100);
          }
        } else {
          // Mahasiswa role but no mahasiswa data
          console.error('[AUTH] ERROR: Mahasiswa role but no mahasiswa data');
          alert('Error: Akun mahasiswa tidak terhubung dengan data mahasiswa. Hubungi administrator.');
          window.location.href = '/login';
        }
      } else {
        // Not mahasiswa role, redirect to dashboard
        console.log('[AUTH] Not mahasiswa role, redirecting to dashboard');
        window.location.href = '/';
      }
    }
  })
  .catch(err => {
    console.error('Auth validation error:', err);
    // On error, redirect to login
    window.location.href = '/login';
  });
})();

// ─── API Helper Function ─────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  try {
    // Get token from storage
    const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
    
    // Add Authorization header if token exists
    const headers = {
      ...(opts.headers || {})
    };
    
    // Only add Content-Type if not FormData (FormData sets its own Content-Type with boundary)
    if (!(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(API + path, {
      ...opts,
      headers,
      credentials: 'include'  // Include cookies
    });
    
    return response;
  } catch (e) {
    console.error('API fetch error:', e);
    throw e;
  }
}

// ─── Toast Notification ──────────────────────────────────────────────────
function toast(title, msg = '', isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  document.getElementById('toast-title').textContent = title;
  document.getElementById('toast-msg').textContent = msg;
  t.className = isError ? 'show error' : 'show';
  setTimeout(() => t.className = '', 4000);
}

// ─── Modal ───────────────────────────────────────────────────────────────
function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('show');
  }
}

document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.modal-backdrop').forEach(el => {
    el.addEventListener('click', function (e) {
      if (e.target === this) closeModal(this.id);
    });
  });
});

// ─── Initialize Mahasiswa Portal ─────────────────────────────────────────
function initializeMahasiswaPortal() {
  console.log('[INIT] Starting portal initialization...');
  console.log('[INIT] currentMahasiswa:', currentMahasiswa);
  
  if (!currentMahasiswa) {
    console.error('[INIT] ERROR: No mahasiswa data available');
    return;
  }
  
  console.log('[INIT] Initializing portal for:', currentMahasiswa.name);
  
  // Hide all mahasiswa selector dropdowns
  console.log('[INIT] Hiding selectors...');
  hideAllMahasiswaSelectors();
  
  // Show welcome message
  console.log('[INIT] Showing welcome message...');
  showWelcomeMessage();
  
  // Auto-load dashboard data
  console.log('[INIT] Loading dashboard data...');
  loadDashboardData();
  
  console.log('[INIT] Portal initialization complete!');
}

function hideAllMahasiswaSelectors() {
  console.log('[HIDE] Hiding all mahasiswa selectors...');
  
  // List of all mahasiswa selector IDs
  const selectorIds = [
    'dashboard-mahasiswa-select',
    'profile-mahasiswa-select', 
    'riwayat-mahasiswa-select',
    'izin-mahasiswa-select',
    'kehadiran-mahasiswa-select',
    'sertifikat-mahasiswa-select'
  ];
  
  let hiddenCount = 0;
  selectorIds.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      const container = element.closest('.form-row');
      if (container) {
        container.style.display = 'none';
        hiddenCount++;
        console.log(`[HIDE] Hidden: ${id}`);
      } else {
        console.warn(`[HIDE] Container not found for: ${id}`);
      }
    } else {
      console.warn(`[HIDE] Element not found: ${id}`);
    }
  });
  
  console.log(`[HIDE] Total hidden: ${hiddenCount}/${selectorIds.length}`);
}

function showWelcomeMessage() {
  console.log('[WELCOME] Creating welcome message...');
  
  // Update welcome message in page header
  const welcomeElement = document.getElementById('welcome-message');
  if (welcomeElement && currentMahasiswa) {
    welcomeElement.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; margin-top: 8px;">
        <span class="material-symbols-outlined" style="font-size: 20px; color: var(--primary);">account_circle</span>
        <div>
          <span style="font-weight: 600; color: var(--text);">${currentMahasiswa.name}</span>
          <span style="color: var(--text-muted); margin-left: 8px;">
            ${currentMahasiswa.id} • Kelompok ${currentMahasiswa.kelompok} • ${currentMahasiswa.jurusan}
          </span>
        </div>
      </div>
    `;
    console.log('[WELCOME] Welcome message updated in header');
  } else {
    console.error('[WELCOME] Welcome element not found or no mahasiswa data');
  }
}

// ─── Submit Izin ─────────────────────────────────────────────────────────
async function submitIzin() {
  if (!currentMahasiswa) {
    return toast('Error: Data mahasiswa tidak ditemukan', '', true);
  }
  
  const mahasiswaId = currentMahasiswa.id;
  const type = document.getElementById('izin-type-select').value;
  const date = document.getElementById('izin-date-input').value;
  const keterangan = document.getElementById('izin-keterangan-input').value.trim();
  const buktiFile = document.getElementById('izin-bukti-input').files[0];

  // Validasi
  if (!date) return toast('Tanggal wajib diisi', '', true);
  if (!keterangan) return toast('Keterangan wajib diisi', '', true);
  if (keterangan.length < 10) return toast('Keterangan terlalu singkat', 'Minimal 10 karakter', true);
  
  // Validasi bukti WAJIB
  if (!buktiFile) {
    return toast('Bukti wajib diupload', 'Upload surat dokter, surat izin, atau bukti pendukung lainnya', true);
  }

  // Validasi file bukti
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (!allowedTypes.includes(buktiFile.type)) {
    return toast('Format file tidak didukung', 'Hanya JPG, PNG, PDF', true);
  }
  if (buktiFile.size > 10 * 1024 * 1024) {
    return toast('File terlalu besar', 'Maksimal 10MB', true);
  }

  const formData = new FormData();
  formData.append('mahasiswa_id', mahasiswaId);
  formData.append('type', type);
  formData.append('date', date);
  formData.append('keterangan', keterangan);
  formData.append('bukti', buktiFile);

  // Disable button
  const btn = document.querySelector('.btn-primary');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined icon-md" style="animation:spin 1s linear infinite">sync</span> Mengirim...';

  try {
    const res = await fetch(API + '/izin/submit', { method: 'POST', body: formData });
    const result = await res.json();

    if (result.success) {
      toast('Pengajuan berhasil dikirim!',
        `${type === 'izin' ? 'Izin' : 'Sakit'} untuk tanggal ${date} sedang diproses`);
      resetIzinForm();
      loadMyIzinHistory();
    } else {
      toast('Gagal mengirim pengajuan', result.message, true);
    }
  } catch (e) {
    toast('Gagal mengirim', 'Pastikan server berjalan', true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

function resetIzinForm() {
  document.getElementById('izin-type-select').value = 'izin';
  document.getElementById('izin-date-input').value = new Date().toISOString().split('T')[0];
  document.getElementById('izin-keterangan-input').value = '';
  document.getElementById('izin-bukti-input').value = '';
  document.getElementById('my-izin-table-body').innerHTML =
    '<tr><td colspan="7" class="empty-state">Memuat riwayat...</td></tr>';
}

// ─── Load Riwayat ────────────────────────────────────────────────────────
// Store submissions data for detail modal
let mySubmissionsData = [];

async function loadMyIzinHistory() {
  if (!currentMahasiswa) return;
  
  const mahasiswaId = currentMahasiswa.id;
  const tbody = document.getElementById('my-izin-table-body');
  tbody.innerHTML = '<tr><td colspan="7" class="loading-state"><div class="spinner" style="margin:0 auto"></div></td></tr>';

  try {
    const res = await fetch(API + `/izin/mahasiswa/${mahasiswaId}`);
    const result = await res.json();

    if (!result.success || !result.data.submissions.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Belum ada pengajuan</td></tr>';
      return;
    }

    mySubmissionsData = result.data.submissions; // Store for detail modal

    tbody.innerHTML = result.data.submissions.map(s => {
      const statusBadge = {
        pending:  '<span class="badge badge-yellow"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">schedule</span> Pending</span>',
        approved: '<span class="badge badge-green"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">check_circle</span> Disetujui</span>',
        rejected: '<span class="badge badge-red"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">cancel</span> Ditolak</span>'
      }[s.status] || s.status;

      const verifiedBy = s.verified_by 
        ? `<div style="font-weight:600">${s.verified_by}</div><div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">${s.verified_at ? new Date(s.verified_at).toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'numeric'}) : ''}</div>`
        : '<span style="color:var(--text-muted)">—</span>';

      return `<tr>
        <td style="font-family:var(--font-mono);font-size:13px;font-weight:600">${s.date}</td>
        <td>
          <div style="font-weight:600">${currentMahasiswa.name}</div>
        </td>
        <td><span class="badge badge-blue">${currentMahasiswa.kelompok}</span></td>
        <td style="font-size:14px">${currentMahasiswa.jurusan}</td>
        <td>${statusBadge}</td>
        <td style="font-size:13px">${verifiedBy}</td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="openDetailMahasiswaModal(${s.id})" title="Lihat Detail">
            <span class="material-symbols-outlined" style="font-size:14px">visibility</span>
            Detail
          </button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" class="error-state">Gagal memuat data</td></tr>';
  }
}

// Open detail modal for mahasiswa
function openDetailMahasiswaModal(submissionId) {
  const submission = mySubmissionsData.find(s => s.id === submissionId);
  if (!submission) {
    toast('Data tidak ditemukan', '', true);
    return;
  }

  // Fill mahasiswa info
  document.getElementById('mhs-detail-mahasiswa-id').textContent = currentMahasiswa.id;
  document.getElementById('mhs-detail-mahasiswa-name').textContent = currentMahasiswa.name;
  document.getElementById('mhs-detail-mahasiswa-kelompok').textContent = currentMahasiswa.kelompok;
  document.getElementById('mhs-detail-mahasiswa-jurusan').textContent = currentMahasiswa.jurusan;

  // Fill pengajuan info
  const typeBadge = submission.submission_type === 'izin'
    ? '<span class="badge badge-blue"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">description</span> Izin</span>'
    : '<span class="badge badge-orange"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">medical_services</span> Sakit</span>';
  document.getElementById('mhs-detail-jenis').innerHTML = typeBadge;
  document.getElementById('mhs-detail-tanggal').textContent = submission.date;
  document.getElementById('mhs-detail-submitted-at').textContent = submission.submitted_at 
    ? new Date(submission.submitted_at).toLocaleString('id-ID')
    : '—';
  
  const statusBadge = {
    pending:  '<span class="badge badge-yellow"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">schedule</span> Pending</span>',
    approved: '<span class="badge badge-green"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">check_circle</span> Disetujui</span>',
    rejected: '<span class="badge badge-red"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">cancel</span> Ditolak</span>'
  }[submission.status] || submission.status;
  document.getElementById('mhs-detail-status').innerHTML = statusBadge;
  document.getElementById('mhs-detail-keterangan').textContent = submission.keterangan;

  // Fill bukti
  const buktiContainer = document.getElementById('mhs-detail-bukti-container');
  if (submission.bukti_path) {
    const ext = submission.bukti_path.split('.').pop().toLowerCase();
    const filename = submission.bukti_path.split(/[\\/]/).pop();
    const url = API + `/izin/bukti/${filename}`;
    
    if (['jpg', 'jpeg', 'png'].includes(ext)) {
      buktiContainer.innerHTML = `<img src="${url}" style="max-width:100%;max-height:400px;border-radius:var(--radius-md);border:2px solid var(--border)">`;
    } else if (ext === 'pdf') {
      buktiContainer.innerHTML = `
        <div style="padding:30px">
          <span class="material-symbols-outlined" style="font-size:64px;color:var(--danger)">picture_as_pdf</span>
          <p style="margin-top:12px;font-weight:600">File PDF</p>
          <a href="${url}" target="_blank" class="btn btn-primary" style="margin-top:12px;display:inline-flex;gap:6px">
            <span class="material-symbols-outlined" style="font-size:16px">open_in_new</span> Buka PDF
          </a>
        </div>`;
    }
  } else {
    buktiContainer.innerHTML = '<span style="color:var(--text-muted)">Tidak ada bukti</span>';
  }

  // Fill verification info
  const verificationInfo = document.getElementById('mhs-detail-verification-info');
  if (submission.status !== 'pending') {
    verificationInfo.style.display = 'block';
    document.getElementById('mhs-detail-verified-by').textContent = submission.verified_by || '—';
    document.getElementById('mhs-detail-verified-at').textContent = submission.verified_at 
      ? new Date(submission.verified_at).toLocaleString('id-ID')
      : '—';
    
    // Show rejection reason if rejected
    const rejectionContainer = document.getElementById('mhs-detail-rejection-reason-container');
    if (submission.status === 'rejected' && submission.rejection_reason) {
      rejectionContainer.style.display = 'block';
      document.getElementById('mhs-detail-rejection-reason').textContent = submission.rejection_reason;
    } else {
      rejectionContainer.style.display = 'none';
    }
  } else {
    verificationInfo.style.display = 'none';
  }

  // Open modal
  document.getElementById('modal-detail-mahasiswa').classList.add('show');
}

function viewBukti(submissionId, buktiPath) {
  const ext = buktiPath.split('.').pop().toLowerCase();
  const filename = buktiPath.split(/[\\/]/).pop();
  const url = API + `/izin/bukti/${filename}`;
  const content = document.getElementById('bukti-content');

  if (['jpg', 'jpeg', 'png'].includes(ext)) {
    content.innerHTML = `<img src="${url}" class="bukti-image">`;
  } else if (ext === 'pdf') {
    content.innerHTML = `
      <div class="bukti-pdf-container">
        <span class="material-symbols-outlined bukti-pdf-icon">picture_as_pdf</span>
        <p class="bukti-pdf-text">File PDF tidak bisa ditampilkan langsung.</p>
        <a href="${url}" target="_blank" class="btn btn-primary bukti-pdf-button">
          <span class="material-symbols-outlined icon-md">open_in_new</span> Buka PDF
        </a>
      </div>`;
  } else {
    content.innerHTML = '<p class="text-muted">Format file tidak dikenali</p>';
  }

  document.getElementById('modal-bukti').classList.add('show');
}

// ─── Event Listeners ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  // Set default date
  document.getElementById('izin-date-input').value = new Date().toISOString().split('T')[0];
  
  // Auto-load izin history when section is shown
  // Will be triggered by initializeMahasiswaPortal
});


// ─── Tab Switching ───────────────────────────────────────────────────────────
function switchTab(tab) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  
  // Show/hide forms
  if (tab === 'izin') {
    document.getElementById('form-izin').style.display = 'block';
    document.getElementById('form-kehadiran').style.display = 'none';
  } else {
    document.getElementById('form-izin').style.display = 'none';
    document.getElementById('form-kehadiran').style.display = 'block';
  }
}

// ─── Kehadiran Manual Functions ──────────────────────────────────────────────
async function submitKehadiran() {
  if (!currentMahasiswa) {
    return toast('Error: Data mahasiswa tidak ditemukan', '', true);
  }
  
  const mahasiswaId = currentMahasiswa.id;
  const date = document.getElementById('kehadiran-date-input').value;
  const checkIn = document.getElementById('kehadiran-checkin-input').value;
  const checkOut = document.getElementById('kehadiran-checkout-input').value;
  const keterangan = document.getElementById('kehadiran-keterangan-input').value.trim();
  const buktiFile = document.getElementById('kehadiran-bukti-input').files[0];

  // Validasi
  if (!date) {
    toast('Tanggal wajib diisi', '', true);
    return;
  }
  if (!checkIn) {
    toast('Jam masuk wajib diisi', '', true);
    return;
  }
  if (!checkOut) {
    toast('Jam keluar wajib diisi', '', true);
    return;
  }
  if (!keterangan || keterangan.length < 10) {
    toast('Keterangan minimal 10 karakter', '', true);
    return;
  }
  if (!buktiFile) {
    toast('Bukti wajib diupload', '', true);
    return;
  }

  // Validasi ukuran file
  if (buktiFile.size > 10 * 1024 * 1024) {
    toast('Ukuran file maksimal 10MB', '', true);
    return;
  }

  // Prepare FormData
  const formData = new FormData();
  formData.append('mahasiswa_id', mahasiswaId);
  formData.append('date', date);
  formData.append('check_in_time', checkIn);
  formData.append('check_out_time', checkOut);
  formData.append('keterangan', keterangan);
  formData.append('bukti', buktiFile);

  try {
    const res = await fetch(API + '/kehadiran/submit', {
      method: 'POST',
      body: formData
    });

    const result = await res.json();

    if (result.success) {
      toast('Pengajuan Berhasil!', 'Menunggu verifikasi dari Tim Disiplin');
      resetKehadiranForm();
      loadMyKehadiranHistory(); // Reload history
    } else {
      toast('Gagal mengirim pengajuan', result.message, true);
    }
  } catch (error) {
    toast('Error', 'Terjadi kesalahan saat mengirim pengajuan', true);
    console.error(error);
  }
}

function resetKehadiranForm() {
  document.getElementById('kehadiran-date-input').value = '';
  document.getElementById('kehadiran-checkin-input').value = '';
  document.getElementById('kehadiran-checkout-input').value = '';
  document.getElementById('kehadiran-keterangan-input').value = '';
  document.getElementById('kehadiran-bukti-input').value = '';
}

async function loadMyKehadiranHistory() {
  if (!currentMahasiswa) return;
  
  const mahasiswaId = currentMahasiswa.id;
  const tbody = document.getElementById('my-kehadiran-table-body');
  tbody.innerHTML = '<tr><td colspan="7" class="loading-state"><div class="spinner" style="margin:0 auto"></div></td></tr>';

  try {
    const res = await fetch(API + `/kehadiran/mahasiswa/${mahasiswaId}`);
    const result = await res.json();

    if (!result.success || !result.data.submissions || result.data.submissions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Belum ada pengajuan kehadiran</td></tr>';
      return;
    }

    tbody.innerHTML = result.data.submissions.map(s => {
      const statusBadge = {
        pending:  '<span class="badge badge-yellow"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">schedule</span> Pending</span>',
        approved: '<span class="badge badge-green"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">check_circle</span> Disetujui</span>',
        rejected: '<span class="badge badge-red"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">cancel</span> Ditolak</span>'
      }[s.status] || s.status;

      const verifiedBy = s.verified_by 
        ? `<div style="font-weight:600">${s.verified_by}</div><div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">${s.verified_at ? new Date(s.verified_at).toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'numeric'}) : ''}</div>`
        : '<span style="color:var(--text-muted)">—</span>';

      return `<tr>
        <td style="font-family:var(--font-mono);font-size:13px;font-weight:600">${s.date}</td>
        <td>
          <div style="font-weight:600">${currentMahasiswa.name}</div>
        </td>
        <td><span class="badge badge-blue">${currentMahasiswa.kelompok}</span></td>
        <td style="font-size:14px">${currentMahasiswa.jurusan}</td>
        <td>${statusBadge}</td>
        <td style="font-size:13px">${verifiedBy}</td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="openDetailKehadiranModal(${s.id})" title="Lihat Detail">
            <span class="material-symbols-outlined" style="font-size:14px">visibility</span>
            Detail
          </button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('Error loading kehadiran history:', e);
    tbody.innerHTML = '<tr><td colspan="7" class="error-state">Gagal memuat data</td></tr>';
  }
}

// ─── Dashboard Functions ─────────────────────────────────────────────────
async function loadDashboardData() {
  if (!currentMahasiswa) {
    console.error('No mahasiswa data');
    return;
  }
  
  const mahasiswaId = currentMahasiswa.id;

  try {
    // Load attendance statistics
    const res = await fetch(`${API}/mahasiswa/${mahasiswaId}/statistics`);
    const result = await res.json();
    
    if (result.success) {
      const stats = result.data;
      
      // Update basic stats
      document.getElementById('stat-total-hadir').textContent = stats.totalHadir || 0;
      document.getElementById('stat-bulan-ini').textContent = stats.hadirBulanIni || 0;
      document.getElementById('stat-izin-sakit').textContent = stats.totalIzin || 0;
      document.getElementById('stat-tidak-hadir').textContent = stats.tidakHadir || 0;
      
      // Update additional stats
      document.getElementById('stat-percentage').textContent = `${stats.persentaseKehadiran || 0}%`;
      document.getElementById('stat-avg-duration').textContent = stats.rataRataDurasi || '0 jam';
      document.getElementById('stat-longest-streak').textContent = `${stats.streakTerpanjang || 0} hari`;
      document.getElementById('stat-late-count').textContent = `${stats.terlambat || 0} kali`;
      
      // Load charts
      loadAttendanceChart(mahasiswaId);
      loadMonthlyChart(mahasiswaId);
      loadRecentActivity(mahasiswaId);
      
      document.getElementById('dashboard-stats').style.display = 'block';
    }
  } catch (e) {
    console.error('Error loading dashboard data:', e);
    toast('Gagal memuat statistik', 'Pastikan server berjalan', true);
  }
}

async function loadAttendanceChart(mahasiswaId) {
  try {
    const res = await fetch(`${API}/mahasiswa/${mahasiswaId}/chart/weekly`);
    const result = await res.json();
    
    if (result.success && result.data) {
      renderAttendanceChart(result.data);
    }
  } catch (e) {
    console.error('Error loading attendance chart:', e);
  }
}

async function loadMonthlyChart(mahasiswaId) {
  try {
    const res = await fetch(`${API}/mahasiswa/${mahasiswaId}/chart/monthly`);
    const result = await res.json();
    
    if (result.success && result.data) {
      renderMonthlyChart(result.data);
    }
  } catch (e) {
    console.error('Error loading monthly chart:', e);
  }
}

async function loadRecentActivity(mahasiswaId) {
  try {
    const res = await fetch(`${API}/mahasiswa/${mahasiswaId}/activity`);
    const result = await res.json();
    
    if (result.success && result.data) {
      renderRecentActivity(result.data);
    }
  } catch (e) {
    console.error('Error loading recent activity:', e);
  }
}

function renderAttendanceChart(data) {
  const canvas = document.getElementById('attendance-chart');
  const ctx = canvas.getContext('2d');
  
  // Simple chart implementation (you can replace with Chart.js)
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Set canvas size
  canvas.width = canvas.offsetWidth;
  canvas.height = 200;
  
  const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  const values = data.attendance || [0, 0, 0, 0, 0, 0, 0];
  const maxValue = Math.max(...values, 1);
  
  const barWidth = canvas.width / days.length * 0.6;
  const barSpacing = canvas.width / days.length * 0.4;
  
  ctx.fillStyle = '#2D5BFF';
  
  values.forEach((value, index) => {
    const barHeight = (value / maxValue) * (canvas.height - 40);
    const x = index * (barWidth + barSpacing) + barSpacing / 2;
    const y = canvas.height - barHeight - 20;
    
    ctx.fillRect(x, y, barWidth, barHeight);
    
    // Draw labels
    ctx.fillStyle = '#6B7A90';
    ctx.font = '12px DM Sans';
    ctx.textAlign = 'center';
    ctx.fillText(days[index], x + barWidth / 2, canvas.height - 5);
    
    ctx.fillStyle = '#2D5BFF';
  });
}

function renderMonthlyChart(data) {
  const canvas = document.getElementById('monthly-chart');
  const ctx = canvas.getContext('2d');
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  canvas.width = canvas.offsetWidth;
  canvas.height = 200;
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun'];
  const values = data.monthly || [0, 0, 0, 0, 0, 0];
  const maxValue = Math.max(...values, 1);
  
  const barWidth = canvas.width / months.length * 0.6;
  const barSpacing = canvas.width / months.length * 0.4;
  
  ctx.fillStyle = '#06D6A0';
  
  values.forEach((value, index) => {
    const barHeight = (value / maxValue) * (canvas.height - 40);
    const x = index * (barWidth + barSpacing) + barSpacing / 2;
    const y = canvas.height - barHeight - 20;
    
    ctx.fillRect(x, y, barWidth, barHeight);
    
    ctx.fillStyle = '#6B7A90';
    ctx.font = '12px DM Sans';
    ctx.textAlign = 'center';
    ctx.fillText(months[index], x + barWidth / 2, canvas.height - 5);
    
    ctx.fillStyle = '#06D6A0';
  });
}

function renderRecentActivity(activities) {
  const container = document.getElementById('recent-activity');
  
  if (!activities || activities.length === 0) {
    container.innerHTML = '<div class="empty-state">Belum ada aktivitas</div>';
    return;
  }
  
  container.innerHTML = activities.map(activity => `
    <div class="activity-item">
      <div class="activity-icon" style="background:${getActivityColor(activity.type)};color:white">
        <span class="material-symbols-outlined">${getActivityIcon(activity.type)}</span>
      </div>
      <div class="activity-content">
        <div class="activity-title">${activity.title}</div>
        <div class="activity-desc">${activity.description}</div>
        <div class="activity-time">${formatDateTime(activity.timestamp)}</div>
      </div>
    </div>
  `).join('');
}

function getActivityColor(type) {
  const colors = {
    'checkin': '#06D6A0',
    'checkout': '#2D5BFF',
    'izin': '#FFD23F',
    'sakit': '#EF476F',
    'late': '#FF6B35'
  };
  return colors[type] || '#6B7A90';
}

function getActivityIcon(type) {
  const icons = {
    'checkin': 'login',
    'checkout': 'logout',
    'izin': 'edit_note',
    'sakit': 'medical_services',
    'late': 'schedule'
  };
  return icons[type] || 'notifications';
}

// ─── Sertifikat Functions ────────────────────────────────────────────────
async function loadSertifikatData() {
  if (!currentMahasiswa) return;
  
  document.getElementById('sertifikat-options').style.display = 'block';
  updateSertifikatPreview();
  loadSertifikatHistory(currentMahasiswa.id);
}

async function updateSertifikatPreview() {
  if (!currentMahasiswa) return;
  
  const mahasiswaId = currentMahasiswa.id;
  const periode = getSertifikatPeriode();
  if (!periode) return;
  
  try {
    const res = await fetch(`${API}/mahasiswa/${mahasiswaId}/sertifikat/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(periode)
    });
    
    const result = await res.json();
    if (result.success) {
      const stats = result.data;
      document.getElementById('preview-total-hadir').textContent = stats.totalHadir || 0;
      document.getElementById('preview-persentase').textContent = `${stats.persentase || 0}%`;
      document.getElementById('preview-total-izin').textContent = stats.totalIzin || 0;
      document.getElementById('preview-total-hari').textContent = stats.totalHari || 0;
      
      document.getElementById('sertifikat-preview').style.display = 'block';
    }
  } catch (e) {
    console.error('Error updating sertifikat preview:', e);
  }
}

function getSertifikatPeriode() {
  const periodeType = document.getElementById('sertifikat-periode').value;
  
  switch (periodeType) {
    case 'monthly':
      return {
        type: 'monthly',
        month: document.getElementById('sertifikat-bulan').value,
        year: document.getElementById('sertifikat-tahun-monthly').value
      };
    case 'semester':
      return {
        type: 'semester',
        semester: document.getElementById('sertifikat-semester').value,
        year: document.getElementById('sertifikat-tahun-semester').value
      };
    case 'yearly':
      return {
        type: 'yearly',
        year: document.getElementById('sertifikat-tahun-yearly').value
      };
    case 'custom':
      return {
        type: 'custom',
        startDate: document.getElementById('sertifikat-start-date').value,
        endDate: document.getElementById('sertifikat-end-date').value
      };
    default:
      return null;
  }
}

async function generateSertifikat() {
  if (!currentMahasiswa) {
    toast('Error: Data mahasiswa tidak ditemukan', '', true);
    return;
  }
  
  const mahasiswaId = currentMahasiswa.id;
  const template = document.getElementById('sertifikat-template').value;
  const periode = getSertifikatPeriode();
  
  if (!periode) {
    toast('Lengkapi periode', 'Pilih periode sertifikat', true);
    return;
  }
  
  const btn = event.target;
  btn.classList.add('btn-loading');
  btn.disabled = true;
  
  try {
    const res = await fetch(`${API}/mahasiswa/${mahasiswaId}/sertifikat/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...periode, template })
    });
    
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sertifikat_${mahasiswaId}_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast('Sertifikat berhasil diunduh', 'File PDF telah disimpan');
      loadSertifikatHistory(mahasiswaId);
    } else {
      const result = await res.json();
      toast('Gagal generate sertifikat', result.message || 'Terjadi kesalahan', true);
    }
  } catch (e) {
    console.error('Error generating sertifikat:', e);
    toast('Gagal generate sertifikat', 'Pastikan server berjalan', true);
  } finally {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}

async function previewSertifikat() {
  if (!currentMahasiswa) return;
  
  const mahasiswaId = currentMahasiswa.id;
  const template = document.getElementById('sertifikat-template').value;
  const periode = getSertifikatPeriode();
  
  if (!periode) {
    toast('Lengkapi semua field', 'Pilih mahasiswa dan periode', true);
    return;
  }
  
  try {
    const res = await fetch(`${API}/mahasiswa/${mahasiswaId}/sertifikat/preview-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...periode, template })
    });
    
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } else {
      const result = await res.json();
      toast('Gagal preview sertifikat', result.message || 'Terjadi kesalahan', true);
    }
  } catch (e) {
    console.error('Error previewing sertifikat:', e);
    toast('Gagal preview sertifikat', 'Pastikan server berjalan', true);
  }
}

async function loadSertifikatHistory(mahasiswaId) {
  try {
    const res = await fetch(`${API}/mahasiswa/${mahasiswaId}/sertifikat/history`);
    const result = await res.json();
    
    if (result.success) {
      renderSertifikatHistory(result.data || []);
    }
  } catch (e) {
    console.error('Error loading sertifikat history:', e);
  }
}

function renderSertifikatHistory(history) {
  const tbody = document.getElementById('sertifikat-history-table');
  
  if (history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Belum ada sertifikat yang diunduh</td></tr>';
    return;
  }
  
  tbody.innerHTML = history.map(item => `
    <tr>
      <td>${formatDateTime(item.created_at)}</td>
      <td>${formatPeriode(item.periode)}</td>
      <td><span class="badge">${item.template}</span></td>
      <td>${item.total_hadir}</td>
      <td>${item.persentase}%</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="downloadSertifikatHistory('${item.id}')">
          <span class="material-symbols-outlined">download</span>
        </button>
      </td>
    </tr>
  `).join('');
}

function formatPeriode(periode) {
  const p = JSON.parse(periode);
  switch (p.type) {
    case 'monthly':
      return `${getMonthName(p.month)} ${p.year}`;
    case 'semester':
      return `${p.semester} ${p.year}`;
    case 'yearly':
      return p.year;
    case 'custom':
      return `${p.startDate} - ${p.endDate}`;
    default:
      return '-';
  }
}

function getMonthName(month) {
  const months = {
    '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
    '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
    '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember'
  };
  return months[month] || month;
}

async function downloadSertifikatHistory(historyId) {
  try {
    const res = await fetch(`${API}/sertifikat/download/${historyId}`);
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sertifikat_${historyId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  } catch (e) {
    console.error('Error downloading sertifikat:', e);
    toast('Gagal download sertifikat', 'Terjadi kesalahan', true);
  }
}

// ─── Utility Functions ───────────────────────────────────────────────────
function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ─── Enhanced Profile Functions ──────────────────────────────────────────
async function loadProfileData() {
  if (!currentMahasiswa) return;

  try {
    const res = await fetch(`${API}/mahasiswa/${currentMahasiswa.id}`);
    const result = await res.json();
    
    if (result.success && result.data) {
      const mhs = result.data;
      document.getElementById('profile-id').value = mhs.mahasiswa_id || mhs.id;
      document.getElementById('profile-name').value = mhs.name || '';
      document.getElementById('profile-kelompok').value = mhs.kelompok || '';
      document.getElementById('profile-jurusan').value = mhs.jurusan || '';
      document.getElementById('profile-email').value = mhs.email || '';
      
      document.getElementById('profile-form').style.display = 'block';
    }
  } catch (e) {
    console.error('Error loading profile:', e);
    toast('Gagal memuat profil', 'Pastikan server berjalan', true);
  }
}

async function updateProfile() {
  if (!currentMahasiswa) return;
  
  const mahasiswaId = currentMahasiswa.id;
  const name = document.getElementById('profile-name').value.trim();
  const kelompok = document.getElementById('profile-kelompok').value.trim();
  const jurusan = document.getElementById('profile-jurusan').value.trim();
  const email = document.getElementById('profile-email').value.trim();

  if (!name || !kelompok || !jurusan) {
    toast('Lengkapi field wajib', 'Nama, kelompok, dan jurusan harus diisi', true);
    return;
  }

  const btn = event.target;
  btn.classList.add('btn-loading');
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/mahasiswa/${mahasiswaId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, kelompok, jurusan, email })
    });

    const result = await res.json();
    if (result.success) {
      toast('Profil berhasil diperbarui', 'Data mahasiswa telah disimpan');
      // Update currentMahasiswa
      currentMahasiswa.name = name;
      currentMahasiswa.kelompok = kelompok;
      currentMahasiswa.jurusan = jurusan;
      currentMahasiswa.email = email;
      // Update welcome message
      showWelcomeMessage();
    } else {
      toast('Gagal memperbarui profil', result.message || 'Terjadi kesalahan', true);
    }
  } catch (e) {
    console.error('Error updating profile:', e);
    toast('Gagal memperbarui profil', 'Pastikan server berjalan', true);
  } finally {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}

// Initialize enhanced features on page load
document.addEventListener('DOMContentLoaded', function() {
  // Populate all mahasiswa dropdowns
  loadMahasiswa();
  
  // Add event listeners for sertifikat periode changes
  const periodeInputs = [
    'sertifikat-bulan', 'sertifikat-tahun-monthly',
    'sertifikat-semester', 'sertifikat-tahun-semester',
    'sertifikat-tahun-yearly',
    'sertifikat-start-date', 'sertifikat-end-date'
  ];
  
  periodeInputs.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('change', updateSertifikatPreview);
    }
  });
});
// ─── Enhanced Riwayat Functions ──────────────────────────────────────────
async function loadRiwayatData() {
  if (!currentMahasiswa) return;

  document.getElementById('riwayat-filters').style.display = 'block';
  document.getElementById('riwayat-table-container').style.display = 'block';
  
  // Populate year filter
  populateYearFilter();
  
  // Load initial data
  await filterRiwayat();
}

function populateYearFilter() {
  const yearSelect = document.getElementById('filter-tahun');
  const currentYear = new Date().getFullYear();
  
  yearSelect.innerHTML = '<option value="">Semua</option>';
  
  // Add years from current year back to 3 years ago
  for (let year = currentYear; year >= currentYear - 3; year--) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    yearSelect.appendChild(option);
  }
}

async function filterRiwayat() {
  if (!currentMahasiswa) return;
  
  const mahasiswaId = currentMahasiswa.id;

  const filters = {
    mahasiswa_id: mahasiswaId,
    hari: document.getElementById('filter-hari').value,
    bulan: document.getElementById('filter-bulan').value,
    tahun: document.getElementById('filter-tahun').value,
    status: document.getElementById('filter-status').value
  };

  try {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });

    const res = await fetch(`${API}/mahasiswa/riwayat?${queryParams}`);
    const result = await res.json();

    if (result.success) {
      renderRiwayatTable(result.data || []);
    } else {
      toast('Gagal memuat riwayat', result.message || 'Terjadi kesalahan', true);
    }
  } catch (e) {
    console.error('Error loading riwayat:', e);
    toast('Gagal memuat riwayat', 'Pastikan server berjalan', true);
  }
}

function renderRiwayatTable(data) {
  const tbody = document.getElementById('riwayat-table-body');
  
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Tidak ada data sesuai filter</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((row, index) => {
    const tanggal = new Date(row.date);
    const hari = tanggal.toLocaleDateString('id-ID', { weekday: 'long' });
    const tanggalStr = tanggal.toLocaleDateString('id-ID');
    
    const jamMasuk = row.check_in_time || '-';
    const jamKeluar = row.check_out_time || '-';
    const durasi = calculateDuration(row.check_in_time, row.check_out_time);
    
    let status = 'Tidak Hadir';
    let statusClass = 'badge-danger';
    
    if (row.status === 'present') {
      status = 'Hadir';
      statusClass = 'badge-success';
    } else if (row.status === 'izin') {
      status = 'Izin';
      statusClass = 'badge-warning';
    } else if (row.status === 'sakit') {
      status = 'Sakit';
      statusClass = 'badge-warning';
    }

    return `
      <tr>
        <td>${index + 1}</td>
        <td>${tanggalStr}</td>
        <td>${hari}</td>
        <td>${jamMasuk}</td>
        <td>${jamKeluar}</td>
        <td>${durasi}</td>
        <td><span class="badge ${statusClass}">${status}</span></td>
      </tr>
    `;
  }).join('');
}

function calculateDuration(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '-';
  
  const start = new Date(`2000-01-01 ${checkIn}`);
  const end = new Date(`2000-01-01 ${checkOut}`);
  
  if (end < start) {
    // Handle next day checkout
    end.setDate(end.getDate() + 1);
  }
  
  const diffMs = end - start;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${diffHours}j ${diffMinutes}m`;
}

function resetRiwayatFilter() {
  document.getElementById('filter-hari').value = '';
  document.getElementById('filter-bulan').value = '';
  document.getElementById('filter-tahun').value = '';
  document.getElementById('filter-status').value = '';
  
  filterRiwayat();
}

async function exportRiwayatCSV() {
  if (!currentMahasiswa) {
    toast('Error: Data mahasiswa tidak ditemukan', '', true);
    return;
  }
  
  const mahasiswaId = currentMahasiswa.id;

  const filters = {
    mahasiswa_id: mahasiswaId,
    hari: document.getElementById('filter-hari').value,
    bulan: document.getElementById('filter-bulan').value,
    tahun: document.getElementById('filter-tahun').value,
    status: document.getElementById('filter-status').value
  };

  try {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });

    const res = await fetch(`${API}/mahasiswa/riwayat/export?${queryParams}`);
    
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `riwayat_kehadiran_${mahasiswaId}_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast('Export berhasil', 'File CSV telah diunduh');
    } else {
      const result = await res.json();
      toast('Export gagal', result.message || 'Terjadi kesalahan', true);
    }
  } catch (e) {
    console.error('Error exporting CSV:', e);
    toast('Export gagal', 'Pastikan server berjalan', true);
  }
}

// ─── Enhanced Izin Functions (REMOVED - using version with currentMahasiswa above) ─────────────────────────────────────────────
// ─── Navigation Functions ────────────────────────────────────────────────
function showSection(sectionName) {
  // Hide all sections
  const sections = ['dashboard', 'profile', 'riwayat', 'izin', 'kehadiran', 'sertifikat'];
  sections.forEach(section => {
    const element = document.getElementById(`section-${section}`);
    if (element) {
      element.style.display = 'none';
    }
  });
  
  // Remove active class from all nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  
  // Show selected section
  const targetSection = document.getElementById(`section-${sectionName}`);
  if (targetSection) {
    targetSection.style.display = 'block';
  }
  
  // Add active class to selected nav item
  const navItem = document.getElementById(`nav-${sectionName}`);
  if (navItem) {
    navItem.classList.add('active');
  }
  
  // Auto-load data for the section
  if (currentMahasiswa) {
    switch(sectionName) {
      case 'dashboard':
        loadDashboardData();
        break;
      case 'profile':
        loadProfileData();
        break;
      case 'riwayat':
        loadRiwayatData();
        break;
      case 'izin':
        loadMyIzinHistory();
        break;
      case 'kehadiran':
        loadMyKehadiranHistory();
        break;
      case 'sertifikat':
        loadSertifikatData();
        break;
    }
  }
}

// ─── Load Mahasiswa Data ─────────────────────────────────────────────────
async function loadMahasiswa() {
  // This function is not needed anymore since we use currentMahasiswa
  // But keep it for compatibility
  console.log('[LOAD] loadMahasiswa called - using currentMahasiswa instead');
}

function populateYearDropdowns() {
  const currentYear = new Date().getFullYear();
  const years = [];
  
  for (let year = currentYear; year >= currentYear - 5; year--) {
    years.push(year);
  }
  
  // Populate all year dropdowns
  const yearSelects = [
    'sertifikat-tahun-monthly',
    'sertifikat-tahun-semester',
    'sertifikat-tahun-yearly'
  ];
  
  yearSelects.forEach(id => {
    const select = document.getElementById(id);
    if (select) {
      select.innerHTML = years.map(year => 
        `<option value="${year}">${year}</option>`
      ).join('');
    }
  });
}

function openDetailKehadiranModal(submissionId) {
  // Find submission data
  fetch(`${API}/kehadiran/submissions/${submissionId}`)
    .then(res => res.json())
    .then(result => {
      if (result.success && result.data) {
        const submission = result.data;
        
        // Fill modal with data (similar to izin modal)
        // You can implement this based on your modal structure
        toast('Detail kehadiran', `ID: ${submissionId}`);
      }
    })
    .catch(err => {
      console.error('Error loading kehadiran detail:', err);
      toast('Gagal memuat detail', '', true);
    });
}

// ─── Initialize Page ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  // Load mahasiswa data for all dropdowns (not needed anymore with auto-login)
  loadMahasiswa();
  
  // Show dashboard by default
  showSection('dashboard');
  
  // Initialize year dropdowns for sertifikat
  populateYearDropdowns();
  
  // Set current month as default for sertifikat
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  const monthSelect = document.getElementById('sertifikat-bulan');
  if (monthSelect) {
    monthSelect.value = currentMonth;
  }
  
  // Add event listeners for sertifikat periode changes
  const periodeInputs = [
    'sertifikat-bulan', 'sertifikat-tahun-monthly',
    'sertifikat-semester', 'sertifikat-tahun-semester', 
    'sertifikat-tahun-yearly',
    'sertifikat-start-date', 'sertifikat-end-date'
  ];
  
  periodeInputs.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('change', updateSertifikatPreview);
    }
  });
  
  // Add event listener for sertifikat periode type change
  const periodeSelect = document.getElementById('sertifikat-periode');
  if (periodeSelect) {
    periodeSelect.addEventListener('change', function() {
      // Hide all periode options
      document.getElementById('periode-monthly').style.display = 'none';
      document.getElementById('periode-semester').style.display = 'none';
      document.getElementById('periode-yearly').style.display = 'none';
      document.getElementById('periode-custom').style.display = 'none';
      
      // Show selected periode option
      const selected = this.value;
      if (selected === 'monthly') {
        document.getElementById('periode-monthly').style.display = 'block';
      } else if (selected === 'semester') {
        document.getElementById('periode-semester').style.display = 'block';
      } else if (selected === 'yearly') {
        document.getElementById('periode-yearly').style.display = 'block';
      } else if (selected === 'custom') {
        document.getElementById('periode-custom').style.display = 'block';
      }
      
      updateSertifikatPreview();
    });
    
    // Trigger initial display
    periodeSelect.dispatchEvent(new Event('change'));
  }
  
  // Initialize current time display
  updateCurrentTime();
  setInterval(updateCurrentTime, 1000);
});

// ─── Update Current Time ─────────────────────────────────────────────────
function updateCurrentTime() {
  const timeElement = document.getElementById('current-time');
  if (timeElement) {
    const now = new Date();
    const timeString = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const dateString = now.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    timeElement.textContent = `${dateString} ${timeString}`;
  }
}