const API = 'http://localhost:5000/api';

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
  
  // Validate token with server
  fetch(API + '/auth/validate', {
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
    }
  })
  .catch(err => {
    console.error('Auth validation error:', err);
    // On error, redirect to login
    window.location.href = '/login';
  });
})();

// ─── State ─────────────────────────────────────────────────────────────────
let dashboardData = null;
let attendanceData = [];
let mahasiswaData = [];
let cameraData = [];
let currentPage = 'dashboard';
let currentQRBase64 = '';
let editingCameraId = null;

// ─── Navigation ────────────────────────────────────────────────────────────
function showPage(page) {
      document.querySelectorAll('[id^="page-"]').forEach(s => s.style.display = 'none');
      document.getElementById('page-' + page).style.display = '';
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(n => {
        if (n.textContent.toLowerCase().includes(page === 'dashboard' ? 'dash' : page === 'attendance' ? 'absensi' : page === 'users' ? 'user management' : page === 'cameras' ? 'kamera' : page === 'mahasiswa' ? 'mahasiswa' : page === 'history' ? 'riwayat' : page === 'video-upload' ? 'upload video' : page === 'izin-mahasiswa' ? 'form pengajuan' : page === 'izin-timdis' ? 'verifikasi izin' : page === 'kehadiran-timdis' ? 'verifikasi kehadiran' : 'pengaturan'))
          n.classList.add('active');
      });
      currentPage = page;
      
      // Load settings when settings page is shown
      if (page === 'settings') loadSettings();
      
      if (page === 'attendance') loadFullAttendance();
      if (page === 'users') loadUsers();
      if (page === 'mahasiswa') loadMahasiswa();
      if (page === 'cameras') loadCameras();
      if (page === 'izin-timdis') loadIzinSubmissions();
      if (page === 'kehadiran-timdis') loadKehadiranSubmissions();
    }

    // ─── Clock ──────────────────────────────────────────────────────────────────
    function updateClock() {
      const now = new Date();
      document.getElementById('current-time').textContent = now.toLocaleTimeString('id-ID');
      const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const label = now.toLocaleDateString('id-ID', opts);
      document.getElementById('today-label').textContent = label;
      document.getElementById('att-date-label').textContent = label;
    }
    setInterval(updateClock, 1000);
    updateClock();

    // ─── Toast ──────────────────────────────────────────────────────────────────
    function toast(title, msg = '', isError = false) {
      const t = document.getElementById('toast');
      t.className = isError ? 'error' : '';
      document.getElementById('toast-title').textContent = title;
      document.getElementById('toast-msg').textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3500);
    }

    // ─── API Calls ──────────────────────────────────────────────────────────────
    async function apiFetch(path, opts = {}) {
      try {
        // Get token from storage
        const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
        
        // Add Authorization header if token exists
        const headers = {
          'Content-Type': 'application/json',
          ...(opts.headers || {})
        };
        
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        const r = await fetch(API + path, {
          ...opts,
          headers,
          credentials: 'include'  // Include cookies
        });
        return await r.json();
      } catch (e) {
        return null;
      }
    }

    // ─── Dashboard ──────────────────────────────────────────────────────────────
    async function loadDashboard() {
      const res = await apiFetch('/dashboard');
      if (!res || !res.success) {
        // Demo data mode
        renderDemoData();
        return;
      }
      dashboardData = res.data;
      const s = dashboardData.stats;
      document.getElementById('s-total').textContent = s.total_mahasiswa;
      document.getElementById('s-present').textContent = s.present;
      document.getElementById('s-absent').textContent = s.absent;
      document.getElementById('s-inoffice').textContent = s.still_in;
      const pct = s.total_mahasiswa > 0 ? Math.round(s.present / s.total_mahasiswa * 100) : 0;
      document.getElementById('s-pct').textContent = pct;
      document.getElementById('sidebar-present').textContent = s.present;

      renderRecentAttendance(dashboardData.today || []);
      renderTrend(dashboardData.trend || []);
      renderDeptList(dashboardData.by_kelompok || []);
    }

    function renderDemoData() {
      // Demo static data when API not available
      document.getElementById('s-total').textContent = '24';
      document.getElementById('s-present').textContent = '18';
      document.getElementById('s-absent').textContent = '6';
      document.getElementById('s-inoffice').textContent = '14';
      document.getElementById('s-pct').textContent = '75';
      document.getElementById('sidebar-present').textContent = '18';

      const demo = [
        { name: 'Budi Santoso', kelompok: 'Teknologi', check_in: '08:12:33', check_out: '', status: 'present', camera_id: 'CAM-01', yolo_confidence: 0.91 },
        { name: 'Siti Rahayu', kelompok: 'SDM', check_in: '07:55:10', check_out: '17:01:22', status: 'present', camera_id: 'CAM-01', yolo_confidence: 0.88 },
        { name: 'Ahmad Fauzi', kelompok: 'Keuangan', check_in: '09:03:44', check_out: '', status: 'present', camera_id: 'CAM-02', yolo_confidence: 0.79 },
        { name: 'Dewi Lestari', kelompok: 'Teknologi', check_in: '08:30:01', check_out: '16:45:00', status: 'present', camera_id: 'CAM-01', yolo_confidence: 0.93 },
        { name: 'Reza Pratama', kelompok: 'Operasional', check_in: '08:00:00', check_out: '', status: 'present', camera_id: 'CAM-02', yolo_confidence: 0.85 },
      ];
      renderRecentAttendance(demo);

      const trendData = [
        { date: '2025-01-05', present: 16 }, { date: '2025-01-06', present: 19 }, { date: '2025-01-07', present: 21 },
        { date: '2025-01-08', present: 14 }, { date: '2025-01-09', present: 20 }, { date: '2025-01-10', present: 22 }, { date: '2025-01-11', present: 18 },
      ];
      renderTrend(trendData);

      const deptData = [
        { kelompok: 'Teknologi', count: 7 }, { kelompok: 'SDM', count: 4 }, { kelompok: 'Keuangan', count: 3 }, { kelompok: 'Operasional', count: 4 },
      ];
      renderDeptList(deptData);
    }

    function renderRecentAttendance(list) {
      const colors = ['#4f7cff', '#22d3a0', '#f5a623', '#ff6b6b', '#a78bfa'];
      const tbody = document.getElementById('recent-tbody');
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:30px">Belum ada absensi hari ini</td></tr>';
        return;
      }
      tbody.innerHTML = list.slice(0, 8).map((r, i) => {
        const initials = (r.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const color = colors[i % colors.length];
        const conf = r.yolo_confidence ? `<span style="font-size:10px;color:var(--muted);font-family:var(--mono)">${Math.round(r.yolo_confidence * 100)}%</span>` : '';
        const checkIn = r.check_in ? `<span class="time-val">${r.check_in.slice(11, 19) || r.check_in}</span>` : '<span class="time-dash">—</span>';
        const checkOut = r.check_out ? `<span class="time-val">${r.check_out.slice(11, 19) || r.check_out}</span>` : '<span class="time-dash">—</span>';
        
        // Handle different status types including izin and sakit
        let status;
        if (r.status === 'izin') {
          status = '<span class="badge badge-blue"><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle">description</span> Izin</span>';
        } else if (r.status === 'sakit') {
          status = '<span class="badge badge-orange"><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle">medical_services</span> Sakit</span>';
        } else if (r.check_out) {
          status = '<span class="badge badge-green">Lengkap</span>';
        } else if (r.check_in) {
          status = '<span class="badge badge-yellow">Masih Dalam</span>';
        } else {
          status = '<span class="badge badge-red">Absen</span>';
        }
        
        return `<tr>
      <td><div class="mahasiswa-cell">
        <div class="avatar" style="background:${color}22;color:${color}">${initials}</div>
        <div><div class="mhs-name">${r.name}</div><div class="mhs-dept">${r.kelompok} ${conf}</div></div>
      </div></td>
      <td>${checkIn}</td>
      <td>${checkOut}</td>
      <td>${status}</td>
    </tr>`;
      }).join('');
    }

    function renderTrend(data) {
      const chart = document.getElementById('trend-chart');
      if (!data.length) return;
      const max = Math.max(...data.map(d => d.present), 1);
      const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      chart.innerHTML = data.map(d => {
        const pct = Math.round(d.present / max * 100);
        const day = new Date(d.date).getDay();
        return `<div class="bar-item">
      <div class="bar-fill" style="height:${pct}%" title="${d.date}: ${d.present} hadir">
        <span class="bar-val">${d.present}</span>
      </div>
      <div class="bar-label">${days[day] || ''}</div>
    </div>`;
      }).join('');
    }

    function renderDeptList(data) {
      const total = Math.max(...data.map(d => d.count), 1);
      const colors = ['#4f7cff', '#22d3a0', '#f5a623', '#ff6b6b'];
      document.getElementById('dept-list').innerHTML = data.map((d, i) => `
    <div class="dept-item">
      <div class="dept-name">${d.kelompok}</div>
      <div class="dept-bar-wrap">
        <div class="dept-bar-fill" style="width:${Math.round(d.count / total * 100)}%;background:${colors[i % colors.length]}"></div>
      </div>
      <div class="dept-count">${d.count}</div>
    </div>
  `).join('');
    }

    // ─── Full Attendance ─────────────────────────────────────────────────────────
    async function loadFullAttendance(targetDate = '') {
      let url = '/attendance/today';
      if (targetDate) url = `/attendance/history?start=${targetDate}&end=${targetDate}`;
      const res = await apiFetch(url);
      const list = res?.success ? res.data : getDemoAttendanceFull();
      attendanceData = list;
      renderFullAttendance(list);
    }

    function getDemoAttendanceFull() {
      return [
        { name: 'Budi Santoso', kelompok: 'Teknologi', check_in: '2025-01-11 08:12:33', check_out: '', camera_id: 'CAM-01', status: 'present', yolo_confidence: 0.91 },
        { name: 'Siti Rahayu', kelompok: 'SDM', check_in: '2025-01-11 07:55:10', check_out: '2025-01-11 17:01:22', camera_id: 'CAM-01', status: 'present', yolo_confidence: 0.88 },
        { name: 'Ahmad Fauzi', kelompok: 'Keuangan', check_in: '2025-01-11 09:03:44', check_out: '', camera_id: 'CAM-02', status: 'present', yolo_confidence: 0.79 },
        { name: 'Dewi Lestari', kelompok: 'Teknologi', check_in: '2025-01-11 08:30:01', check_out: '2025-01-11 16:45:00', camera_id: 'CAM-01', status: 'present', yolo_confidence: 0.93 },
        { name: 'Reza Pratama', kelompok: 'Operasional', check_in: '2025-01-11 08:00:00', check_out: '', camera_id: 'CAM-02', status: 'present', yolo_confidence: 0.85 },
      ];
    }

    function renderFullAttendance(list) {
      const tbody = document.getElementById('full-att-tbody');
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:30px">Tidak ada data</td></tr>';
        return;
      }
      tbody.innerHTML = list.map((r, i) => {
        const initials = (r.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const ci = r.check_in ? r.check_in.slice(11, 19) || r.check_in : '—';
        const co = r.check_out ? r.check_out.slice(11, 19) || r.check_out : '—';
        let dur = '—';
        if (r.check_in && r.check_out) {
          const ms = new Date(r.check_out) - new Date(r.check_in);
          const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
          dur = `${h}j ${m}m`;
        }
        const conf = r.yolo_confidence ? `${Math.round(r.yolo_confidence * 100)}%` : '—';
        
        // Handle different status types including izin and sakit
        let status;
        if (r.status === 'izin') {
          status = '<span class="badge badge-blue"><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle">description</span> Izin</span>';
        } else if (r.status === 'sakit') {
          status = '<span class="badge badge-orange"><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle">medical_services</span> Sakit</span>';
        } else if (r.check_out) {
          status = '<span class="badge badge-green">Lengkap</span>';
        } else if (r.check_in) {
          status = '<span class="badge badge-yellow">Hadir</span>';
        } else {
          status = '<span class="badge badge-red">Absen</span>';
        }
        
        return `<tr>
      <td style="color:var(--muted);font-family:var(--mono)">${i + 1}</td>
      <td><div class="mahasiswa-cell">
        <div class="avatar" style="background:rgba(79,124,255,.15);color:var(--accent);font-size:11px">${initials}</div>
        <div class="mhs-name">${r.name}</div>
      </div></td>
      <td><span class="badge badge-blue">${r.kelompok}</span></td>
      <td><span class="time-val">${ci}</span></td>
      <td><span class="${r.check_out ? 'time-val' : 'time-dash'}">${co}</span></td>
      <td style="font-family:var(--mono);font-size:12px;color:var(--accent2)">${dur}</td>
      <td style="font-family:var(--mono);font-size:11px;color:var(--muted)">${r.camera_id || '—'}</td>
      <td>${status}</td>
    </tr>`;
      }).join('');
    }

    function filterAttendance(d) { loadFullAttendance(d); }

    function exportCSV() {
      if (!attendanceData.length) return toast('Tidak ada data', '', true);
      const header = 'Nama,Kelompok,Masuk,Keluar,Status,Kamera\n';
      const rows = attendanceData.map(r => {
        // Map status to readable text for CSV
        let statusText = r.status;
        if (r.status === 'izin') statusText = 'Izin';
        else if (r.status === 'sakit') statusText = 'Sakit';
        else if (r.check_out) statusText = 'Lengkap';
        else if (r.check_in) statusText = 'Hadir';
        else statusText = 'Absen';
        
        return `${r.name},${r.kelompok},${r.check_in || ''},${r.check_out || ''},${statusText},${r.camera_id || ''}`;
      }).join('\n');
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(header + rows);
      a.download = `absensi_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      toast('Export Berhasil', `${attendanceData.length} data diunduh`);
    }

    // ─── Mahasiswa ──────────────────────────────────────────────────────────────
    async function loadMahasiswa() {
      const res = await apiFetch('/mahasiswa');
      const list = res?.success ? res.data : getDemoMahasiswa();
      mahasiswaData = list;
      populateMahasiswaFilters(list);
      renderMahasiswa(list);
    }

    function getDemoMahasiswa() {
      return [
        { id: 'MHS001', name: 'Budi Santoso', kelompok: 'A', jurusan: 'Teknik Informatika', email: 'budi@student.ac.id', qr_code_id: 'MHS001' },
        { id: 'MHS002', name: 'Siti Rahayu', kelompok: 'B', jurusan: 'Sistem Informasi', email: 'siti@student.ac.id', qr_code_id: 'MHS002' },
        { id: 'MHS003', name: 'Ahmad Fauzi', kelompok: 'A', jurusan: 'Teknik Komputer', email: 'ahmad@student.ac.id', qr_code_id: 'MHS003' },
        { id: 'MHS004', name: 'Dewi Lestari', kelompok: 'C', jurusan: 'Teknik Informatika', email: 'dewi@student.ac.id', qr_code_id: 'MHS004' },
        { id: 'MHS005', name: 'Reza Pratama', kelompok: 'B', jurusan: 'Sistem Informasi', email: 'reza@student.ac.id', qr_code_id: 'MHS005' },
      ];
    }

    function populateMahasiswaFilters(list) {
      // Get unique kelompok and jurusan
      const kelompokSet = new Set(list.map(m => m.kelompok).filter(k => k));
      const jurusanSet = new Set(list.map(m => m.jurusan).filter(j => j));
      
      // Populate kelompok dropdown
      const kelompokSelect = document.getElementById('mhs-filter-kelompok');
      const currentKelompok = kelompokSelect.value;
      kelompokSelect.innerHTML = '<option value="">Semua</option>' + 
        Array.from(kelompokSet).sort().map(k => `<option value="${k}">${k}</option>`).join('');
      if (currentKelompok) kelompokSelect.value = currentKelompok;
      
      // Populate jurusan dropdown
      const jurusanSelect = document.getElementById('mhs-filter-jurusan');
      const currentJurusan = jurusanSelect.value;
      jurusanSelect.innerHTML = '<option value="">Semua</option>' + 
        Array.from(jurusanSet).sort().map(j => `<option value="${j}">${j}</option>`).join('');
      if (currentJurusan) jurusanSelect.value = currentJurusan;
    }

    function filterMahasiswa() {
      const searchTerm = document.getElementById('mhs-search').value.toLowerCase();
      const filterKelompok = document.getElementById('mhs-filter-kelompok').value;
      const filterJurusan = document.getElementById('mhs-filter-jurusan').value;
      
      let filtered = mahasiswaData;
      
      // Filter by name
      if (searchTerm) {
        filtered = filtered.filter(m => m.name.toLowerCase().includes(searchTerm));
      }
      
      // Filter by kelompok
      if (filterKelompok) {
        filtered = filtered.filter(m => m.kelompok === filterKelompok);
      }
      
      // Filter by jurusan
      if (filterJurusan) {
        filtered = filtered.filter(m => m.jurusan === filterJurusan);
      }
      
      renderMahasiswa(filtered);
    }

    function resetMahasiswaFilter() {
      document.getElementById('mhs-search').value = '';
      document.getElementById('mhs-filter-kelompok').value = '';
      document.getElementById('mhs-filter-jurusan').value = '';
      renderMahasiswa(mahasiswaData);
    }

    function renderMahasiswa(list) {
      const tbody = document.getElementById('mhs-tbody');
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:30px">Tidak ada mahasiswa ditemukan</td></tr>';
        return;
      }
      tbody.innerHTML = list.map((e, i) => {
        const initials = e.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const colors = ['#4f7cff', '#22d3a0', '#f5a623', '#ff6b6b', '#a78bfa'];
        const c = colors[i % colors.length];
        return `<tr>
      <td><div class="mahasiswa-cell">
        <div class="avatar" style="background:${c}22;color:${c}">${initials}</div>
        <div><div class="mhs-name">${e.name}</div><div class="mhs-dept">${e.id}</div></div>
      </div></td>
      <td><span class="badge badge-blue">${e.kelompok}</span></td>
      <td style="color:var(--muted2);font-size:12px">${e.jurusan}</td>
      <td style="font-size:12px;color:var(--muted)">${e.email || '—'}</td>
      <td style="font-size:12px;color:var(--text);font-family:var(--mono)">${e.no_telp_mahasiswa || '—'}</td>
      <td style="font-size:12px;color:var(--text);font-family:var(--mono)">${e.no_telp_ortu || '—'}</td>
      <td><span style="font-family:var(--mono);font-size:10px;color:var(--muted);background:var(--bg3);padding:2px 6px;border-radius:4px">${e.qr_code_id || '—'}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="showQR('${e.id}')"><span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle">qr_code</span></button>
        <button class="btn btn-danger btn-sm" style="margin-left:4px" onclick="removeMahasiswa('${e.id}')"><span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle">delete</span></button>
      </td>
    </tr>`;
      }).join('');
}

async function showQR(mhsId) {
  const res = await apiFetch(`/mahasiswa/${mhsId}/qr`);
  if (res?.success) {
    const modal = document.getElementById('modal-mahasiswa');
    
    // Change modal title to "QR-Code Mahasiswa" and center it
    const modalTitle = document.getElementById('modal-mahasiswa-title');
    if (modalTitle) {
      modalTitle.textContent = 'QR-Code Mahasiswa';
      modalTitle.style.textAlign = 'center';
    }
    
    // Hide method selection dropdown
    const methodSelect = document.getElementById('add-method-select');
    if (methodSelect && methodSelect.closest('.form-row')) {
      methodSelect.closest('.form-row').style.display = 'none';
    }
    
    // Show QR result box
    document.getElementById('qr-result-box').classList.add('show');
    
    // Hide form and submit button
    document.getElementById('mhs-form').style.display = 'none';
    document.getElementById('mhs-submit-btn').style.display = 'none';
    
    // Hide excel submit button if exists
    const excelBtn = document.getElementById('excel-submit-btn');
    if (excelBtn) excelBtn.style.display = 'none';
    
    // Display QR code
    document.getElementById('qr-img-display').src = `data:image/png;base64,${res.data.qr_image_base64}`;
    document.getElementById('qr-id-label').textContent = res.data.qr_code_id;
    currentQRBase64 = res.data.qr_image_base64;
    
    // Open modal
    modal.classList.add('show');
  } else {
    toast('Tidak dapat memuat QR', 'Pastikan API server berjalan', true);
  }
}

async function removeMahasiswa(id) {
  if (!confirm('Nonaktifkan mahasiswa ini?')) return;
  const res = await apiFetch(`/mahasiswa/${id}`, { method: 'DELETE' });
  if (res?.success) { toast('Mahasiswa dinonaktifkan'); loadMahasiswa(); }
  else toast('Gagal menonaktifkan', '', true);
}

    // ─── Cameras ────────────────────────────────────────────────────────────────
    async function loadCameras() {
      const res = await apiFetch('/cameras');
      const list = res?.success ? res.data : getDemoCameras();
      cameraData = list;
      renderCameras(list);
    }

    function getDemoCameras() {
      return [
        { id: 'CAM-01', name: 'Pintu Utama', rtsp_url: 'rtsp://192.168.1.100:554/stream1', location: 'Lobby Lantai 1', is_active: 1, last_seen: '2025-01-11T08:15:00' },
        { id: 'CAM-02', name: 'Pintu Belakang', rtsp_url: 'rtsp://192.168.1.101:554/stream1', location: 'Area Parkir', is_active: 1, last_seen: '2025-01-11T08:10:00' },
        { id: 'CAM-03', name: 'Ruang Server', rtsp_url: 'rtsp://192.168.1.102:554/stream1', location: 'Lantai 2', is_active: 0, last_seen: null },
        { id: 'CAM-04', name: 'Lobby Lift', rtsp_url: 'rtsp://192.168.1.103:554/stream1', location: 'Lantai 1', is_active: 1, last_seen: '2025-01-11T08:14:00' },
      ];
    }

    function renderCameras(list) {
      const grid = document.getElementById('camera-grid');
      if (!list.length) {
        grid.innerHTML = '<div style="color:var(--muted);padding:30px;text-align:center;grid-column:1/-1">Belum ada kamera terdaftar</div>';
        return;
      }

      // PENYISIPAN TAG IMAGE STREAM DI SINI:
      grid.innerHTML = list.map(cam => {
        const online = cam.is_active;
        const lastSeen = cam.last_seen ? new Date(cam.last_seen).toLocaleTimeString('id-ID') : '—';
        return `<div class="camera-card">
      <div class="camera-feed">
        ${online ? `<img src="/api/stream/${cam.id}" style="position:absolute; width:100%; height:100%; object-fit:cover; z-index:2;" onerror="this.style.display='none'">` : ''}
        
        <div class="feed-placeholder">
          <span class="material-symbols-outlined feed-icon">videocam</span>
          <div class="feed-text">${cam.name}</div>
          <div class="feed-rtsp">${cam.rtsp_url}</div>
          ${online ? `<div style="margin-top:8px"><span class="badge badge-green" style="font-size:11px">● LIVE</span></div>` : `<div style="margin-top:8px"><span class="badge badge-gray" style="font-size:11px">OFFLINE</span></div>`}
        </div>
      </div>
      <div class="camera-name-bar">
        <div>
          <div class="cam-name">${cam.name}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${cam.location || 'Tidak ada lokasi'} · ${cam.id}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="text-align:right">
            <div class="${online ? 'cam-online' : 'cam-offline'}" style="font-size:12px;font-weight:600">${online ? '● Online' : '● Offline'}</div>
            <div class="cam-fps" style="font-size:11px;margin-top:2px">Terakhir: ${lastSeen}</div>
          </div>
          <div style="display:flex;gap:4px;margin-left:8px">
            <button class="btn btn-ghost btn-sm" onclick="editCamera('${cam.id}')" title="Edit" style="padding:6px 10px"><span class="material-symbols-outlined" style="font-size:18px">edit</span></button>
            <button class="btn btn-danger btn-sm" onclick="deleteCamera('${cam.id}')" title="Hapus" style="padding:6px 10px"><span class="material-symbols-outlined" style="font-size:18px">delete</span></button>
          </div>
        </div>
      </div>
    </div>`;
      }).join('');
    }

    // ─── History ─────────────────────────────────────────────────────────────────
    async function loadHistory() {
      const start = document.getElementById('hist-start').value;
      const end = document.getElementById('hist-end').value;
      if (!start || !end) { toast('Pilih rentang tanggal', '', true); return; }
      const res = await apiFetch(`/attendance/history?start=${start}&end=${end}`);
      const list = res?.success ? res.data : [];
      renderHistory(list);
    }

    function renderHistory(list) {
      const tbody = document.getElementById('hist-tbody');
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:30px">Tidak ada data pada rentang ini</td></tr>';
        return;
      }
      tbody.innerHTML = list.map(r => {
        const ci = r.check_in ? r.check_in.slice(11, 19) : '—';
        const co = r.check_out ? r.check_out.slice(11, 19) : '—';
        let dur = '—';
        if (r.check_in && r.check_out) {
          const ms = new Date(r.check_out) - new Date(r.check_in);
          const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
          dur = `${h}j ${m}m`;
        }
        
        // Handle different status types including izin and sakit
        let status;
        if (r.status === 'izin') {
          status = '<span class="badge badge-blue"><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle">description</span> Izin</span>';
        } else if (r.status === 'sakit') {
          status = '<span class="badge badge-orange"><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle">medical_services</span> Sakit</span>';
        } else if (r.check_out) {
          status = '<span class="badge badge-green">Lengkap</span>';
        } else {
          status = '<span class="badge badge-yellow">Parsial</span>';
        }
        
        return `<tr>
      <td style="font-family:var(--mono);font-size:12px">${r.date || r.check_in?.slice(0, 10) || '—'}</td>
      <td class="mhs-name">${r.name}</td>
      <td><span class="badge badge-blue">${r.kelompok}</span></td>
      <td><span class="time-val">${ci}</span></td>
      <td><span class="${r.check_out ? 'time-val' : 'time-dash'}">${co}</span></td>
      <td style="font-family:var(--mono);font-size:12px;color:var(--accent2)">${dur}</td>
      <td>${status}</td>
    </tr>`;
      }).join('');
    }

    // ─── Video Upload & Processing ──────────────────────────────────────────────
    let selectedVideoFile = null;
    let videoProcessingResults = [];
    let previewVideoElement = null;
    let previewCanvasElement = null;
    let previewCanvasCtx = null;
    let previewAnimationFrame = null;

    function handleVideoFileSelect(event) {
      const file = event.target.files[0];
      if (!file) return;

      if (!file.type.includes('mp4')) {
        toast('Format tidak didukung', 'Hanya file MP4 yang diperbolehkan', true);
        event.target.value = '';
        return;
      }

      selectedVideoFile = file;
      document.getElementById('video-preview-section').style.display = 'block';
      document.getElementById('video-success-panel').style.display = 'none';
      toast('Video dipilih', `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

      // Load video untuk preview dengan deteksi real-time
      loadVideoPreview(file);
    }

    function loadVideoPreview(file) {
      const videoPlayer = document.getElementById('preview-video-player');
      const canvas = document.getElementById('preview-canvas-overlay');
      const info = document.getElementById('preview-video-info');
      
      // Stop previous preview if exists
      if (previewAnimationFrame) {
        cancelAnimationFrame(previewAnimationFrame);
        previewAnimationFrame = null;
      }

      // Create object URL for video
      const videoURL = URL.createObjectURL(file);
      videoPlayer.src = videoURL;
      
      previewVideoElement = videoPlayer;
      previewCanvasElement = canvas;
      previewCanvasCtx = canvas.getContext('2d');

      // Function to update canvas size to match video display exactly
      const updateCanvasSize = () => {
        const rect = videoPlayer.getBoundingClientRect();
        // Set canvas to match actual video display size
        canvas.width = rect.width;
        canvas.height = rect.height;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
      };

      // Setup canvas size when video metadata loaded
      videoPlayer.onloadedmetadata = () => {
        const duration = videoPlayer.duration;
        const aspectRatio = videoPlayer.videoWidth / videoPlayer.videoHeight;
        const orientation = aspectRatio > 1 ? 'Landscape' : aspectRatio < 1 ? 'Portrait' : 'Square';
        
        info.textContent = `${duration.toFixed(1)}s · ${videoPlayer.videoWidth}x${videoPlayer.videoHeight} · ${orientation}`;
        
        // Wait a bit for video to render with correct size, then update canvas
        setTimeout(() => {
          updateCanvasSize();
          toast('Video siap', 'Putar video untuk melihat deteksi QR Code real-time');
        }, 100);
      };

      // Update canvas size on window resize
      let resizeTimeout;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          if (videoPlayer.videoWidth > 0) {
            updateCanvasSize();
          }
        }, 100);
      });

      // Start detection when video plays
      videoPlayer.onplay = () => {
        updateCanvasSize(); // Ensure canvas is correct size before detection
        detectQRInVideoFrame();
      };

      videoPlayer.onpause = () => {
        if (previewAnimationFrame) {
          cancelAnimationFrame(previewAnimationFrame);
          previewAnimationFrame = null;
        }
      };

      videoPlayer.onended = () => {
        if (previewAnimationFrame) {
          cancelAnimationFrame(previewAnimationFrame);
          previewAnimationFrame = null;
        }
      };
    }

    function detectQRInVideoFrame() {
      if (!previewVideoElement || previewVideoElement.paused || previewVideoElement.ended) {
        return;
      }

      const video = previewVideoElement;
      const canvas = previewCanvasElement;
      const ctx = previewCanvasCtx;

      // Clear previous drawings
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Create temporary canvas for QR detection at video's native resolution
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = video.videoWidth;
      tempCanvas.height = video.videoHeight;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(video, 0, 0);

      // Calculate scale factors between video resolution and display size
      const scaleX = canvas.width / video.videoWidth;
      const scaleY = canvas.height / video.videoHeight;

      // Try to detect QR codes using jsQR library
      try {
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        
        // Use jsQR if available
        if (typeof jsQR !== 'undefined') {
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });
          
          if (code) {
            // Scale coordinates from video resolution to canvas display size
            const topLeft = {
              x: code.location.topLeftCorner.x * scaleX,
              y: code.location.topLeftCorner.y * scaleY
            };
            const topRight = {
              x: code.location.topRightCorner.x * scaleX,
              y: code.location.topRightCorner.y * scaleY
            };
            const bottomRight = {
              x: code.location.bottomRightCorner.x * scaleX,
              y: code.location.bottomRightCorner.y * scaleY
            };
            const bottomLeft = {
              x: code.location.bottomLeftCorner.x * scaleX,
              y: code.location.bottomLeftCorner.y * scaleY
            };

            // Draw bounding box with YELLOW color (matching attendance_engine.py)
            ctx.strokeStyle = '#FFFF00';  // Yellow color
            ctx.lineWidth = 3;
            
            // Draw polygon connecting the 4 corners (like cv2.polylines)
            ctx.beginPath();
            ctx.moveTo(topLeft.x, topLeft.y);
            ctx.lineTo(topRight.x, topRight.y);
            ctx.lineTo(bottomRight.x, bottomRight.y);
            ctx.lineTo(bottomLeft.x, bottomLeft.y);
            ctx.closePath();
            ctx.stroke();
            
            // Calculate center point for label
            const centerX = (topLeft.x + topRight.x + bottomLeft.x + bottomRight.x) / 4;
            const centerY = (topLeft.y + topRight.y + bottomLeft.y + bottomRight.y) / 4;
            
            // Draw "QR VALID" label at center (matching attendance_engine.py style)
            const labelText = "QR VALID";
            ctx.font = 'bold 16px Arial';
            const textMetrics = ctx.measureText(labelText);
            const textWidth = textMetrics.width;
            const textHeight = 16;
            const padding = 5;
            
            // Background rectangle (yellow)
            ctx.fillStyle = '#FFFF00';
            ctx.fillRect(
              centerX - textWidth/2 - padding, 
              centerY - textHeight - padding,
              textWidth + padding * 2, 
              textHeight + padding * 2
            );
            
            // Text (black)
            ctx.fillStyle = '#000000';
            ctx.fillText(labelText, centerX - textWidth/2, centerY - padding);
          }
        }
      } catch (e) {
        console.log('QR detection error:', e);
      }

      // Continue detection on next frame (30 FPS)
      previewAnimationFrame = requestAnimationFrame(detectQRInVideoFrame);
    }

    function cancelVideoUpload() {
      // Stop animation frame
      if (previewAnimationFrame) {
        cancelAnimationFrame(previewAnimationFrame);
        previewAnimationFrame = null;
      }

      // Clear video
      const videoPlayer = document.getElementById('preview-video-player');
      if (videoPlayer.src) {
        URL.revokeObjectURL(videoPlayer.src);
        videoPlayer.src = '';
      }

      selectedVideoFile = null;
      document.getElementById('video-file-input').value = '';
      document.getElementById('video-preview-section').style.display = 'none';
      document.getElementById('preview-video-info').innerHTML = '';
      document.getElementById('video-success-panel').style.display = 'none';
      
      // Clear canvas
      if (previewCanvasCtx) {
        previewCanvasCtx.clearRect(0, 0, previewCanvasElement.width, previewCanvasElement.height);
      }
    }

    async function uploadAndProcessVideo() {
      if (!selectedVideoFile) {
        toast('Pilih video terlebih dahulu', '', true);
        return;
      }

      const action = document.getElementById('video-action-select').value;
      const actionLabel = action === 'check_in' ? 'Check-in' : 'Check-out';
      
      const formData = new FormData();
      formData.append('video', selectedVideoFile);
      formData.append('action', action);

      document.getElementById('video-processing-panel').style.display = 'block';
      document.getElementById('video-success-panel').style.display = 'none';
      document.getElementById('processing-progress').textContent = `Memproses video untuk ${actionLabel}...`;

      try {
        const response = await fetch(API + '/video/process', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();

        if (result.success) {
          const recorded = result.data.recorded_count || 0;
          const uniqueMhs = result.data.unique_mahasiswa || 0;
          const detections = result.data.detections || [];
          const skipped = result.data.skipped_count || 0;
          const skippedMahasiswa = result.data.skipped_mahasiswa || [];
          
          // Tampilkan success panel
          document.getElementById('video-processing-panel').style.display = 'none';
          document.getElementById('video-success-panel').style.display = 'block';
          
          const summary = document.getElementById('success-summary');
          let summaryHTML = `<strong>${actionLabel}</strong> · ${detections.length} deteksi · ${recorded} tercatat · ${uniqueMhs} mahasiswa`;
          
          if (skipped > 0) {
            summaryHTML += ` · <span style="color:var(--warning)">${skipped} dilewati</span>`;
          }
          
          summary.innerHTML = summaryHTML;
          
          // Update success panel content dengan detail
          const successContent = document.querySelector('#video-success-panel > div:last-child');
          let contentHTML = `
            <span class="material-symbols-outlined" style="font-size:80px;color:var(--success)">check_circle</span>
            <p style="margin-top:16px;font-size:16px;color:var(--text)">
              ${recorded > 0 ? `<strong>${recorded} ${actionLabel}</strong> telah tercatat ke database.<br>` : ''}
              ${skipped > 0 ? `<strong style="color:var(--warning)">${skipped} mahasiswa dilewati</strong> karena sudah ${actionLabel} hari ini.<br>` : ''}
              Silakan cek di halaman <strong>"Absensi Hari Ini"</strong>
            </p>
          `;
          
          // Tampilkan daftar mahasiswa yang dilewati
          if (skippedMahasiswa.length > 0) {
            contentHTML += `
              <div style="margin-top:20px;padding:16px;background:var(--warning-light);border-radius:var(--radius-md);text-align:left;max-width:500px;margin-left:auto;margin-right:auto">
                <div style="font-weight:600;margin-bottom:8px;color:var(--warning);display:flex;align-items:center;gap:6px">
                  <span class="material-symbols-outlined" style="font-size:18px">info</span>
                  Mahasiswa yang Dilewati:
                </div>
                <ul style="margin:0;padding-left:20px;font-size:14px;color:var(--text-secondary)">
                  ${skippedMahasiswa.map(m => `<li><strong>${m.name}</strong> - ${m.reason}</li>`).join('')}
                </ul>
              </div>
            `;
          }
          
          successContent.innerHTML = contentHTML;
          
          // Toast message
          if (recorded > 0 && skipped > 0) {
            toast('Video diproses dengan peringatan', 
                  `${recorded} ${actionLabel} tercatat, ${skipped} dilewati (sudah ${actionLabel})`);
          } else if (recorded > 0) {
            toast('Video berhasil diproses!', 
                  `${recorded} ${actionLabel} tercatat. Lihat di "Absensi Hari Ini"`);
          } else if (skipped > 0) {
            toast('Tidak ada yang tercatat', 
                  `Semua mahasiswa sudah ${actionLabel} hari ini`, true);
          }
          
          // Auto refresh absensi dan dashboard
          loadFullAttendance();
          loadDashboard();
        } else {
          toast('Gagal memproses video', result.message || 'Terjadi kesalahan', true);
          document.getElementById('video-processing-panel').style.display = 'none';
        }
      } catch (error) {
        console.error('Error:', error);
        toast('Gagal mengunggah video', 'Pastikan API server berjalan', true);
        document.getElementById('video-processing-panel').style.display = 'none';
      }
    }

    // ─── Modals ─────────────────────────────────────────────────────────────────
    // Note: openAddMahasiswa() is defined at line 1695 (enhanced version)

    function openAddCamera() {
      editingCameraId = null;
      document.getElementById('camera-modal-title').textContent = 'Tambah Kamera CCTV';
      document.getElementById('camera-submit-btn').textContent = 'Tambah Kamera';
      document.getElementById('c-id').disabled = false;
      ['c-id', 'c-name', 'c-rtsp', 'c-loc'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('modal-camera').classList.add('show');
    }

    function editCamera(cameraId) {
      const cam = cameraData.find(c => c.id === cameraId);
      if (!cam) return;
      
      editingCameraId = cameraId;
      document.getElementById('camera-modal-title').textContent = 'Edit Kamera CCTV';
      document.getElementById('camera-submit-btn').textContent = 'Simpan Perubahan';
      document.getElementById('c-id').value = cam.id;
      document.getElementById('c-id').disabled = true;
      document.getElementById('c-name').value = cam.name;
      document.getElementById('c-rtsp').value = cam.rtsp_url;
      document.getElementById('c-loc').value = cam.location || '';
      document.getElementById('modal-camera').classList.add('show');
    }

    async function deleteCamera(cameraId) {
      if (!confirm('Hapus kamera ini? Tindakan ini tidak dapat dibatalkan.')) return;
      
      const res = await apiFetch(`/cameras/${cameraId}`, { method: 'DELETE' });
      if (res?.success) {
        toast('Kamera dihapus', cameraId);
        loadCameras();
      } else {
        toast('Gagal menghapus kamera', res?.message || 'Cek API server', true);
      }
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove('show');
    }

    async function submitMahasiswa() {
      const body = {
        id: document.getElementById('f-id').value.trim(),
        name: document.getElementById('f-name').value.trim(),
        kelompok: document.getElementById('f-dept').value.trim(),
        jurusan: document.getElementById('f-pos').value.trim(),
        email: document.getElementById('f-email').value.trim(),
        no_telp_mahasiswa: document.getElementById('f-telp-mhs').value.trim(),
        no_telp_ortu: document.getElementById('f-telp-ortu').value.trim()
      };
      if (!body.id || !body.name || !body.kelompok || !body.jurusan) {
        toast('Lengkapi semua field wajib', '', true); return;
      }
      const res = await apiFetch('/mahasiswa', { method: 'POST', body: JSON.stringify(body) });
      if (res?.success) {
        currentQRBase64 = res.data.qr_image_base64;
        document.getElementById('mhs-form').style.display = 'none';
        document.getElementById('mhs-submit-btn').style.display = 'none';
        document.getElementById('qr-result-box').classList.add('show');
        document.getElementById('qr-img-display').src = `data:image/png;base64,${currentQRBase64}`;
        document.getElementById('qr-id-label').textContent = res.data.qr_code_id;
        toast('Mahasiswa ditambahkan!', `QR Code berhasil dibuat untuk ${body.name}`);
        if (currentPage === 'mahasiswa') loadMahasiswa();
      } else {
        toast('Gagal menyimpan', res?.message || 'Cek API server', true);
      }
    }

    async function submitCamera() {
      const body = {
        id: document.getElementById('c-id').value.trim(),
        name: document.getElementById('c-name').value.trim(),
        rtsp_url: document.getElementById('c-rtsp').value.trim(),
        location: document.getElementById('c-loc').value.trim(),
      };
      
      if (!body.name || !body.rtsp_url) {
        toast('Lengkapi field wajib', '', true); return;
      }
      
      if (editingCameraId) {
        // Update mode
        const res = await apiFetch(`/cameras/${editingCameraId}`, { 
          method: 'PUT', 
          body: JSON.stringify(body) 
        });
        if (res?.success) {
          closeModal('modal-camera');
          toast('Kamera diperbarui!', body.name);
          loadCameras();
        } else {
          toast('Gagal memperbarui kamera', res?.message || 'Cek API server', true);
        }
      } else {
        // Add mode
        if (!body.id) {
          toast('ID kamera wajib diisi', '', true); return;
        }
        const res = await apiFetch('/cameras', { method: 'POST', body: JSON.stringify(body) });
        if (res?.success) {
          closeModal('modal-camera');
          toast('Kamera ditambahkan!', body.name);
          loadCameras();
        } else {
          toast('Gagal menambah kamera', res?.message || 'Cek API server', true);
        }
      }
    }

    function downloadQR() {
      if (!currentQRBase64) return;
      const a = document.createElement('a');
      a.href = 'data:image/png;base64,' + currentQRBase64;
      a.download = `qrcode_${document.getElementById('qr-id-label').textContent}.png`;
      a.click();
    }

    // ─── Close modal on backdrop click ──────────────────────────────────────────
    document.querySelectorAll('.modal-backdrop').forEach(el => {
      el.addEventListener('click', function (e) {
        if (e.target === this) closeModal(this.id);
      });
    });

    // ─── Auto refresh ────────────────────────────────────────────────────────────
    function refreshData() {
      loadDashboard();
      toast('Data diperbarui', new Date().toLocaleTimeString('id-ID'));
    }

    setInterval(() => {
      if (currentPage === 'dashboard') loadDashboard();
      if (currentPage === 'attendance') loadFullAttendance();
    }, 30000);

    // ─── IZIN / SAKIT (TIMDIS ONLY) ─────────────────────────────────────────────

    // Timdis: Load semua pengajuan
    async function loadIzinSubmissions() {
      const status = document.getElementById('izin-filter-status')?.value || '';
      const tbody = document.getElementById('izin-submissions-table-body');
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px"><div class="spinner" style="margin:0 auto"></div></td></tr>';

      try {
        const url = API + '/izin/list' + (status ? `?status=${status}` : '');
        const res = await fetch(url);
        const result = await res.json();

        if (!result.success) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--danger);padding:20px">Gagal memuat data</td></tr>';
          return;
        }

        const { submissions, stats } = result.data;

        // Store data for filtering
        allIzinSubmissions = submissions || [];
        populateIzinKelompokFilter(allIzinSubmissions);

        // Update stats
        document.getElementById('stat-pending-izin').textContent = stats.pending;
        document.getElementById('stat-approved-izin').textContent = stats.approved;
        document.getElementById('stat-rejected-izin').textContent = stats.rejected;
        document.getElementById('sidebar-pending-izin').textContent = stats.pending;
        document.getElementById('sidebar-pending-izin').style.display = stats.pending > 0 ? '' : 'none';

        if (!submissions.length) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:30px">Tidak ada pengajuan</td></tr>';
          return;
        }

        // Render using the filter function
        renderIzinSubmissions(submissions);

      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--danger);padding:20px">Gagal memuat data</td></tr>';
      }
    }

    async function approveIzin(submissionId) {
      const verifiedBy = 'Timdis';
      try {
        const res = await fetch(API + '/izin/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submission_id: submissionId, action: 'approve', verified_by: verifiedBy })
        });
        const result = await res.json();
        if (result.success) {
          toast('Pengajuan disetujui', 'Status kehadiran mahasiswa telah diperbarui');
          loadIzinSubmissions();
          loadIzinPendingCount();
        } else {
          toast('Gagal menyetujui', result.message, true);
        }
      } catch (e) {
        toast('Gagal', 'Pastikan server berjalan', true);
      }
    }

    function openRejectModal(submissionId) {
      document.getElementById('reject-submission-id').value = submissionId;
      document.getElementById('reject-reason-input').value = '';
      document.getElementById('modal-reject-izin').classList.add('show');
    }

    async function confirmRejectIzin() {
      const submissionId = document.getElementById('reject-submission-id').value;
      const reason = document.getElementById('reject-reason-input').value.trim();

      if (!reason) return toast('Alasan penolakan wajib diisi', '', true);

      try {
        const res = await fetch(API + '/izin/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submission_id: parseInt(submissionId),
            action: 'reject',
            verified_by: 'Timdis',
            rejection_reason: reason
          })
        });
        const result = await res.json();
        if (result.success) {
          closeModal('modal-reject-izin');
          toast('Pengajuan ditolak', 'Mahasiswa akan diberitahu');
          loadIzinSubmissions();
          loadIzinPendingCount();
        } else {
          toast('Gagal menolak', result.message, true);
        }
      } catch (e) {
        toast('Gagal', 'Pastikan server berjalan', true);
      }
    }

    function viewBukti(submissionId, buktiPath) {
      const ext = buktiPath.split('.').pop().toLowerCase();
      const filename = buktiPath.split(/[\\/]/).pop();
      const url = API + `/izin/bukti/${filename}`;
      const content = document.getElementById('bukti-content');

      if (['jpg', 'jpeg', 'png'].includes(ext)) {
        content.innerHTML = `<img src="${url}" style="max-width:100%;max-height:500px;border-radius:var(--radius-md)">`;
      } else if (ext === 'pdf') {
        content.innerHTML = `
          <div style="padding:20px;text-align:center">
            <span class="material-symbols-outlined" style="font-size:64px;color:var(--danger)">picture_as_pdf</span>
            <p style="margin-top:12px">File PDF tidak bisa ditampilkan langsung.</p>
            <a href="${url}" target="_blank" class="btn btn-primary" style="margin-top:8px;display:inline-flex;gap:6px">
              <span class="material-symbols-outlined" style="font-size:16px">open_in_new</span> Buka PDF
            </a>
          </div>`;
      } else {
        content.innerHTML = '<p style="color:var(--text-muted)">Format file tidak dikenali</p>';
      }

      document.getElementById('modal-bukti').classList.add('show');
    }

    async function loadIzinPendingCount() {
      try {
        const res = await fetch(API + '/izin/list?status=pending');
        const result = await res.json();
        if (result.success) {
          const count = result.data.stats.pending;
          const badge = document.getElementById('sidebar-pending-izin');
          badge.textContent = count;
          badge.style.display = count > 0 ? '' : 'none';
        }
      } catch (e) {}
    }

    // Load pending count on init
    loadIzinPendingCount();

    // ─── VERIFIKASI PENGAJUAN KEHADIRAN (TIMDIS) ─────────────────────────────────

    // Timdis: Load semua pengajuan kehadiran
    async function loadKehadiranSubmissions() {
      const status = document.getElementById('kehadiran-filter-status')?.value || '';
      const tbody = document.getElementById('kehadiran-submissions-table-body');
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px"><div class="spinner" style="margin:0 auto"></div></td></tr>';

      try {
        const url = API + '/kehadiran/list' + (status ? `?status=${status}` : '');
        const res = await fetch(url);
        const result = await res.json();

        if (!result.success) {
          tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--danger);padding:20px">Gagal memuat data</td></tr>';
          return;
        }

        const { submissions, stats } = result.data;

        // Store data for filtering
        allKehadiranSubmissions = submissions || [];
        populateKehadiranKelompokFilter(allKehadiranSubmissions);

        // Update stats
        document.getElementById('stat-pending-kehadiran').textContent = stats.pending;
        document.getElementById('stat-approved-kehadiran').textContent = stats.approved;
        document.getElementById('stat-rejected-kehadiran').textContent = stats.rejected;
        document.getElementById('sidebar-pending-kehadiran').textContent = stats.pending;
        document.getElementById('sidebar-pending-kehadiran').style.display = stats.pending > 0 ? '' : 'none';

        if (!submissions.length) {
          tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:30px">Tidak ada pengajuan</td></tr>';
          return;
        }

        // Render using the filter function
        renderKehadiranSubmissions(submissions);

      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--danger);padding:20px">Gagal memuat data</td></tr>';
      }
    }

    async function approveKehadiran(submissionId) {
      const verifiedBy = 'Timdis';
      try {
        const res = await fetch(API + '/kehadiran/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submission_id: submissionId, action: 'approve', verified_by: verifiedBy })
        });
        
        const result = await res.json();
        if (result.success) {
          toast('Pengajuan Disetujui', 'Kehadiran manual telah dicatat');
          loadKehadiranSubmissions();
        } else {
          toast('Gagal', result.message, true);
        }
      } catch (e) {
        toast('Error', e.message, true);
      }
    }

    function openRejectKehadiranModal(submissionId) {
      // Reuse the same reject modal as izin
      document.getElementById('reject-submission-id').value = submissionId;
      document.getElementById('reject-reason-input').value = '';
      document.getElementById('modal-reject-izin').classList.add('show');
      
      // Change the confirm button to call rejectKehadiran instead
      const confirmBtn = document.querySelector('#modal-reject-izin .btn-danger');
      confirmBtn.onclick = () => confirmRejectKehadiran(submissionId);
    }

    async function confirmRejectKehadiran(submissionId) {
      const reason = document.getElementById('reject-reason-input').value.trim();
      if (!reason) {
        toast('Alasan wajib diisi', '', true);
        return;
      }
      
      const verifiedBy = 'Timdis';
      try {
        const res = await fetch(API + '/kehadiran/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            submission_id: submissionId, 
            action: 'reject', 
            verified_by: verifiedBy,
            reject_reason: reason
          })
        });
        
        const result = await res.json();
        if (result.success) {
          closeModal('modal-reject-izin');
          toast('Pengajuan Ditolak', reason);
          loadKehadiranSubmissions();
        } else {
          toast('Gagal', result.message, true);
        }
      } catch (e) {
        toast('Error', e.message, true);
      }
    }

    function viewKehadiranBukti(submissionId, buktiPath) {
      // Reuse the same modal as izin
      viewBukti(submissionId, buktiPath);
    }

    async function loadKehadiranPendingCount() {
      try {
        const res = await fetch(API + '/kehadiran/list?status=pending');
        const result = await res.json();
        if (result.success) {
          const count = result.data.submissions.length;
          const badge = document.getElementById('sidebar-pending-kehadiran');
          badge.textContent = count;
          badge.style.display = count > 0 ? '' : 'none';
        }
      } catch (e) {
        console.error('Error loading kehadiran pending count:', e);
      }
    }

    // Load pending count on init
    loadKehadiranPendingCount();

    // ─── Settings Management ─────────────────────────────────────────────────────
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error('Failed to load settings');
        const data = await res.json();
        
        // Populate YOLO settings
        if (data.yolo) {
          document.getElementById('setting-model-path').value = data.yolo.model_path || 'models/yolov8n.pt';
          document.getElementById('setting-yolo-conf').value = data.yolo.confidence || 0.45;
          document.getElementById('setting-qr-cooldown').value = data.yolo.qr_cooldown || 30;
        }
        
        // Populate RTSP settings
        if (data.rtsp) {
          document.getElementById('setting-frame-width').value = data.rtsp.frame_width || 1280;
          document.getElementById('setting-frame-height').value = data.rtsp.frame_height || 720;
          document.getElementById('setting-frame-fps').value = data.rtsp.frame_fps || 30;
          document.getElementById('setting-reconnect-delay').value = data.rtsp.reconnect_delay || 5;
        }
      } catch (e) {
        console.error('Error loading settings:', e);
        // Use default values if API fails
      }
    }

    async function saveYoloSettings() {
      const settings = {
        model_path: document.getElementById('setting-model-path').value,
        confidence: parseFloat(document.getElementById('setting-yolo-conf').value),
        qr_cooldown: parseInt(document.getElementById('setting-qr-cooldown').value)
      };
      
      try {
        const res = await fetch('/api/settings/yolo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        });
        
        if (!res.ok) throw new Error('Failed to save settings');
        const data = await res.json();
        toast('Pengaturan YOLO disimpan', 'Restart engine untuk menerapkan perubahan');
      } catch (e) {
        toast('Gagal menyimpan', e.message, true);
      }
    }

    async function saveRtspSettings() {
      const settings = {
        frame_width: parseInt(document.getElementById('setting-frame-width').value),
        frame_height: parseInt(document.getElementById('setting-frame-height').value),
        frame_fps: parseInt(document.getElementById('setting-frame-fps').value),
        reconnect_delay: parseInt(document.getElementById('setting-reconnect-delay').value)
      };
      
      try {
        const res = await fetch('/api/settings/rtsp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        });
        
        if (!res.ok) throw new Error('Failed to save settings');
        const data = await res.json();
        toast('Pengaturan RTSP disimpan', 'Restart kamera untuk menerapkan perubahan');
      } catch (e) {
        toast('Gagal menyimpan', e.message, true);
      }
    }

    async function browseModels() {
      document.getElementById('modal-browse-models').classList.add('show');
      
      try {
        const res = await fetch('/api/models/list');
        if (!res.ok) throw new Error('Failed to load models');
        const data = await res.json();
        
        const modelsList = document.getElementById('models-list');
        if (!data.data || data.data.length === 0) {
          modelsList.innerHTML = `
            <div style="text-align:center;padding:40px;color:var(--muted)">
              <span class="material-symbols-outlined" style="font-size:48px;opacity:0.3">folder_off</span>
              <p style="margin-top:12px">Tidak ada model ditemukan di folder models/</p>
              <small style="font-size:11px">Letakkan file .pt di folder models/</small>
            </div>
          `;
          return;
        }
        
        modelsList.innerHTML = data.data.map(model => `
          <div class="model-item" onclick="selectModel('${model.path}')" style="padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;cursor:pointer;transition:all 0.2s" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='transparent'">
            <div style="display:flex;align-items:center;gap:12px">
              <span class="material-symbols-outlined" style="color:var(--accent)">description</span>
              <div style="flex:1">
                <div style="font-weight:500">${model.name}</div>
                <div style="font-size:11px;color:var(--muted);font-family:var(--mono)">${model.path}</div>
              </div>
              <div style="text-align:right;font-size:11px;color:var(--muted)">
                ${model.size}
              </div>
            </div>
          </div>
        `).join('');
      } catch (e) {
        document.getElementById('models-list').innerHTML = `
          <div style="text-align:center;padding:40px;color:var(--danger)">
            <span class="material-symbols-outlined" style="font-size:48px;opacity:0.3">error</span>
            <p style="margin-top:12px">Gagal memuat daftar model</p>
            <small style="font-size:11px">${e.message}</small>
          </div>
        `;
      }
    }

    function selectModel(modelPath) {
      document.getElementById('setting-model-path').value = modelPath;
      closeModal('modal-browse-models');
      toast('Model dipilih', modelPath);
    }

    // ─── Auto refresh ────────────────────────────────────────────────────────────    // ─── Auto refresh ────────────────────────────────────────────────────────────
    function refreshData() {
      loadDashboard();
      toast('Data diperbarui', new Date().toLocaleTimeString('id-ID'));
    }

    setInterval(() => {
      if (currentPage === 'dashboard') loadDashboard();
      if (currentPage === 'attendance') loadFullAttendance();
      if (currentPage === 'izin-timdis') loadIzinSubmissions();
      if (currentPage === 'kehadiran-timdis') loadKehadiranSubmissions();
    }, 30000);

    // ─── Init ────────────────────────────────────────────────────────────────────
    loadDashboard();
// ─── Excel Upload Functions ──────────────────────────────────────────────
function toggleAddMethod() {
  const method = document.getElementById('add-method-select').value;
  const manualMethod = document.getElementById('manual-method');
  const excelMethod = document.getElementById('excel-method');
  const manualBtn = document.getElementById('mhs-submit-btn');
  const excelBtn = document.getElementById('excel-submit-btn');
  
  if (method === 'manual') {
    manualMethod.style.display = 'block';
    excelMethod.style.display = 'none';
    manualBtn.style.display = 'inline-flex';
    excelBtn.style.display = 'none';
  } else {
    manualMethod.style.display = 'none';
    excelMethod.style.display = 'block';
    manualBtn.style.display = 'none';
    excelBtn.style.display = 'inline-flex';
  }
  
  // Reset forms
  resetMahasiswaForm();
  resetExcelForm();
}

function resetExcelForm() {
  document.getElementById('excel-file-input').value = '';
  document.getElementById('excel-preview').style.display = 'none';
  document.getElementById('excel-upload-progress').style.display = 'none';
}

async function downloadExcelTemplate() {
  try {
    const res = await fetch(API + '/mahasiswa/excel-template');
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'template_mahasiswa.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast('Template berhasil diunduh', 'Silakan isi data mahasiswa sesuai format');
    } else {
      toast('Gagal download template', 'Terjadi kesalahan server', true);
    }
  } catch (e) {
    console.error('Error downloading template:', e);
    toast('Gagal download template', 'Pastikan server berjalan', true);
  }
}

async function handleExcelFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Validate file type
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ];
  
  if (!allowedTypes.includes(file.type)) {
    toast('Format file tidak didukung', 'Hanya file Excel (.xlsx, .xls)', true);
    event.target.value = '';
    return;
  }
  
  // Validate file size (5MB)
  if (file.size > 5 * 1024 * 1024) {
    toast('File terlalu besar', 'Maksimal 5MB', true);
    event.target.value = '';
    return;
  }
  
  // Preview Excel data
  await previewExcelData(file);
}

