/* ============================================
   LKS Robotik 2026 – Application Logic
   ============================================ */

'use strict';

import {
  pushStateToFirebase,
  pullStateFromFirebase,
  getAdminPassword,
  setAdminPassword,
  sendChatMessage,
  subscribeChat,
  setStreamConfig,
  subscribeStreamConfig,
  writeOfferForViewer,
  subscribeRequests,
  subscribeAnswer,
  pushIceCandidate,
  subscribeIceCandidates,
  clearSignaling,
} from './firebase.js';

// ── Data Definitions ──────────────────────────────────────────────

// CONTINGENTS is now dynamic — loaded from localStorage, managed via dashboard UI
let CONTINGENTS = [];

// Palette pool for auto-assigning colors to new contingents
const COLOR_PALETTE = [
  { color: '#3B82F6', bg: 'rgba(59,130,246,0.15)',  tc: '#60A5FA' },
  { color: '#A78BFA', bg: 'rgba(167,139,250,0.15)', tc: '#C4B5FD' },
  { color: '#34D399', bg: 'rgba(52,211,153,0.15)',  tc: '#6EE7B7' },
  { color: '#FBBF24', bg: 'rgba(251,191,36,0.15)',  tc: '#FCD34D' },
  { color: '#F472B6', bg: 'rgba(244,114,182,0.15)', tc: '#F9A8D4' },
  { color: '#FB923C', bg: 'rgba(251,146,60,0.15)',  tc: '#FDBA74' },
  { color: '#22D3EE', bg: 'rgba(34,211,238,0.15)',  tc: '#67E8F9' },
  { color: '#A3E635', bg: 'rgba(163,230,53,0.15)',  tc: '#BEF264' },
];

function nextPaletteEntry() {
  const idx = CONTINGENTS.length % COLOR_PALETTE.length;
  return COLOR_PALETTE[idx];
}

function addContingent(name, region) {
  const trimName   = name.trim();
  const trimRegion = region.trim();
  if (!trimName) return;
  const palette = nextPaletteEntry();
  const words   = trimName.split(/\s+/);
  const short   = words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : trimName.slice(0, 2).toUpperCase();
  const id = 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  CONTINGENTS.push({
    id,
    name: trimName,
    short,
    region: trimRegion || trimName,
    ...palette,
  });
  saveStorage();
  render();
}

function removeContingent(id) {
  if (!confirm('Hapus kontingen ini beserta semua data penilaiannya?')) return;
  CONTINGENTS = CONTINGENTS.filter(c => c.id !== id);
  // Also remove their scores
  Object.keys(state.scores).forEach(k => {
    if (k.startsWith(id + '_')) delete state.scores[k];
  });
  saveStorage();
  render();
}

const ASSESSMENTS = [
  { id: 'perakitan', label: 'Perakitan Robot',        icon: 'ti-tool',    pct: 10, desc: 'Merakit lifter (batas 2 jam)' },
  { id: 'gerakan',   label: 'Gerakan Dasar',           icon: 'ti-robot',   pct: 12, desc: '10 sub-poin (D1–D10)' },
  { id: 'c1',        label: 'C1 – Navigasi Otonom',   icon: 'ti-route',   pct: 30, desc: 'Meletakkan kubus (arena 1)' },
  { id: 'c2',        label: 'C2 – Navigasi Otonom',   icon: 'ti-route-2', pct: 30, desc: 'Meletakkan kubus (arena 2)' },
];

const CUBES = [
  { id: 'r-circle', label: 'Merah – Lingkaran', color: '#EF4444' },
  { id: 'r-tri',    label: 'Merah – Segitiga',  color: '#EF4444' },
  { id: 'r-rect',   label: 'Merah – Persegi',   color: '#EF4444' },
  { id: 'g-circle', label: 'Hijau – Lingkaran', color: '#22C55E' },
  { id: 'g-tri',    label: 'Hijau – Segitiga',  color: '#22C55E' },
  { id: 'g-rect',   label: 'Hijau – Persegi',   color: '#22C55E' },
  { id: 'b-circle', label: 'Biru – Lingkaran',  color: '#3B82F6' },
  { id: 'b-tri',    label: 'Biru – Segitiga',   color: '#3B82F6' },
  { id: 'b-rect',   label: 'Biru – Persegi',    color: '#3B82F6' },
];

// Generate sub-checklist items untuk satu kubus di sesi C (c1 atau c2)
function cubeSubItems(prefix, cube) {
  return [
    {
      id:        `${prefix}_${cube.id}_touch`,
      label:     `${cube.label} – Menyentuh kubus`,
      sub:       'Robot berhasil menyentuh kubus ini',
      cubeId:    cube.id,
      cubeColor: cube.color,
    },
    {
      id:        `${prefix}_${cube.id}_pick`,
      label:     `${cube.label} – Mengambil kubus`,
      sub:       'Robot berhasil mengangkat/mengambil kubus dari posisinya',
      cubeId:    cube.id,
      cubeColor: cube.color,
    },
    {
      id:        `${prefix}_${cube.id}_place`,
      label:     `${cube.label} – Meletakkan ke rak`,
      sub:       'Robot berhasil meletakkan kubus ke dalam rak',
      cubeId:    cube.id,
      cubeColor: cube.color,
    },
    {
      id:        `${prefix}_${cube.id}_correct`,
      label:     `${cube.label} – Posisi benar di rak`,
      sub:       'Kubus diletakkan dengan posisi/orientasi yang benar di dalam rak',
      cubeId:    cube.id,
      cubeColor: cube.color,
    },
  ];
}

function buildCSessionItems(prefix) {
  return [
    { id: `${prefix}_home_out`,    label: 'Robot keluar dari home',              sub: 'Robot berhasil bergerak keluar dari zona home untuk memulai misi' },
    ...CUBES.flatMap(c => cubeSubItems(prefix, c)),
    { id: `${prefix}_home_return`, label: 'Robot kembali ke home (misi selesai)', sub: 'Robot berhasil kembali ke zona home setelah menyelesaikan seluruh misi' },
  ];
}

