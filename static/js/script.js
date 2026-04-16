const API = 'http://localhost:5000/api';

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
        if (n.textContent.toLowerCase().includes(page === 'dashboard' ? 'dash' : page === 'attendance' ? 'absensi' : page === 'cameras' ? 'kamera' : page === 'mahasiswa' ? 'mahasiswa' : page === 'history' ? 'riwayat' : 'pengaturan'))
          n.classList.add('active');
      });
      currentPage = page;
      if (page === 'attendance') loadFullAttendance();
      if (page === 'mahasiswa') loadMahasiswa();
      if (page === 'cameras') loadCameras();
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
        const r = await fetch(API + path, {
          headers: { 'Content-Type': 'application/json' },
          ...opts
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
        const status = r.check_out ? '<span class="badge badge-green">Lengkap</span>'
          : r.check_in ? '<span class="badge badge-yellow">Masih Dalam</span>'
            : '<span class="badge badge-red">Absen</span>';
        const conf = r.yolo_confidence ? `<span style="font-size:10px;color:var(--muted);font-family:var(--mono)">${Math.round(r.yolo_confidence * 100)}%</span>` : '';
        const checkIn = r.check_in ? `<span class="time-val">${r.check_in.slice(11, 19) || r.check_in}</span>` : '<span class="time-dash">—</span>';
        const checkOut = r.check_out ? `<span class="time-val">${r.check_out.slice(11, 19) || r.check_out}</span>` : '<span class="time-dash">—</span>';
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
        const status = r.check_out ? '<span class="badge badge-green">Lengkap</span>'
          : r.check_in ? '<span class="badge badge-yellow">Hadir</span>'
            : '<span class="badge badge-red">Absen</span>';
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
      const rows = attendanceData.map(r =>
        `${r.name},${r.kelompok},${r.check_in || ''},${r.check_out || ''},${r.status},${r.camera_id || ''}`
      ).join('\n');
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

    function renderMahasiswa(list) {
      const tbody = document.getElementById('mhs-tbody');
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:30px">Belum ada mahasiswa</td></tr>';
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
        document.getElementById('qr-result-box').classList.add('show');
        document.getElementById('mhs-form').style.display = 'none';
        document.getElementById('mhs-submit-btn').style.display = 'none';
        document.getElementById('qr-img-display').src = `data:image/png;base64,${res.data.qr_image_base64}`;
        document.getElementById('qr-id-label').textContent = res.data.qr_code_id;
        currentQRBase64 = res.data.qr_image_base64;
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
        return `<tr>
      <td style="font-family:var(--mono);font-size:12px">${r.date || r.check_in?.slice(0, 10) || '—'}</td>
      <td class="mhs-name">${r.name}</td>
      <td><span class="badge badge-blue">${r.kelompok}</span></td>
      <td><span class="time-val">${ci}</span></td>
      <td><span class="${r.check_out ? 'time-val' : 'time-dash'}">${co}</span></td>
      <td style="font-family:var(--mono);font-size:12px;color:var(--accent2)">${dur}</td>
      <td>${r.check_out ? '<span class="badge badge-green">Lengkap</span>' : '<span class="badge badge-yellow">Parsial</span>'}</td>
    </tr>`;
      }).join('');
    }

    // ─── Modals ─────────────────────────────────────────────────────────────────
    function openAddMahasiswa() {
      document.getElementById('qr-result-box').classList.remove('show');
      document.getElementById('mhs-form').style.display = '';
      document.getElementById('mhs-submit-btn').style.display = '';
      ['f-id', 'f-name', 'f-dept', 'f-pos', 'f-email'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('modal-mahasiswa').classList.add('show');
    }

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
        email: document.getElementById('f-email').value.trim()
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

    // ─── Init ────────────────────────────────────────────────────────────────────
    loadDashboard();