async function previewExcelData(file) {
  const formData = new FormData();
  formData.append('excel_file', file);
  
  try {
    const res = await fetch(API + '/mahasiswa/excel-preview', {
      method: 'POST',
      body: formData
    });
    
    const result = await res.json();
    
    if (result.success) {
      renderExcelPreview(result.data);
    } else {
      toast('Gagal preview Excel', result.message || 'Format file tidak sesuai', true);
      document.getElementById('excel-file-input').value = '';
    }
  } catch (e) {
    console.error('Error previewing Excel:', e);
    toast('Gagal preview Excel', 'Pastikan server berjalan', true);
    document.getElementById('excel-file-input').value = '';
  }
}

function renderExcelPreview(data) {
  const tbody = document.getElementById('excel-preview-tbody');
  const summary = document.getElementById('excel-summary');
  
  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;
  
  tbody.innerHTML = data.rows.map((row, index) => {
    let status = 'Valid';
    let statusClass = 'status-valid';
    
    // Check for validation errors
    if (row.errors && row.errors.length > 0) {
      status = row.errors.join(', ');
      statusClass = 'status-invalid';
      invalidCount++;
    } else if (row.is_duplicate) {
      status = 'ID Duplikat';
      statusClass = 'status-duplicate';
      duplicateCount++;
    } else {
      validCount++;
    }
    
    return `
      <tr>
        <td>${row.mahasiswa_id || '-'}</td>
        <td>${row.name || '-'}</td>
        <td>${row.kelompok || '-'}</td>
        <td>${row.jurusan || '-'}</td>
        <td>${row.email || '-'}</td>
        <td><span class="${statusClass}">${status}</span></td>
      </tr>
    `;
  }).join('');
  
  summary.innerHTML = `
    <strong>Total:</strong> ${data.rows.length} baris | 
    <span style="color:var(--success)">Valid: ${validCount}</span> | 
    <span style="color:var(--danger)">Error: ${invalidCount}</span> | 
    <span style="color:var(--warning)">Duplikat: ${duplicateCount}</span>
  `;
  
  document.getElementById('excel-preview').style.display = 'block';
  
  // Enable/disable submit button based on validation
  const submitBtn = document.getElementById('excel-submit-btn');
  if (validCount > 0) {
    submitBtn.disabled = false;
    submitBtn.textContent = `Upload ${validCount} Data Valid`;
  } else {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Tidak Ada Data Valid';
  }
}