const CHECKLIST_DATA = {
  perakitan: [
    { id: 'assemble_lifter', label: 'Merakit lifter', sub: 'Dinyatakan selesai dalam batas waktu 2 jam' },
  ],
  gerakan: [
    { id: 'd1',  label: 'D1 – Maju, mundur, kiri, kanan', sub: 'Robot bergerak ke empat arah secara manual' },
    { id: 'd2',  label: 'D2 – Deteksi halangan',           sub: 'Robot bergerak dan mendeteksi halangan di jalurnya' },
    { id: 'd3',  label: 'D3 – Ikuti garis hitam (U)',       sub: 'Robot mengikuti garis hitam berbentuk U secara otonom' },
    { id: 'd4',  label: 'D4 – Deteksi kubus merah',        sub: 'Robot mendeteksi dan mengidentifikasi kubus berwarna merah' },
    { id: 'd5',  label: 'D5 – Deteksi kubus hijau',        sub: 'Robot mendeteksi dan mengidentifikasi kubus berwarna hijau' },
    { id: 'd6',  label: 'D6 – Deteksi kubus biru',         sub: 'Robot mendeteksi dan mengidentifikasi kubus berwarna biru' },
    { id: 'd7',  label: 'D7 – Deteksi lingkaran hijau',    sub: 'Robot mendeteksi bentuk lingkaran berwarna hijau' },
    { id: 'd8',  label: 'D8 – Deteksi lingkaran merah',    sub: 'Robot mendeteksi bentuk lingkaran berwarna merah' },
    { id: 'd9',  label: 'D9 – Ambil kubus dari rak',       sub: 'Lengan robot bergerak otonom mengambil dan membawa kubus dari rak' },
    { id: 'd10', label: 'D10 – Letakkan ke standbox',      sub: 'Lengan robot bergerak otonom meletakkan kubus ke standbox' },
  ],
  c1: buildCSessionItems('c1'),
  c2: buildCSessionItems('c2'),
};

// ── State ──────────────────────────────────────────────────────────

const state = {
  page: 'dashboard',          // 'dashboard' | 'contingents' | 'checklist'
  selectedAssessment: null,   // assessment id
  selectedContingent: null,   // contingent id
  configOpen: false,
  exportOpen: false,
  savedMsg: false,
  savedTimeout: null,
  syncTimeout: null,
  scores: {},                 // { contingentId_assessmentId: { itemId: bool } }
  bonusC1: [],   // array of cubeId strings
  bonusC2: [],
  activeContingentId: null,   // ID kontingen yang sedang dinilai (untuk viewer live focus)
  timer: {
    running: false,
    sec: 0,
    interval: null,
  },
};

// ── Auth State ─────────────────────────────────────────────────────

const auth = {
  loggedIn: false,
};

// ── Chat State ─────────────────────────────────────────────────────

const chat = {
  open:     false,
  messages: [],
  unsubscribe: null,
};

// ── Stream State ────────────────────────────────────────────────────

const stream = {
  mode: 'off',           // 'off' | 'camera' | 'link'
  url: '',               // YouTube/external URL (link mode)
  localStream: null,     // MediaStream (camera mode)
  peers: {},             // viewerId -> RTCPeerConnection
  unsubConfig: null,
  unsubRequests: null,
};

// ── Persistence (Firebase + localStorage fallback) ─────────────────

/** Build the serialisable payload that goes to Firebase & localStorage */
function buildPayload() {
  return {
    contingents:       CONTINGENTS,
    scores:            state.scores,
    bonusC1:           state.bonusC1,
    bonusC2:           state.bonusC2,
    activeContingentId: state.activeContingentId,
    updatedAt:         Date.now(),
  };
}

/** Apply an incoming payload (from Firebase or localStorage) to local state */
function applyPayload(data) {
  if (!data) return;
  if (data.contingents)   CONTINGENTS              = data.contingents;
  if (data.scores)        state.scores             = data.scores;
  if ('bonusC1' in data)  state.bonusC1 = Array.isArray(data.bonusC1) ? data.bonusC1 : (data.bonusC1 ? [data.bonusC1] : []);
  if ('bonusC2' in data)  state.bonusC2 = Array.isArray(data.bonusC2) ? data.bonusC2 : (data.bonusC2 ? [data.bonusC2] : []);
  if ('activeContingentId' in data) state.activeContingentId = data.activeContingentId;
}

function saveLocalFallback(payload) {
  try { localStorage.setItem('lks_backup', JSON.stringify(payload)); } catch(_) {}
}

function loadLocalFallback() {
  try {
    const raw = localStorage.getItem('lks_backup');
    if (raw) applyPayload(JSON.parse(raw));
  } catch(e) { console.warn('Fallback load failed:', e); }
}

/** Debounced push to Firebase (300ms) — avoids flooding on rapid taps */
function saveStorage() {
  const payload = buildPayload();
  saveLocalFallback(payload);
  if (state.syncTimeout) clearTimeout(state.syncTimeout);
  state.syncTimeout = setTimeout(async () => {
    try {
      await pushStateToFirebase(payload);
    } catch(e) {
      console.warn('Firebase push failed, local only:', e);
    }
  }, 300);
}

async function loadStorage() {
  // Race Firebase pull against a 5s timeout — whichever wins
  try {
    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error('Firebase timeout')), 5000)
    );
    const data = await Promise.race([pullStateFromFirebase(), timeout]);
    if (data) { applyPayload(data); return; }
  } catch(e) {
    console.warn('Firebase pull failed/timeout, using local fallback:', e);
  }
  loadLocalFallback();
}

function triggerSavedMsg() {
  saveStorage();
  state.savedMsg = true;
  if (state.savedTimeout) clearTimeout(state.savedTimeout);
  state.savedTimeout = setTimeout(() => { state.savedMsg = false; render(); }, 2200);
  render();
}

// ── Score Helpers ──────────────────────────────────────────────────

function scoreKey(contingentId, assessmentId) {
  return contingentId + '_' + assessmentId;
}

function getScore(contingentId, assessmentId) {
  return state.scores[scoreKey(contingentId, assessmentId)] || {};
}

function setCheck(contingentId, assessmentId, itemId, val) {
  const key = scoreKey(contingentId, assessmentId);
  if (!state.scores[key]) state.scores[key] = {};
  state.scores[key][itemId] = val;
  saveStorage();
  render();
}

function getProgress(contingentId, assessmentId) {
  const items = CHECKLIST_DATA[assessmentId] || [];
  if (!items.length) return { done: 0, total: 0 };
  const sc   = getScore(contingentId, assessmentId);
  const done = items.filter(it => sc[it.id]).length;
  return { done, total: items.length };
}

function overallProgress(contingentId) {
  let done = 0, total = 0;
  ASSESSMENTS.forEach(a => {
    const p = getProgress(contingentId, a.id);
    done  += p.done;
    total += p.total;
  });
  return total > 0 ? Math.round(done / total * 100) : 0;
}

function totalGlobalProgress() {
  let done = 0, total = 0;
  CONTINGENTS.forEach(c => {
    ASSESSMENTS.forEach(a => {
      const p = getProgress(c.id, a.id);
      done  += p.done;
      total += p.total;
    });
  });
  return { done, total };
}

