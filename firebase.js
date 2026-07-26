/* ============================================
   LKS Robotik 2026 – Firebase Config & Helpers
   ============================================ */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getDatabase,
  ref,
  set,
  get,
  push,
  onValue,
  off,
  query,
  limitToLast,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const firebaseConfig = {
  apiKey:            "AIzaSyCmhN_SmvNMlVtZ8v6WpgUqqMTWkdJn7ys",
  authDomain:        "penilaian-lks.firebaseapp.com",
  projectId:         "penilaian-lks",
  storageBucket:     "penilaian-lks.firebasestorage.app",
  messagingSenderId: "478936779915",
  appId:             "1:478936779915:web:597dba9c4d6edf4f27188e",
  measurementId:     "G-XRNL3BJ247",
  databaseURL:       "https://penilaian-lks-default-rtdb.asia-southeast1.firebasedatabase.app",
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// ── Write helpers ──────────────────────────────────────────────────

/** Overwrite the entire state snapshot to Firebase */
export async function pushStateToFirebase(payload) {
  await set(ref(db, 'lks2026'), payload);
}

// ── Read / Subscribe helpers ───────────────────────────────────────

/** One-time read of the full state */
export async function pullStateFromFirebase() {
  try {
    const snap = await get(ref(db, 'lks2026'));
    return snap.exists() ? snap.val() : null;
  } catch(e) {
    console.error('[Firebase] pullState error:', e.code, e.message);
    throw e;
  }
}

/**
 * Subscribe to real-time updates.
 * @param {function} callback  called with the value whenever it changes
 * @returns {function} unsubscribe — call this to stop listening
 */
export function subscribeState(callback) {
  const r = ref(db, 'lks2026');
  onValue(r, snap => callback(snap.exists() ? snap.val() : null));
  return () => off(r);
}

// ── Password helpers ───────────────────────────────────────────────

/** Simpan password admin ke Firebase (plain text, bukan production auth) */
export async function setAdminPassword(password) {
  await set(ref(db, 'lks2026_meta/adminPassword'), password);
}

/** Ambil password admin dari Firebase */
export async function getAdminPassword() {
  try {
    const snap = await get(ref(db, 'lks2026_meta/adminPassword'));
    return snap.exists() ? snap.val() : null;
  } catch(e) {
    console.error('[Firebase] getAdminPassword error:', e);
    return null;
  }
}

// ── Chat helpers ───────────────────────────────────────────────────

/**
 * Kirim pesan chat ke Firebase
 * @param {string} sender  nama pengirim
 * @param {string} text    isi pesan
 * @param {boolean} isAdmin apakah pengirim admin
 */
export async function sendChatMessage(sender, text, isAdmin = false) {
  const messagesRef = ref(db, 'lks2026_chat');
  await push(messagesRef, {
    sender,
    text:      text.trim(),
    isAdmin,
    timestamp: Date.now(),
  });
}

/**
 * Subscribe to realtime chat (last 100 messages)
 * @param {function} callback  dipanggil dengan array pesan terbaru
 * @returns {function} unsubscribe
 */
export function subscribeChat(callback) {
  const q = query(ref(db, 'lks2026_chat'), limitToLast(100));
  onValue(q, snap => {
    if (!snap.exists()) { callback([]); return; }
    const msgs = [];
    snap.forEach(child => {
      msgs.push({ key: child.key, ...child.val() });
    });
    callback(msgs);
  });
  return () => off(ref(db, 'lks2026_chat'));
}

// ── Stream helpers ─────────────────────────────────────────────────

/**
 * Set stream config: mode ('camera'|'link'|'off') and optional url
 */
export async function setStreamConfig(config) {
  await set(ref(db, 'lks2026_stream/config'), config);
}

/** Get stream config once */
export async function getStreamConfig() {
  const snap = await get(ref(db, 'lks2026_stream/config'));
  return snap.exists() ? snap.val() : null;
}

/** Subscribe to stream config changes */
export function subscribeStreamConfig(callback) {
  const r = ref(db, 'lks2026_stream/config');
  onValue(r, snap => callback(snap.exists() ? snap.val() : null));
  return () => off(r);
}

/**
 * Alur signaling yang benar (per-viewer):
 * 1. Viewer tulis request ke lks2026_stream/signal/requests/{viewerId}
 * 2. Admin dengar requests → buat PC → createOffer → tulis ke lks2026_stream/signal/offers/{viewerId}
 * 3. Viewer baca offer miliknya → createAnswer → tulis ke lks2026_stream/signal/answers/{viewerId}
 * 4. Admin baca answer → setRemoteDescription
 * 5. Kedua sisi saling kirim ICE candidates
 */

/** Viewer: daftarkan diri untuk minta offer dari admin */
export async function requestOffer(viewerId) {
  await set(ref(db, `lks2026_stream/signal/requests/${viewerId}`), { ts: Date.now() });
}

/** Admin: tulis offer untuk viewer tertentu */
export async function writeOfferForViewer(viewerId, sdp) {
  await set(ref(db, `lks2026_stream/signal/offers/${viewerId}`), { sdp, ts: Date.now() });
}

/** Viewer: tulis answer untuk admin */
export async function writeAnswer(viewerId, sdp) {
  await set(ref(db, `lks2026_stream/signal/answers/${viewerId}`), { sdp, ts: Date.now() });
}

/** Admin: dengar requests masuk dari viewer */
export function subscribeRequests(callback) {
  const r = ref(db, 'lks2026_stream/signal/requests');
  onValue(r, snap => callback(snap.exists() ? snap.val() : {}));
  return () => off(r);
}

/** Viewer: dengar offer dari admin untuk dirinya */
export function subscribeMyOffer(viewerId, callback) {
  const r = ref(db, `lks2026_stream/signal/offers/${viewerId}`);
  onValue(r, snap => callback(snap.exists() ? snap.val() : null));
  return () => off(r);
}

/** Admin: dengar answer dari viewer tertentu */
export function subscribeAnswer(viewerId, callback) {
  const r = ref(db, `lks2026_stream/signal/answers/${viewerId}`);
  onValue(r, snap => callback(snap.exists() ? snap.val() : null));
  return () => off(r);
}

/** Push ICE candidate */
export async function pushIceCandidate(role, viewerId, candidate) {
  const path = role === 'admin'
    ? `lks2026_stream/signal/ice/toViewer/${viewerId}`
    : `lks2026_stream/signal/ice/toAdmin/${viewerId}`;
  await push(ref(db, path), { candidate, ts: Date.now() });
}

/** Subscribe ICE candidates */
export function subscribeIceCandidates(role, viewerId, callback) {
  const path = role === 'viewer'
    ? `lks2026_stream/signal/ice/toViewer/${viewerId}`
    : `lks2026_stream/signal/ice/toAdmin/${viewerId}`;
  const r = ref(db, path);
  onValue(r, snap => callback(snap.exists() ? Object.values(snap.val()) : []));
  return () => off(r);
}

/** Bersihkan semua signaling data (dipanggil saat stream berhenti) */
export async function clearSignaling() {
  await set(ref(db, 'lks2026_stream/signal'), null);
}

export { db };