async function submitExcelMahasiswa() {
  const fileInput = document.getElementById('excel-file-input');
  const file = fileInput.files[0];
  
  if (!file) {
    toast('Pilih file Excel terlebih dahulu', '', true);
    return;
  }
  
  const formData = new FormData();
  formData.append('excel_file', file);
  
  const btn = document.getElementById('excel-submit-btn');
  const progressContainer = document.getElementById('excel-upload-progress');
  const progressFill = document.getElementById('upload-progress-fill');
  const statusText = document.getElementById('upload-status');
  
  btn.disabled = true;
  btn.textContent = 'Mengupload...';
  progressContainer.style.display = 'block';
  
  try {
    // Simulate progress for better UX
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 90) progress = 90;
      progressFill.style.width = progress + '%';
      statusText.textContent = `Memproses... ${Math.round(progress)}%`;
    }, 200);
    
    const res = await fetch(API + '/mahasiswa/excel-upload', {
      method: 'POST',
      body: formData
    });
    
    clearInterval(progressInterval);
    progressFill.style.width = '100%';
    
    const result = await res.json();
    
    if (result.success) {
      statusText.textContent = `Berhasil! ${result.data.inserted} mahasiswa ditambahkan`;
      toast('Upload Excel berhasil', `${result.data.inserted} mahasiswa berhasil ditambahkan`);
      
      setTimeout(() => {
        closeModal('modal-mahasiswa');
        loadMahasiswa(); // Refresh data
        resetExcelForm();
      }, 2000);
    } else {
      statusText.textContent = 'Upload gagal: ' + (result.message || 'Terjadi kesalahan');
      toast('Upload Excel gagal', result.message || 'Terjadi kesalahan', true);
    }
  } catch (e) {
    console.error('Error uploading Excel:', e);
    statusText.textContent = 'Upload gagal: Koneksi bermasalah';
    toast('Upload Excel gagal', 'Pastikan server berjalan', true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Upload Data Excel';
    
    setTimeout(() => {
      progressContainer.style.display = 'none';
      progressFill.style.width = '0%';
    }, 3000);
  }
}

