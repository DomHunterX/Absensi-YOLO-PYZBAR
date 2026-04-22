const API = 'http://localhost:5000/api';
let mahasiswaData = [];

// ─── Toast Notification ──────────────────────────────────────────────────
function toast(title, msg = '', isError = false) {
  const t = document.getElementById('toast');
  document.getElementById('toast-title').textContent = title;
  document.getElementById('toast-msg').textContent = msg;
  t.className = isError ? 'show error' : 'show';
  setTimeout(() => t.className = '', 4000);
}

// ─── Modal ───────────────────────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.modal-backdrop').forEach(el => {
    el.addEventListener('click', function (e) {
      if (e.target === this) closeModal(this.id);
    });
  });
});

// ─── Load Mahasiswa ──────────────────────────────────────────────────────
async function loadMahasiswa() {
  try {
    const res = await fetch(API + '/mahasiswa');
    const result = await res.json();
    if (result.success) {
      mahasiswaData = result.data || [];
      populateMahasiswaSelect(mahasiswaData);
    }
  } catch (e) {
    console.error('Error loading mahasiswa:', e);
    toast('Gagal memuat data mahasiswa', 'Pastikan server berjalan', true);
  }
}

function populateMahasiswaSelect(data) {
  // Populate dropdown Izin/Sakit
  const selIzin = document.getElementById('izin-mahasiswa-select');
  selIzin.innerHTML = '<option value="">-- Pilih Mahasiswa --</option>';
  data.forEach(m => {
    const opt = document.createElement('option');
    // Handle both 'id' and 'mahasiswa_id' field names
    const mhsId = m.mahasiswa_id || m.id;
    opt.value = mhsId;
    opt.textContent = `${m.name} — Kelompok ${m.kelompok}`;
    selIzin.appendChild(opt);
  });
  
  // Populate dropdown Kehadiran Manual
  const selKehadiran = document.getElementById('kehadiran-mahasiswa-select');
  if (selKehadiran) {
    selKehadiran.innerHTML = '<option value="">-- Pilih Mahasiswa --</option>';
    data.forEach(m => {
      const opt = document.createElement('option');
      const mhsId = m.mahasiswa_id || m.id;
      opt.value = mhsId;
      opt.textContent = `${m.name} — Kelompok ${m.kelompok}`;
      selKehadiran.appendChild(opt);
    });
  }
}

// ─── Submit Izin ─────────────────────────────────────────────────────────
async function submitIzin() {
  const mahasiswaId = document.getElementById('izin-mahasiswa-select').value;
  const type = document.getElementById('izin-type-select').value;
  const date = document.getElementById('izin-date-input').value;
  const keterangan = document.getElementById('izin-keterangan-input').value.trim();
  const buktiFile = document.getElementById('izin-bukti-input').files[0];

  // Validasi
  if (!mahasiswaId) return toast('Pilih mahasiswa terlebih dahulu', '', true);
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
  document.getElementById('izin-mahasiswa-select').value = '';
  document.getElementById('izin-type-select').value = 'izin';
  document.getElementById('izin-date-input').value = new Date().toISOString().split('T')[0];
  document.getElementById('izin-keterangan-input').value = '';
  document.getElementById('izin-bukti-input').value = '';
  document.getElementById('my-izin-table-body').innerHTML =
    '<tr><td colspan="7" class="empty-state">Pilih mahasiswa untuk melihat riwayat</td></tr>';
}

// ─── Load Riwayat ────────────────────────────────────────────────────────
// Store submissions data for detail modal
let mySubmissionsData = [];

async function loadMyIzinHistory() {
  const mahasiswaId = document.getElementById('izin-mahasiswa-select').value;
  if (!mahasiswaId) return;

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

    // Get selected mahasiswa info - handle both 'id' and 'mahasiswa_id'
    const selectedMhs = mahasiswaData.find(m => (m.mahasiswa_id || m.id) === mahasiswaId);

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
          <div style="font-weight:600">${selectedMhs?.name || s.name || '—'}</div>
        </td>
        <td><span class="badge badge-blue">${selectedMhs?.kelompok || '—'}</span></td>
        <td style="font-size:14px">${selectedMhs?.jurusan || '—'}</td>
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

  const mahasiswaId = document.getElementById('izin-mahasiswa-select').value;
  // Handle both 'id' and 'mahasiswa_id' field names
  const selectedMhs = mahasiswaData.find(m => (m.mahasiswa_id || m.id) === mahasiswaId);

  // Fill mahasiswa info
  document.getElementById('mhs-detail-mahasiswa-id').textContent = mahasiswaId;
  document.getElementById('mhs-detail-mahasiswa-name').textContent = selectedMhs?.name || submission.name || '—';
  document.getElementById('mhs-detail-mahasiswa-kelompok').textContent = selectedMhs?.kelompok || '—';
  document.getElementById('mhs-detail-mahasiswa-jurusan').textContent = selectedMhs?.jurusan || '—';

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
  
  // Load mahasiswa on page load
  loadMahasiswa();
  
  // Add change listener for mahasiswa select
  document.getElementById('izin-mahasiswa-select').addEventListener('change', loadMyIzinHistory);
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
  const mahasiswaId = document.getElementById('kehadiran-mahasiswa-select').value;
  const date = document.getElementById('kehadiran-date-input').value;
  const checkIn = document.getElementById('kehadiran-checkin-input').value;
  const checkOut = document.getElementById('kehadiran-checkout-input').value;
  const keterangan = document.getElementById('kehadiran-keterangan-input').value.trim();
  const buktiFile = document.getElementById('kehadiran-bukti-input').files[0];

  // Validasi
  if (!mahasiswaId) {
    toast('Pilih mahasiswa terlebih dahulu', '', true);
    return;
  }
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
      loadMyIzinHistory(); // Reload history
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