// ── Timer ──────────────────────────────────────────────────────────

function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function startTimer() {
  if (state.timer.running) return;
  state.timer.running = true;
  state.timer.interval = setInterval(() => {
    state.timer.sec++;
    const el = document.getElementById('timer-display');
    if (el) {
      el.textContent = fmtTime(state.timer.sec);
      // Update warning color without full re-render
      const warn = document.getElementById('timer-status');
      if (warn) {
        if (state.timer.sec > 7200) {
          warn.className = 'timer-warn';
          warn.innerHTML = '<i class="ti ti-alert-triangle"></i> Melebihi batas waktu 2 jam!';
        } else {
          warn.className = 'timer-ok';
          warn.textContent = 'Batas waktu: 02:00:00';
        }
      }
    }
  }, 1000);
  render();
}

function stopTimer() {
  clearInterval(state.timer.interval);
  state.timer.running = false;
  render();
}

function resetTimer() {
  clearInterval(state.timer.interval);
  state.timer.running = false;
  state.timer.sec = 0;
  render();
}

// ── Navigation ─────────────────────────────────────────────────────

function handleAddContingent() {
  const nameEl   = document.getElementById('input-cont-name');
  const regionEl = document.getElementById('input-cont-region');
  if (!nameEl) return;
  const name   = nameEl.value.trim();
  const region = regionEl ? regionEl.value.trim() : '';
  if (!name) {
    nameEl.focus();
    nameEl.classList.add('input-error');
    setTimeout(() => nameEl.classList.remove('input-error'), 800);
    return;
  }
  addContingent(name, region);
}