// ─── Enhanced Modal Functions ────────────────────────────────────────────
function openAddMahasiswa() {
  // Change modal title back to "Tambah Mahasiswa" and left-align it
  const modalTitle = document.getElementById('modal-mahasiswa-title');
  if (modalTitle) {
    modalTitle.textContent = 'Tambah Mahasiswa';
    modalTitle.style.textAlign = 'left';
  }
  
  // Show method selection dropdown
  const methodSelect = document.getElementById('add-method-select');
  if (methodSelect && methodSelect.closest('.form-row')) {
    methodSelect.closest('.form-row').style.display = '';
  }
  
  // Reset to manual method by default
  document.getElementById('add-method-select').value = 'manual';
  toggleAddMethod();
  
  // Reset QR display
  document.getElementById('qr-result-box').classList.remove('show');
  document.getElementById('mhs-form').style.display = '';
  document.getElementById('mhs-submit-btn').style.display = '';
  
  // Clear form fields
  ['f-id', 'f-name', 'f-dept', 'f-pos', 'f-email', 'f-telp-mhs', 'f-telp-ortu'].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.value = '';
  });
  
  document.getElementById('modal-mahasiswa').classList.add('show');
}

function resetMahasiswaForm() {
  ['f-id', 'f-name', 'f-dept', 'f-pos', 'f-email', 'f-telp-mhs', 'f-telp-ortu'].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.value = '';
  });
  
  const qrBox = document.getElementById('qr-result-box');
  if (qrBox) qrBox.classList.remove('show');
  
  const form = document.getElementById('mhs-form');
  if (form) form.style.display = '';
}

// ─── Initialize Enhanced Features ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  // Add event listener for method selection
  const methodSelect = document.getElementById('add-method-select');
  if (methodSelect) {
    methodSelect.addEventListener('change', toggleAddMethod);
  }
});

// ─── Filter Functions for Verifikasi Pengajuan ───────────────────────────────

// Store original data
let allIzinSubmissions = [];
let allKehadiranSubmissions = [];

function populateIzinKelompokFilter(submissions) {
  const kelompokSet = new Set(submissions.map(s => s.kelompok).filter(k => k));
  const select = document.getElementById('izin-filter-kelompok');
  if (!select) return;
  
  const currentValue = select.value;
  select.innerHTML = '<option value="">Semua</option>' + 
    Array.from(kelompokSet).sort().map(k => `<option value="${k}">${k}</option>`).join('');
  if (currentValue) select.value = currentValue;
}

function filterIzinSubmissions() {
  const searchTerm = document.getElementById('izin-search')?.value.toLowerCase() || '';
  const filterKelompok = document.getElementById('izin-filter-kelompok')?.value || '';
  const filterStatus = document.getElementById('izin-filter-status')?.value || '';
  
  let filtered = allIzinSubmissions;
  
  // Filter by name
  if (searchTerm) {
    filtered = filtered.filter(s => s.name.toLowerCase().includes(searchTerm));
  }
  
  // Filter by kelompok
  if (filterKelompok) {
    filtered = filtered.filter(s => s.kelompok === filterKelompok);
  }
  
  // Filter by status
  if (filterStatus) {
    filtered = filtered.filter(s => s.status === filterStatus);
  }
  
  renderIzinSubmissions(filtered);
}