function navigate(page, assessment, contingent) {
  state.page = page;
  if (assessment !== undefined) state.selectedAssessment = assessment;
  if (contingent !== undefined) state.selectedContingent = contingent;
  state.savedMsg = false;

  // Track which contingent is "active" for the live viewer
  if (page === 'checklist' && contingent) {
    state.activeContingentId = contingent;
    saveStorage(); // push immediately so viewer sees focus change
  } else if (page === 'dashboard') {
    state.activeContingentId = null;
    saveStorage();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  render();
}

// ── Export / Import ────────────────────────────────────────────────

function exportData() {
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    ...buildPayload(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'lks-robotik-2026-scores.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importData() {
  const input    = document.createElement('input');
  input.type     = 'file';
  input.accept   = '.json';
  input.onchange = e => {
    const file   = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        applyPayload(data);
        saveStorage();
        alert('Data berhasil diimpor!');
        render();
      } catch {
        alert('File tidak valid. Pastikan file JSON dari export sebelumnya.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function resetAllData() {
  if (!confirm('Hapus semua data penilaian DAN daftar kontingen? Tindakan ini tidak bisa dibatalkan.')) return;
  state.scores             = {};
  state.bonusC1            = [];
  state.bonusC2            = [];
  state.activeContingentId = null;
  CONTINGENTS              = [];
  saveStorage();
  render();
}

// ── HTML Builders ──────────────────────────────────────────────────

function h(tag, attrs, ...children) {
  // Minimal helper – mostly we build raw HTML strings for performance
  return `<${tag} ${attrs}>${children.join('')}</${tag}>`;
}

function progressBarHTML(pct) {
  return `
    <div class="prog-bar-wrap">
      <div class="prog-bar" style="width:${pct}%"></div>
    </div>
    <div class="prog-label">${pct}% selesai</div>`;
}

// ── Render: Dashboard ──────────────────────────────────────────────

function renderDashboard() {
  const { done, total } = totalGlobalProgress();
  const globalPct = total > 0 ? Math.round(done / total * 100) : 0;

  const metricCards = `
    <div class="grid-4">
      <div class="metric-card">
        <div class="metric-lbl">Total tercentang</div>
        <div class="metric-num">${done}<span>/${total}</span></div>
      </div>
      <div class="metric-card">
        <div class="metric-lbl">Kontingen</div>
        <div class="metric-num">${CONTINGENTS.length}<span> terdaftar</span></div>
      </div>
      <div class="metric-card">
        <div class="metric-lbl">Kategori</div>
        <div class="metric-num">${ASSESSMENTS.length}</div>
      </div>
      <div class="metric-card">
        <div class="metric-lbl">Progress total</div>
        <div class="metric-num accent">${globalPct}%</div>
      </div>
    </div>`;

  const configPanel = state.configOpen ? renderConfigPanel() : '';
  const exportPanel = state.exportOpen ? renderExportPanel() : '';

  const assessmentCards = ASSESSMENTS.map(a => {
    const progList = CONTINGENTS.map(c => getProgress(c.id, a.id));
    const done     = progList.reduce((s, p) => s + p.done,  0);
    const total    = progList.reduce((s, p) => s + p.total, 0);
    const pct      = total > 0 ? Math.round(done / total * 100) : 0;
    return `
      <div class="card" onclick="navigate('contingents','${a.id}')">
        <div class="card-icon"><i class="ti ${a.icon}" aria-hidden="true"></i></div>
        <div class="card-label">${a.label}</div>
        <div class="card-sub">${a.desc}</div>
        <div class="card-meta">
          <span class="chip chip-pct">${a.pct}% bobot</span>
          <span style="font-size:11px;color:var(--color-text-muted);">${done}/${total} item</span>
        </div>
        ${progressBarHTML(pct)}
      </div>`;
  }).join('');

  const contingentRows = CONTINGENTS.length === 0
    ? `<div class="empty-state">
        <i class="ti ti-users" aria-hidden="true"></i>
        <div>Belum ada kontingen. Tambahkan kontingen di bawah.</div>
      </div>`
    : CONTINGENTS.map(c => {
        const pct = overallProgress(c.id);
        return `
          <div class="contingent-card" onclick="navigate('contingents',null,'${c.id}')">
            <div class="contingent-avatar" style="background:${c.bg};color:${c.tc};">${c.short}</div>
            <div class="contingent-info">
              <div class="contingent-name">${c.name}</div>
              <div class="contingent-region">${c.region}</div>
            </div>
            <div class="contingent-right">
              <div class="contingent-pct">${pct}%</div>
              <div class="contingent-pct-sub">selesai</div>
            </div>
            <button class="btn-remove-contingent" title="Hapus kontingen"
              onclick="event.stopPropagation();removeContingent('${c.id}')">
              <i class="ti ti-trash" aria-hidden="true"></i>
            </button>
          </div>`;
      }).join('');

  const addForm = `
    <div class="add-contingent-form">
      <div class="add-contingent-title"><i class="ti ti-plus" aria-hidden="true"></i> Tambah Kontingen</div>
      <div class="add-contingent-row">
        <input id="input-cont-name"   class="text-input" type="text" placeholder="Nama kontingen (wajib), mis. Tim Jawa Tengah" maxlength="60" />
        <input id="input-cont-region" class="text-input" type="text" placeholder="Asal daerah (opsional)" maxlength="60" />
        <button class="btn btn-primary btn-sm" onclick="handleAddContingent()">
          <i class="ti ti-plus" aria-hidden="true"></i> Tambah
        </button>
      </div>
    </div>`;

  return `
    <div class="page">
      <div class="dash-header-row">
        <div>
          <div class="page-heading">Dashboard Penilaian</div>
          <div class="page-sub">LKS Robotik 2026 — Sistem Penilaian Mandiri</div>
        </div>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-sm" onclick="state.exportOpen=!state.exportOpen;state.configOpen=false;render()">
            <i class="ti ti-database-export" aria-hidden="true"></i> Export/Import
          </button>
          <button class="btn btn-ghost btn-sm" onclick="state.configOpen=!state.configOpen;state.exportOpen=false;render()">
            <i class="ti ti-settings" aria-hidden="true"></i> Konfigurasi
          </button>
        </div>
      </div>

      ${configPanel}
      ${exportPanel}
      ${metricCards}

      <div class="section-label">Pilih Kategori Penilaian</div>
      <div class="grid-2">${assessmentCards}</div>

      <div class="section-label">Kontingen (${CONTINGENTS.length})</div>
      <div class="contingent-list">${contingentRows}</div>
      ${addForm}
    </div>`;
}

function toggleBonus(arena, cubeId) {
  const key = 'bonus' + arena; // 'bonusC1' or 'bonusC2'
  const arr = state[key];
  const idx = arr.indexOf(cubeId);
  if (idx === -1) arr.push(cubeId);
  else arr.splice(idx, 1);
  triggerSavedMsg();
}
window.toggleBonus = toggleBonus;

function renderConfigPanel() {
  function bonusGrid(bonusArr, arena) {
    return CUBES.map(c => {
      const active = bonusArr.includes(c.id);
      const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color};margin-right:6px;flex-shrink:0;"></span>`;
      return `
        <button class="cube-btn ${active ? 'selected' : ''}"
                onclick="toggleBonus('${arena}','${c.id}')">
          ${dot}${c.label}
          ${active ? `<i class="ti ti-check" style="margin-left:auto;font-size:12px;"></i>` : `<i class="ti ti-plus" style="margin-left:auto;font-size:12px;opacity:0.4;"></i>`}
        </button>`;
    }).join('');
  }

  function bonusTags(bonusArr) {
    if (!bonusArr.length) return `<span style="font-size:12px;color:var(--color-text-muted);font-style:italic;">Belum ada cube bonus dipilih</span>`;
    return bonusArr.map(id => {
      const c = CUBES.find(x => x.id === id);
      if (!c) return '';
      return `<span class="bonus-tag">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${c.color};margin-right:5px;"></span>
        ${c.label}
        <button onclick="toggleBonus('${id.startsWith('c1') ? 'C1' : 'C2'}','${id}')" style="background:none;border:none;cursor:pointer;color:inherit;margin-left:4px;opacity:0.6;font-size:11px;" title="Hapus">✕</button>
      </span>`;
    }).join('');
  }

  return `
    <div class="config-panel">
      <div class="config-title"><i class="ti ti-settings" aria-hidden="true"></i> Konfigurasi Global C1 &amp; C2</div>
      <div class="config-desc">Pilih cube bonus untuk setiap arena — bisa lebih dari satu. Berlaku untuk semua kontingen.</div>

      <div class="config-sub"><i class="ti ti-star" aria-hidden="true"></i> Cube bonus C1
        <span class="bonus-count">${state.bonusC1.length} dipilih</span>
      </div>
      <div class="bonus-tags-row">${bonusTags(state.bonusC1)}</div>
      <div class="cube-grid">${bonusGrid(state.bonusC1, 'C1')}</div>

      <div class="config-sub" style="margin-top:16px;"><i class="ti ti-star" aria-hidden="true"></i> Cube bonus C2
        <span class="bonus-count">${state.bonusC2.length} dipilih</span>
      </div>
      <div class="bonus-tags-row">${bonusTags(state.bonusC2)}</div>
      <div class="cube-grid">${bonusGrid(state.bonusC2, 'C2')}</div>

      <div class="config-sub" style="margin-top:20px;color:var(--color-danger);">
        <i class="ti ti-lock" aria-hidden="true"></i> Ganti Password Admin
      </div>
      <div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:10px;">
        Password baru akan langsung berlaku untuk login berikutnya.
      </div>
      <div class="add-contingent-row" style="flex-wrap:wrap;gap:8px;">
        <input id="new-pw-input" class="text-input" type="password"
               placeholder="Password baru" maxlength="60" style="min-width:140px;" />
        <input id="confirm-pw-input" class="text-input" type="password"
               placeholder="Konfirmasi password" maxlength="60" style="min-width:140px;" />
        <button class="btn btn-ghost btn-sm" onclick="changeAdminPassword()">
          <i class="ti ti-check" aria-hidden="true"></i> Simpan Password
        </button>
      </div>
      <div id="pw-change-msg" class="pw-change-msg" style="display:none;"></div>

      <div class="config-sub" style="margin-top:20px;">
        <i class="ti ti-video" aria-hidden="true"></i> Live Stream
      </div>
      <div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:12px;">
        Pilih mode streaming untuk viewer. Mode Kamera menggunakan kamera perangkat ini langsung (WebRTC). Mode Link embed URL YouTube Live atau platform lain.
      </div>
      <div class="stream-mode-row">
        <button class="btn ${stream.mode === 'off' ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setStreamMode('off')">
          <i class="ti ti-video-off"></i> Nonaktif
        </button>
        <button class="btn ${stream.mode === 'camera' ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setStreamMode('camera')">
          <i class="ti ti-camera"></i> Kamera
        </button>
        <button class="btn ${stream.mode === 'link' ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setStreamMode('link')">
          <i class="ti ti-link"></i> Link URL
        </button>
      </div>
      <div id="stream-link-row" style="display:${stream.mode === 'link' ? 'flex' : 'none'};gap:8px;margin-top:10px;flex-wrap:wrap;">
        <input id="stream-url-input" class="text-input" type="url"
               placeholder="https://youtube.com/embed/..."
               value="${escapeHtml(stream.url)}"
               style="flex:1;min-width:200px;" />
        <button class="btn btn-ghost btn-sm" onclick="saveStreamUrl()">
          <i class="ti ti-check"></i> Simpan URL
        </button>
      </div>
      <div id="stream-camera-status" style="display:${stream.mode === 'camera' ? 'block' : 'none'};margin-top:10px;">
        <div id="stream-preview-wrap" style="position:relative;background:#000;border-radius:6px;overflow:hidden;max-width:320px;">
          <video id="stream-preview" autoplay muted playsinline
                 style="width:100%;max-height:180px;display:block;"></video>
          <div id="stream-preview-overlay" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;background:rgba(0,0,0,0.55);">
            <i class="ti ti-loader-2 spin" style="margin-right:6px;"></i> Memulai kamera...
          </div>
        </div>
        <div style="font-size:11px;color:var(--color-text-muted);margin-top:6px;" id="stream-peer-count">
          Viewer terhubung: 0
        </div>
      </div>
    </div>`;
}

function renderExportPanel() {
  return `
    <div class="export-area">
      <div class="export-title"><i class="ti ti-database" aria-hidden="true"></i> Kelola Data</div>
      <div class="export-desc">Export untuk backup atau berbagi data antar perangkat juri. Import akan menimpa data saat ini.</div>
      <div class="export-btns">
        <button class="btn btn-ghost btn-sm" onclick="exportData()">
          <i class="ti ti-download" aria-hidden="true"></i> Export JSON
        </button>
        <button class="btn btn-ghost btn-sm" onclick="importData()">
          <i class="ti ti-upload" aria-hidden="true"></i> Import JSON
        </button>
        <button class="btn btn-danger-ghost btn-sm" onclick="resetAllData()">
          <i class="ti ti-trash" aria-hidden="true"></i> Reset semua data
        </button>
      </div>
    </div>`;
}

// ── Render: Contingents ────────────────────────────────────────────

function renderContingents() {
  // Jika ada kontingen terpilih tapi tidak ada assessment → tampilkan semua assessment untuk kontingen itu
  if (state.selectedContingent && !state.selectedAssessment) {
    return renderContingentDetail();
  }

  const a = ASSESSMENTS.find(x => x.id === state.selectedAssessment);

  const rows = CONTINGENTS.map(c => {
    const p   = getProgress(c.id, a.id);
    const pct = p.total > 0 ? Math.round(p.done / p.total * 100) : 0;
    return `
      <div class="contingent-card" onclick="navigate('checklist','${a.id}','${c.id}')">
        <div class="contingent-avatar" style="background:${c.bg};color:${c.tc};">${c.short.slice(0, 2).toUpperCase()}</div>
        <div class="contingent-info">
          <div class="contingent-name">${c.name}</div>
          <div class="contingent-region">${c.region}</div>
          <div class="contingent-prog">${progressBarHTML(pct)}</div>
        </div>
        <div class="contingent-right">
          <div class="contingent-pct">${p.done}/${p.total}</div>
          <div class="contingent-pct-sub">tercentang</div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="page">
      <div class="breadcrumb">
        <span class="bc-link" onclick="navigate('dashboard')">Dashboard</span>
        <span class="bc-sep">›</span>
        <span class="bc-cur">${a.label}</span>
      </div>
      <div class="page-heading">${a.label}</div>
      <div class="page-sub">${a.desc} · Bobot ${a.pct}%</div>
      <div class="contingent-list">${rows}</div>
    </div>`;
}

function renderContingentDetail() {
  const c = CONTINGENTS.find(x => x.id === state.selectedContingent);

  const cards = ASSESSMENTS.map(a => {
    const p   = getProgress(c.id, a.id);
    const pct = p.total > 0 ? Math.round(p.done / p.total * 100) : 0;
    return `
      <div class="card" onclick="navigate('checklist','${a.id}','${c.id}')">
        <div class="card-icon"><i class="ti ${a.icon}" aria-hidden="true"></i></div>
        <div class="card-label">${a.label}</div>
        <div class="card-sub">${p.done}/${p.total} item · Bobot ${a.pct}%</div>
        ${progressBarHTML(pct)}
      </div>`;
  }).join('');

  return `
    <div class="page">
      <div class="breadcrumb">
        <span class="bc-link" onclick="navigate('dashboard')">Dashboard</span>
        <span class="bc-sep">›</span>
        <span class="bc-cur">${c.name}</span>
      </div>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
        <div class="contingent-avatar" style="background:${c.bg};color:${c.tc};width:48px;height:48px;font-size:15px;">${c.short.slice(0, 2).toUpperCase()}</div>
        <div>
          <div class="page-heading" style="margin-bottom:2px;">${c.name}</div>
          <div class="page-sub" style="margin-bottom:0;">${c.region} · Progress keseluruhan: ${overallProgress(c.id)}%</div>
        </div>
      </div>
      <div class="grid-2">${cards}</div>
    </div>`;
}

// ── Render: Checklist ──────────────────────────────────────────────

function renderChecklist() {
  const a     = ASSESSMENTS.find(x => x.id === state.selectedAssessment);
  const c     = CONTINGENTS.find(x => x.id === state.selectedContingent);
  const items = CHECKLIST_DATA[a.id] || [];
  const sc    = getScore(c.id, a.id);
  const done  = items.filter(it => sc[it.id]).length;
  const bonus = a.id === 'c1' ? state.bonusC1 : a.id === 'c2' ? state.bonusC2 : [];

  // Timer block (only for perakitan)
  const timerBlock = a.id === 'perakitan' ? `
    <div class="timer-block">
      <div class="timer-label"><i class="ti ti-clock" aria-hidden="true"></i> Timer perakitan</div>
      <div class="timer-display" id="timer-display">${fmtTime(state.timer.sec)}</div>
      <div id="timer-status" class="${state.timer.sec > 7200 ? 'timer-warn' : 'timer-ok'}">
        ${state.timer.sec > 7200
          ? '<i class="ti ti-alert-triangle"></i> Melebihi batas waktu 2 jam!'
          : 'Batas waktu: 02:00:00'}
      </div>
      <div class="timer-btns">
        ${!state.timer.running
          ? `<button class="btn btn-primary btn-sm" onclick="startTimer()"><i class="ti ti-player-play" aria-hidden="true"></i> Mulai</button>`
          : `<button class="btn btn-ghost btn-sm"   onclick="stopTimer()"><i class="ti ti-player-pause" aria-hidden="true"></i> Jeda</button>`}
        <button class="btn btn-ghost btn-sm" onclick="resetTimer()">
          <i class="ti ti-refresh" aria-hidden="true"></i> Reset
        </button>
      </div>
    </div>` : '';

  // Info banner jika C1/C2 belum ada bonus
  const infoBlock = (a.id === 'c1' || a.id === 'c2') && bonus.length === 0 ? `
    <div class="info-row">
      <i class="ti ti-info-circle info-icon" aria-hidden="true"></i>
      <span class="info-text">Belum ada cube bonus yang dipilih. Atur di <strong>Konfigurasi</strong> dari dashboard.</span>
    </div>` : '';

  // Checklist items — untuk C1/C2 dikelompokkan per kubus
  let checkItems = '';

  if (a.id === 'c1' || a.id === 'c2') {
    // Item pertama: keluar home
    const homeOut = items[0];
    const homeReturn = items[items.length - 1];

    function renderSingleItem(item) {
      const checked     = !!sc[item.id];
      const isBonus     = item.cubeId && bonus.includes(item.cubeId);
      const bonusCls    = isBonus ? ' bonus' : '';
      const checkboxCls = `checkbox ${checked ? 'checked' : ''} ${isBonus ? 'bonus-check' : ''}`;
      const colorDot    = item.cubeColor
        ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.cubeColor};margin-right:6px;vertical-align:middle;"></span>`
        : '';
      return `
        <div class="checklist-item${checked ? ' checked' : ''}${bonusCls}"
             onclick="setCheck('${c.id}','${a.id}','${item.id}',${!checked})">
          <div class="${checkboxCls}"></div>
          <div class="item-text">
            <div class="item-label">${colorDot}${item.label}</div>
            ${item.sub ? `<div class="item-sub">${item.sub}</div>` : ''}
            <div class="item-tags">
              ${isBonus ? `<span class="chip chip-warning"><i class="ti ti-star" aria-hidden="true"></i> Cube bonus – poin lebih tinggi</span>` : ''}
              ${checked  ? `<span class="chip chip-success"><i class="ti ti-check" aria-hidden="true"></i> Selesai</span>` : ''}
            </div>
          </div>
        </div>`;
    }

    // Home out
    checkItems += `<div class="cube-group-label"><i class="ti ti-home-move"></i> Navigasi Awal</div>`;
    checkItems += renderSingleItem(homeOut);

    // Kubus (4 item each, indeks 1..36)
    CUBES.forEach((cube, ci) => {
      const isBonus = bonus.includes(cube.id);
      const cubeItems = items.slice(1 + ci * 4, 1 + ci * 4 + 4);
      const cubeDone  = cubeItems.filter(it => sc[it.id]).length;
      checkItems += `
        <div class="cube-group-label ${isBonus ? 'bonus-group' : ''}">
          <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${cube.color};margin-right:7px;vertical-align:middle;"></span>
          ${cube.label}
          ${isBonus ? `<span class="chip chip-warning" style="margin-left:8px;font-size:10px;"><i class="ti ti-star"></i> Bonus</span>` : ''}
          <span class="cube-group-prog">${cubeDone}/4</span>
        </div>`;
      cubeItems.forEach(item => { checkItems += renderSingleItem(item); });
    });

    // Home return
    checkItems += `<div class="cube-group-label"><i class="ti ti-home-check"></i> Navigasi Akhir</div>`;
    checkItems += renderSingleItem(homeReturn);

  } else {
    // Perakitan & Gerakan — render biasa
    checkItems = items.map(item => {
      const checked     = !!sc[item.id];
      const checkboxCls = `checkbox ${checked ? 'checked' : ''}`;
      const colorDot    = item.cubeColor
        ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.cubeColor};margin-right:6px;vertical-align:middle;"></span>`
        : '';
      return `
        <div class="checklist-item${checked ? ' checked' : ''}"
             onclick="setCheck('${c.id}','${a.id}','${item.id}',${!checked})">
          <div class="${checkboxCls}"></div>
          <div class="item-text">
            <div class="item-label">${colorDot}${item.label}</div>
            ${item.sub ? `<div class="item-sub">${item.sub}</div>` : ''}
            <div class="item-tags">
              ${checked ? `<span class="chip chip-success"><i class="ti ti-check" aria-hidden="true"></i> Selesai</span>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // Summary bar
  const bonusItems  = bonus.map(id => CUBES.find(x => x.id === id)).filter(Boolean);
  const summaryBar  = `
    <div class="summary-bar">
      <div class="summary-stat">
        <div class="summary-num">${done}</div>
        <div class="summary-lbl">tercentang</div>
      </div>
      <div class="summary-divider"></div>
      <div class="summary-stat">
        <div class="summary-num">${items.length - done}</div>
        <div class="summary-lbl">belum</div>
      </div>
      <div class="summary-divider"></div>
      <div class="summary-stat">
        <div class="summary-num">${items.length > 0 ? Math.round(done / items.length * 100) : 0}%</div>
        <div class="summary-lbl">selesai</div>
      </div>
      ${bonusItems.length ? `
        <div class="summary-divider"></div>
        <div class="summary-bonus">
          <div class="summary-bonus-label"><i class="ti ti-star" aria-hidden="true"></i> Cube bonus (${bonusItems.length})</div>
          <div class="summary-bonus-val">${bonusItems.map(b => `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${b.color};margin-right:3px;"></span>${b.label}`).join('<br>')}</div>
        </div>` : ''}
    </div>`;

  // Save row
  const saveRow = `
    <div class="save-row">
      <button class="btn btn-primary" onclick="triggerSavedMsg()">
        <i class="ti ti-device-floppy" aria-hidden="true"></i> Simpan
      </button>
      ${state.savedMsg
        ? `<span class="save-status"><i class="ti ti-check"></i> Tersimpan</span>`
        : ''}
      <button class="btn btn-ghost ml-auto" onclick="navigate('contingents','${a.id}')">
        <i class="ti ti-arrow-left" aria-hidden="true"></i> Kembali
      </button>
    </div>`;

  return `
    <div class="page">
      <div class="breadcrumb">
        <span class="bc-link" onclick="navigate('dashboard')">Dashboard</span>
        <span class="bc-sep">›</span>
        <span class="bc-link" onclick="navigate('contingents','${a.id}')">${a.label}</span>
        <span class="bc-sep">›</span>
        <span class="bc-cur">${c.name}</span>
      </div>

      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <div class="contingent-avatar" style="background:${c.bg};color:${c.tc};">${c.short.slice(0, 2).toUpperCase()}</div>
        <div>
          <div class="page-heading" style="font-size:16px;margin-bottom:2px;">${c.name}</div>
          <div style="font-size:12px;color:var(--color-text-secondary);">${a.label} · Bobot ${a.pct}%</div>
        </div>
      </div>

      ${summaryBar}
      ${timerBlock}
      ${infoBlock}

      <div class="checklist-list">${checkItems}</div>
      ${saveRow}
    </div>`;
}

// ── Render: Header ─────────────────────────────────────────────────

function renderHeader() {
  const headerRight = document.getElementById('header-right');
  if (!headerRight) return;

  if (state.page === 'dashboard') {
    headerRight.innerHTML = `<span class="header-sub">Sistem Penilaian Mandiri</span>`;
  } else {
    headerRight.innerHTML = `
      <span class="header-back" onclick="navigate('dashboard')">
        <i class="ti ti-arrow-left" aria-hidden="true"></i> Dashboard
      </span>`;
  }
}

// ── Main Render ────────────────────────────────────────────────────

function render() {
  const main = document.getElementById('main-content');
  if (!main) return;

  renderHeader();

  if (state.page === 'dashboard') {
    main.innerHTML = renderDashboard();
    // Allow Enter to submit add-contingent form
    const nameInput = document.getElementById('input-cont-name');
    if (nameInput) {
      nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleAddContingent(); });
    }
    const regionInput = document.getElementById('input-cont-region');
    if (regionInput) {
      regionInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleAddContingent(); });
    }
  } else if (state.page === 'contingents') {
    main.innerHTML = renderContingents();
  } else if (state.page === 'checklist') {
    main.innerHTML = renderChecklist();
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const main = document.getElementById('main-content');
  if (main) main.innerHTML = '<div class="loading-state"><i class="ti ti-loader-2 spin"></i><span>Memuat data...</span></div>';

  // Show login overlay
  showLoginOverlay();
});

// ── Login ──────────────────────────────────────────────────────────

function showLoginOverlay() {
  let overlay = document.getElementById('login-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'login-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="login-box">
      <div class="login-badge">LKS 2026</div>
      <div class="login-title">Admin Login</div>
      <div class="login-sub">Masukkan password untuk mengakses panel admin</div>
      <input id="login-pw-input" class="login-input" type="password"
             placeholder="Password admin" autocomplete="current-password" />
      <div id="login-error" class="login-error" style="display:none;">
        <i class="ti ti-alert-circle"></i> Password salah. Coba lagi.
      </div>
      <button class="login-btn" onclick="handleLogin()">
        <i class="ti ti-lock-open"></i> Masuk
      </button>
      <div class="login-hint">Lupa password? Hubungi pengelola sistem.</div>
    </div>`;
  overlay.style.display = 'flex';

  // Allow Enter
  setTimeout(() => {
    const inp = document.getElementById('login-pw-input');
    if (inp) {
      inp.focus();
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
    }
  }, 50);
}

// ── Stream Logic (Admin/Broadcaster) ──────────────────────────────

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

async function setStreamMode(mode) {
  // Stop previous camera if switching away
  if (stream.mode === 'camera' && mode !== 'camera') {
    stopCameraStream();
  }
  stream.mode = mode;
  await setStreamConfig({ mode, url: stream.url });
  render();

  if (mode === 'camera') {
    // Start camera after render (so DOM elements exist)
    setTimeout(() => startCameraStream(), 100);
  }
}
window.setStreamMode = setStreamMode;

async function saveStreamUrl() {
  const inp = document.getElementById('stream-url-input');
  if (!inp) return;
  stream.url = inp.value.trim();
  await setStreamConfig({ mode: 'link', url: stream.url });
  // Flash feedback
  inp.style.borderColor = 'var(--color-success)';
  setTimeout(() => { inp.style.borderColor = ''; }, 1200);
}
window.saveStreamUrl = saveStreamUrl;

async function startCameraStream() {
  try {
    const ms = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    stream.localStream = ms;
    const vid = document.getElementById('stream-preview');
    const overlay = document.getElementById('stream-preview-overlay');
    if (vid) { vid.srcObject = ms; }
    if (overlay) overlay.style.display = 'none';

    // Bersihkan signaling lama
    await clearSignaling();

    // Dengar request dari viewer — tiap viewer baru langsung buatkan peer connection
    if (stream.unsubRequests) stream.unsubRequests();
    stream.unsubRequests = subscribeRequests(async (requests) => {
      for (const viewerId of Object.keys(requests || {})) {
        if (stream.peers[viewerId]) continue; // sudah ada peer untuk viewer ini
        await createPeerForViewer(viewerId);
      }
      const count = Object.keys(requests || {}).length;
      const el = document.getElementById('stream-peer-count');
      if (el) el.textContent = `Viewer terhubung: ${count}`;
    });

  } catch (e) {
    const overlay = document.getElementById('stream-preview-overlay');
    if (overlay) overlay.innerHTML = `<i class="ti ti-alert-circle" style="margin-right:6px;color:#f87171;"></i> Kamera tidak bisa diakses`;
    console.error('[Stream] getUserMedia error:', e);
  }
}

async function createPeerForViewer(viewerId) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  stream.peers[viewerId] = pc;

  // Tambahkan tracks lokal ke PC ini
  if (stream.localStream) {
    stream.localStream.getTracks().forEach(t => pc.addTrack(t, stream.localStream));
  }

  // Kirim ICE candidates ke viewer ini
  pc.onicecandidate = async (e) => {
    if (e.candidate) {
      await pushIceCandidate('admin', viewerId, JSON.stringify(e.candidate));
    }
  };

  // Buat offer dan kirim ke viewer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await writeOfferForViewer(viewerId, offer.sdp);

  // Tunggu answer dari viewer ini
  subscribeAnswer(viewerId, async (answerData) => {
    if (!answerData || !answerData.sdp) return;
    if (pc.signalingState === 'have-local-offer') {
      try {
        await pc.setRemoteDescription({ type: 'answer', sdp: answerData.sdp });
      } catch(e) { console.warn('[Stream] setRemoteDescription failed:', e); }
    }
  });

  // Terima ICE candidates dari viewer
  const seenIce = new Set();
  subscribeIceCandidates('admin', viewerId, async (candidates) => {
    for (const c of candidates) {
      const key = c.candidate;
      if (seenIce.has(key)) continue;
      seenIce.add(key);
      try { await pc.addIceCandidate(JSON.parse(c.candidate)); } catch(_) {}
    }
  });
}

function stopCameraStream() {
  if (stream.localStream) {
    stream.localStream.getTracks().forEach(t => t.stop());
    stream.localStream = null;
  }
  Object.values(stream.peers).forEach(pc => pc.close());
  stream.peers = {};
  if (stream.unsubRequests) { stream.unsubRequests(); stream.unsubRequests = null; }
  clearSignaling().catch(() => {});
}

async function handleLogin() {
  const inp = document.getElementById('login-pw-input');
  if (!inp) return;
  const entered = inp.value.trim();
  if (!entered) {
    inp.classList.add('input-error');
    setTimeout(() => inp.classList.remove('input-error'), 600);
    return;
  }

  // Show loading on button
  const btn = document.querySelector('.login-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Memeriksa...'; }

  let storedPw;
  try {
    storedPw = await getAdminPassword();
  } catch(e) {
    storedPw = null;
  }

  // If no password is set yet, accept anything and set it as the password
  if (storedPw === null) {
    await setAdminPassword(entered);
    storedPw = entered;
  }

  if (entered !== storedPw) {
    const errEl = document.getElementById('login-error');
    if (errEl) errEl.style.display = 'flex';
    inp.value = '';
    inp.classList.add('input-error');
    setTimeout(() => inp.classList.remove('input-error'), 600);
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-lock-open"></i> Masuk'; }
    inp.focus();
    return;
  }

  // Success
  auth.loggedIn = true;
  const overlay = document.getElementById('login-overlay');
  if (overlay) overlay.style.display = 'none';

  const main = document.getElementById('main-content');
  if (main) main.innerHTML = '<div class="loading-state"><i class="ti ti-loader-2 spin"></i><span>Memuat data...</span></div>';

  await loadStorage();
  render();

  // Start chat subscription
  initChat();

  // Restore stream config from Firebase
  if (stream.unsubConfig) stream.unsubConfig();
  stream.unsubConfig = subscribeStreamConfig(cfg => {
    if (!cfg) return;
    stream.mode = cfg.mode || 'off';
    stream.url  = cfg.url  || '';
    // If camera was already active and we re-render, no need to restart
  });
}
window.handleLogin = handleLogin;

// ── Chat ───────────────────────────────────────────────────────────

function initChat() {
  if (chat.unsubscribe) chat.unsubscribe();
  chat.unsubscribe = subscribeChat(msgs => {
    chat.messages = msgs;
    renderChatMessages();
    // Update unread badge
    const badge = document.getElementById('chat-fab-badge');
    if (badge && !chat.open) {
      badge.style.display = msgs.length > 0 ? 'flex' : 'none';
    }
  });
  renderChatFAB();
}

function renderChatFAB() {
  let fab = document.getElementById('chat-fab');
  if (fab) return; // already exists
  fab = document.createElement('div');
  fab.id = 'chat-fab';
  fab.innerHTML = `
    <button class="chat-fab-btn" onclick="toggleChat()" title="Chat">
      <i class="ti ti-message-circle"></i>
      <span id="chat-fab-badge" class="chat-fab-badge" style="display:none;"></span>
    </button>`;
  document.body.appendChild(fab);

  // Chat panel
  const panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.innerHTML = `
    <div class="chat-panel-inner">
      <div class="chat-header">
        <i class="ti ti-message-circle" style="color:var(--color-accent);"></i>
        <span class="chat-header-title">Chat Realtime</span>
        <span style="font-size:11px;color:var(--color-text-muted);margin-left:4px;">· masuk sebagai Admin</span>
        <button class="chat-close-btn" onclick="toggleChat()"><i class="ti ti-x"></i></button>
      </div>
      <div class="chat-messages" id="chat-messages"></div>
      <div class="chat-input-row">
        <input id="chat-input" class="chat-input" type="text"
               placeholder="Tulis pesan..." maxlength="300"
               onkeydown="if(event.key==='Enter')sendChat()" />
        <button class="chat-send-btn" onclick="sendChat()">
          <i class="ti ti-send"></i>
        </button>
      </div>
    </div>`;
  document.body.appendChild(panel);
}

function toggleChat() {
  chat.open = !chat.open;
  const panel = document.getElementById('chat-panel');
  if (panel) panel.classList.toggle('open', chat.open);
  const badge = document.getElementById('chat-fab-badge');
  if (badge && chat.open) badge.style.display = 'none';
  if (chat.open) {
    renderChatMessages();
    setTimeout(() => {
      const inp = document.getElementById('chat-input');
      if (inp) inp.focus();
    }, 100);
  }
}
window.toggleChat = toggleChat;

function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  if (chat.messages.length === 0) {
    container.innerHTML = `<div class="chat-empty"><i class="ti ti-message-off"></i><br>Belum ada pesan</div>`;
    return;
  }
  container.innerHTML = chat.messages.map(msg => {
    const isAdmin = msg.isAdmin;
    const time = new Date(msg.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="chat-msg ${isAdmin ? 'chat-msg-admin' : 'chat-msg-user'}">
        <div class="chat-msg-sender ${isAdmin ? 'sender-admin' : ''}">
          ${isAdmin ? '<i class="ti ti-shield-check" style="font-size:10px;"></i> ' : ''}${escapeHtml(msg.sender)}
          <span class="chat-msg-time">${time}</span>
        </div>
        <div class="chat-msg-text">${escapeHtml(msg.text)}</div>
      </div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

async function sendChat() {
  const inp = document.getElementById('chat-input');
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  try {
    await sendChatMessage('Admin', text, true);
  } catch(e) {
    console.error('Chat send failed:', e);
    inp.value = text; // restore
  }
}
window.sendChat = sendChat;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Change Password (inside config panel) ─────────────────────────

async function changeAdminPassword() {
  const newPw = document.getElementById('new-pw-input');
  const confirmPw = document.getElementById('confirm-pw-input');
  const msg = document.getElementById('pw-change-msg');
  if (!newPw || !confirmPw) return;

  if (!newPw.value.trim()) {
    showPwMsg('Password baru tidak boleh kosong.', 'error');
    return;
  }
  if (newPw.value !== confirmPw.value) {
    showPwMsg('Password tidak cocok. Periksa kembali.', 'error');
    return;
  }
  try {
    await setAdminPassword(newPw.value.trim());
    newPw.value = '';
    confirmPw.value = '';
    showPwMsg('Password berhasil diubah!', 'success');
  } catch(e) {
    showPwMsg('Gagal menyimpan password. Cek koneksi.', 'error');
  }
}
window.changeAdminPassword = changeAdminPassword;

function showPwMsg(text, type) {
  const el = document.getElementById('pw-change-msg');
  if (!el) return;
  el.textContent = text;
  el.className = 'pw-change-msg pw-change-' + type;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// Expose globals needed by inline onclick handlers
window.navigate             = navigate;
window.state                = state;
window.setCheck             = setCheck;
window.triggerSavedMsg      = triggerSavedMsg;
window.startTimer           = startTimer;
window.stopTimer            = stopTimer;
window.resetTimer           = resetTimer;
window.exportData           = exportData;
window.importData           = importData;
window.resetAllData         = resetAllData;
window.render               = render;
window.handleAddContingent  = handleAddContingent;
window.removeContingent     = removeContingent;