function renderIzinSubmissions(submissions) {
  const tbody = document.getElementById('izin-submissions-table-body');
  if (!tbody) return;
  
  if (!submissions.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:30px">Tidak ada data ditemukan</td></tr>';
    return;
  }
  
  tbody.innerHTML = submissions.map(s => {
    const statusBadge = {
      pending:  '<span class="badge badge-yellow"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">schedule</span> Pending</span>',
      approved: '<span class="badge badge-green"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">check_circle</span> Disetujui</span>',
      rejected: '<span class="badge badge-red"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">cancel</span> Ditolak</span>'
    }[s.status] || s.status;

    const typeBadge = s.submission_type === 'izin'
      ? '<span class="badge badge-blue">Izin</span>'
      : '<span class="badge badge-orange">Sakit</span>';

    const buktiBtn = s.bukti_path
      ? `<button class="btn btn-ghost btn-sm" onclick="viewBukti(${s.id},'${s.bukti_path}')" title="Lihat Bukti">
          <span class="material-symbols-outlined" style="font-size:14px">attach_file</span>
         </button>`
      : '<span style="color:var(--text-muted)">—</span>';

    const actionBtns = s.status === 'pending'
      ? `<div style="display:flex;gap:6px">
          <button class="btn btn-sm" style="background:var(--success);color:#fff" onclick="approveIzin(${s.id})">
            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">check</span> Setujui
          </button>
          <button class="btn btn-sm btn-danger" onclick="openRejectModal(${s.id})">
            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">close</span> Tolak
          </button>
         </div>`
      : `<span style="font-size:12px;color:var(--text-muted)">${s.verified_by || '—'}<br>${s.verified_at ? new Date(s.verified_at).toLocaleDateString('id-ID') : ''}</span>`;

    return `<tr>
      <td>
        <div style="font-weight:600">${s.name}</div>
        <div style="font-size:12px;color:var(--text-muted)">${s.mahasiswa_id}</div>
      </td>
      <td><span class="badge badge-blue">${s.kelompok}</span></td>
      <td>${typeBadge}</td>
      <td style="font-family:var(--font-mono);font-size:13px">${s.date}</td>
      <td style="max-width:180px;white-space:normal;font-size:13px">${s.keterangan}</td>
      <td>${buktiBtn}</td>
      <td>${statusBadge}</td>
      <td>${actionBtns}</td>
    </tr>`;
  }).join('');
}

function resetIzinFilter() {
  document.getElementById('izin-search').value = '';
  document.getElementById('izin-filter-kelompok').value = '';
  document.getElementById('izin-filter-status').value = 'pending';
  loadIzinSubmissions();
}

function populateKehadiranKelompokFilter(submissions) {
  const kelompokSet = new Set(submissions.map(s => s.kelompok).filter(k => k));
  const select = document.getElementById('kehadiran-filter-kelompok');
  if (!select) return;
  
  const currentValue = select.value;
  select.innerHTML = '<option value="">Semua</option>' + 
    Array.from(kelompokSet).sort().map(k => `<option value="${k}">${k}</option>`).join('');
  if (currentValue) select.value = currentValue;
}

function filterKehadiranSubmissions() {
  const searchTerm = document.getElementById('kehadiran-search')?.value.toLowerCase() || '';
  const filterKelompok = document.getElementById('kehadiran-filter-kelompok')?.value || '';
  const filterStatus = document.getElementById('kehadiran-filter-status')?.value || '';
  
  let filtered = allKehadiranSubmissions;
  
  // Filter by name
  if (searchTerm) {
    filtered = filtered.filter(s => s.name.toLowerCase().includes(searchTerm));
  }
  
  // Filter by kelompok
  if (filterKelompok) {
    filtered = filtered.filter(s => s.kelompok === filterKelompok);
  }
  
  // Filter by status
  if (filterStatus) {
    filtered = filtered.filter(s => s.status === filterStatus);
  }
  
  renderKehadiranSubmissions(filtered);
}

function renderKehadiranSubmissions(submissions) {
  const tbody = document.getElementById('kehadiran-submissions-table-body');
  if (!tbody) return;
  
  if (!submissions.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:30px">Tidak ada data ditemukan</td></tr>';
    return;
  }
  
  tbody.innerHTML = submissions.map(s => {
    const statusBadge = {
      pending:  '<span class="badge badge-yellow"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">schedule</span> Pending</span>',
      approved: '<span class="badge badge-green"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">check_circle</span> Disetujui</span>',
      rejected: '<span class="badge badge-red"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">cancel</span> Ditolak</span>'
    }[s.status] || s.status;

    const buktiBtn = s.bukti_path
      ? `<button class="btn btn-ghost btn-sm" onclick="viewBukti(${s.id},'${s.bukti_path}')" title="Lihat Bukti">
          <span class="material-symbols-outlined" style="font-size:14px">attach_file</span>
         </button>`
      : '<span style="color:var(--text-muted)">—</span>';

    const actionBtns = s.status === 'pending'
      ? `<div style="display:flex;gap:6px">
          <button class="btn btn-sm" style="background:var(--success);color:#fff" onclick="approveKehadiran(${s.id})">
            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">check</span> Setujui
          </button>
          <button class="btn btn-sm btn-danger" onclick="openRejectKehadiranModal(${s.id})">
            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">close</span> Tolak
          </button>
         </div>`
      : `<span style="font-size:12px;color:var(--text-muted)">${s.verified_by || '—'}<br>${s.verified_at ? new Date(s.verified_at).toLocaleDateString('id-ID') : ''}</span>`;

    return `<tr>
      <td>
        <div style="font-weight:600">${s.name}</div>
        <div style="font-size:12px;color:var(--text-muted)">${s.mahasiswa_id}</div>
      </td>
      <td><span class="badge badge-blue">${s.kelompok}</span></td>
      <td style="font-family:var(--font-mono);font-size:13px">${s.date}</td>
      <td style="font-family:var(--font-mono);font-size:13px">${s.check_in_time || '—'}</td>
      <td style="font-family:var(--font-mono);font-size:13px">${s.check_out_time || '—'}</td>
      <td style="max-width:180px;white-space:normal;font-size:13px">${s.keterangan}</td>
      <td>${buktiBtn}</td>
      <td>${statusBadge}</td>
      <td>${actionBtns}</td>
    </tr>`;
  }).join('');
}

function resetKehadiranFilter() {
  document.getElementById('kehadiran-search').value = '';
  document.getElementById('kehadiran-filter-kelompok').value = '';
  document.getElementById('kehadiran-filter-status').value = 'pending';
  loadKehadiranSubmissions();
}


// ═══════════════════════════════════════════════════════════════
// USER MANAGEMENT FUNCTIONS
// ═══════════════════════════════════════════════════════════════

let usersData = [];
let filteredUsersData = [];

// Load all users
async function loadUsers() {
  try {
    const token = getAuthToken();
    const response = await fetch(`${API}/users`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (result.success) {
      usersData = result.data;
      filteredUsersData = [...usersData];
      renderUsers();
    } else {
      toast('Error', result.message, true);
    }
  } catch (error) {
    console.error('Error loading users:', error);
    toast('Error', 'Gagal memuat data users', true);
  }
}

// Render users table
function renderUsers() {
  const tbody = document.getElementById('users-tbody');
  
  if (filteredUsersData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:30px">Tidak ada data user</td></tr>';
    return;
  }
  
  tbody.innerHTML = filteredUsersData.map(user => {
    const statusBadge = user.is_active 
      ? '<span class="badge badge-success">Aktif</span>' 
      : '<span class="badge badge-danger">Nonaktif</span>';
    
    const roleBadge = user.role === 'admin' 
      ? '<span class="badge badge-primary">Admin</span>'
      : user.role === 'timdis'
      ? '<span class="badge badge-info">Tim Disiplin</span>'
      : '<span class="badge badge-secondary">Mahasiswa</span>';
    
    const lastLogin = user.last_login 
      ? new Date(user.last_login).toLocaleString('id-ID')
      : 'Belum pernah login';
    
    const mahasiswaId = user.mahasiswa_id || '-';
    
    return `
      <tr>
        <td><strong>${user.username}</strong></td>
        <td>${user.full_name}</td>
        <td>${user.email || '-'}</td>
        <td>${roleBadge}</td>
        <td>${mahasiswaId}</td>
        <td>${statusBadge}</td>
        <td style="font-size:12px">${lastLogin}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="editUser(${user.id})" title="Edit">
            <span class="material-symbols-outlined" style="font-size:16px">edit</span>
          </button>
          ${user.is_active 
            ? `<button class="btn btn-ghost btn-sm" onclick="toggleUserStatus(${user.id}, 0)" title="Nonaktifkan">
                <span class="material-symbols-outlined" style="font-size:16px;color:var(--danger)">block</span>
              </button>`
            : `<button class="btn btn-ghost btn-sm" onclick="toggleUserStatus(${user.id}, 1)" title="Aktifkan">
                <span class="material-symbols-outlined" style="font-size:16px;color:var(--success)">check_circle</span>
              </button>`
          }
          <button class="btn btn-ghost btn-sm" onclick="resetUserPassword(${user.id})" title="Reset Password">
            <span class="material-symbols-outlined" style="font-size:16px">lock_reset</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Filter users
function filterUsers() {
  const searchTerm = document.getElementById('user-search').value.toLowerCase();
  const roleFilter = document.getElementById('user-filter-role').value;
  const statusFilter = document.getElementById('user-filter-status').value;
  
  filteredUsersData = usersData.filter(user => {
    const matchSearch = user.username.toLowerCase().includes(searchTerm) || 
                       user.full_name.toLowerCase().includes(searchTerm);
    const matchRole = !roleFilter || user.role === roleFilter;
    const matchStatus = !statusFilter || user.is_active.toString() === statusFilter;
    
    return matchSearch && matchRole && matchStatus;
  });
  
  renderUsers();
}

// Reset filter
function resetUserFilter() {
  document.getElementById('user-search').value = '';
  document.getElementById('user-filter-role').value = '';
  document.getElementById('user-filter-status').value = '';
  filteredUsersData = [...usersData];
  renderUsers();
}

// Open add user modal
async function openAddUserModal() {
  document.getElementById('user-modal-title').textContent = 'Tambah User';
  document.getElementById('user-id').value = '';
  document.getElementById('user-form').reset();
  document.getElementById('password-row').style.display = '';
  document.getElementById('user-password').required = true;
  document.getElementById('user-username').disabled = false;
  
  // Load mahasiswa list for dropdown
  await loadMahasiswaForUserForm();
  
  document.getElementById('modal-user').classList.add('show');
}

// Load mahasiswa list for user form
async function loadMahasiswaForUserForm() {
  try {
    const response = await fetch(`${API}/mahasiswa`);
    const result = await response.json();
    
    if (result.success) {
      const select = document.getElementById('user-mahasiswa-id');
      select.innerHTML = '<option value="">-- Pilih Mahasiswa --</option>';
      
      // Filter mahasiswa yang belum punya user account
      const mahasiswaWithoutUser = result.data.filter(mhs => {
        return !usersData.some(user => user.mahasiswa_id === mhs.id);
      });
      
      mahasiswaWithoutUser.forEach(mhs => {
        select.innerHTML += `<option value="${mhs.id}">${mhs.id} - ${mhs.name}</option>`;
      });
    }
  } catch (error) {
    console.error('Error loading mahasiswa:', error);
  }
}

// Toggle mahasiswa field based on role
function toggleMahasiswaField() {
  const role = document.getElementById('user-role').value;
  const mahasiswaRow = document.getElementById('mahasiswa-id-row');
  const mahasiswaSelect = document.getElementById('user-mahasiswa-id');
  
  if (role === 'mahasiswa') {
    mahasiswaRow.style.display = '';
    mahasiswaSelect.required = true;
  } else {
    mahasiswaRow.style.display = 'none';
    mahasiswaSelect.required = false;
    mahasiswaSelect.value = '';
  }
}

// Edit user
async function editUser(userId) {
  const user = usersData.find(u => u.id === userId);
  if (!user) return;
  
  document.getElementById('user-modal-title').textContent = 'Edit User';
  document.getElementById('user-id').value = user.id;
  document.getElementById('user-username').value = user.username;
  document.getElementById('user-username').disabled = true; // Username tidak bisa diubah
  document.getElementById('user-fullname').value = user.full_name;
  document.getElementById('user-email').value = user.email || '';
  document.getElementById('user-role').value = user.role;
  
  // Hide password field when editing
  document.getElementById('password-row').style.display = 'none';
  document.getElementById('user-password').required = false;
  
  // Load mahasiswa list
  await loadMahasiswaForUserForm();
  
  // Set mahasiswa_id if exists
  if (user.mahasiswa_id) {
    // Add current mahasiswa to dropdown if not exists
    const select = document.getElementById('user-mahasiswa-id');
    if (!Array.from(select.options).some(opt => opt.value === user.mahasiswa_id)) {
      // Fetch mahasiswa info
      const mhsResponse = await fetch(`${API}/mahasiswa`);
      const mhsResult = await mhsResponse.json();
      if (mhsResult.success) {
        const mhs = mhsResult.data.find(m => m.id === user.mahasiswa_id);
        if (mhs) {
          select.innerHTML += `<option value="${mhs.id}">${mhs.id} - ${mhs.name}</option>`;
        }
      }
    }
    document.getElementById('user-mahasiswa-id').value = user.mahasiswa_id;
  }
  
  toggleMahasiswaField();
  document.getElementById('modal-user').classList.add('show');
}

// Submit user (create or update)
async function submitUser(event) {
  event.preventDefault();
  
  const userId = document.getElementById('user-id').value;
  const username = document.getElementById('user-username').value.trim();
  const password = document.getElementById('user-password').value;
  const fullName = document.getElementById('user-fullname').value.trim();
  const email = document.getElementById('user-email').value.trim();
  const role = document.getElementById('user-role').value;
  const mahasiswaId = document.getElementById('user-mahasiswa-id').value;
  
  // Validation
  if (!username || !fullName || !role) {
    toast('Error', 'Username, Nama Lengkap, dan Role wajib diisi', true);
    return;
  }
  
  if (!userId && !password) {
    toast('Error', 'Password wajib diisi untuk user baru', true);
    return;
  }
  
  if (password && password.length < 6) {
    toast('Error', 'Password minimal 6 karakter', true);
    return;
  }
  
  if (role === 'mahasiswa' && !mahasiswaId) {
    toast('Error', 'Mahasiswa ID wajib diisi untuk role Mahasiswa', true);
    return;
  }
  
  try {
    const token = getAuthToken();
    const url = userId ? `${API}/users/${userId}` : `${API}/users`;
    const method = userId ? 'PUT' : 'POST';
    
    const body = {
      full_name: fullName,
      email: email || null
    };
    
    // Only include these fields when creating new user
    if (!userId) {
      body.username = username;
      body.password = password;
      body.role = role;
      if (role === 'mahasiswa') {
        body.mahasiswa_id = mahasiswaId;
      }
    }
    
    const response = await fetch(url, {
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    const result = await response.json();
    
    if (result.success) {
      toast('Berhasil', userId ? 'User berhasil diupdate' : 'User berhasil ditambahkan');
      document.getElementById('modal-user').classList.remove('show');
      loadUsers();
    } else {
      toast('Error', result.message, true);
    }
  } catch (error) {
    console.error('Error submitting user:', error);
    toast('Error', 'Gagal menyimpan user', true);
  }
}

// Toggle user status (activate/deactivate)
async function toggleUserStatus(userId, newStatus) {
  const action = newStatus === 1 ? 'mengaktifkan' : 'menonaktifkan';
  
  if (!confirm(`Apakah Anda yakin ingin ${action} user ini?`)) {
    return;
  }
  
  try {
    const token = getAuthToken();
    const endpoint = newStatus === 1 ? 'activate' : 'deactivate';
    
    const response = await fetch(`${API}/users/${userId}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (result.success) {
      toast('Berhasil', `User berhasil ${newStatus === 1 ? 'diaktifkan' : 'dinonaktifkan'}`);
      loadUsers();
    } else {
      toast('Error', result.message, true);
    }
  } catch (error) {
    console.error('Error toggling user status:', error);
    toast('Error', `Gagal ${action} user`, true);
  }
}

// Reset user password
async function resetUserPassword(userId) {
  const user = usersData.find(u => u.id === userId);
  if (!user) return;
  
  const newPassword = prompt(`Reset password untuk user: ${user.username}\n\nMasukkan password baru (minimal 6 karakter):`);
  
  if (!newPassword) return;
  
  if (newPassword.length < 6) {
    toast('Error', 'Password minimal 6 karakter', true);
    return;
  }
  
  try {
    const token = getAuthToken();
    
    // We need to use admin privilege to reset password
    // This requires a new endpoint in api_server.py
    const response = await fetch(`${API}/users/${userId}/reset-password`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ new_password: newPassword })
    });
    
    const result = await response.json();
    
    if (result.success) {
      toast('Berhasil', 'Password berhasil direset');
    } else {
      toast('Error', result.message, true);
    }
  } catch (error) {
    console.error('Error resetting password:', error);
    toast('Error', 'Gagal reset password', true);
  }
}

// Get auth token
function getAuthToken() {
  return localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
}

// Add users page to showPage function
// Note: We need to modify the existing showPage function to include users page
// This is done by checking in the existing showPage function


// ═══════════════════════════════════════════════════════════════
// MODAL EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════

// Close modal when clicking backdrop
document.addEventListener('DOMContentLoaded', function() {
  // Close modal user when clicking backdrop
  const modalUser = document.getElementById('modal-user');
  if (modalUser) {
    modalUser.addEventListener('click', function(e) {
      if (e.target === modalUser) {
        modalUser.classList.remove('show');
      }
    });
  }
  
  // Close modal mahasiswa when clicking backdrop (if not already handled)
  const modalMahasiswa = document.getElementById('modal-mahasiswa');
  if (modalMahasiswa) {
    modalMahasiswa.addEventListener('click', function(e) {
      if (e.target === modalMahasiswa) {
        modalMahasiswa.classList.remove('show');
      }
    });
  }
});
