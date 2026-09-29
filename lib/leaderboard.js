// lib/leaderboard.js — offline class leaderboard for Era Speak challenges.
// Storage-agnostic: pass a Web Storage-like object ({getItem,setItem}) or omit
// to use localStorage in the browser and an in-memory store elsewhere (tests/node).

const KEY = "bardify-leaderboard-v1";

// shared in-memory fallback so repeated calls in node see the same board
let MEM = {};
function defaultStore() {
  // Reading `localStorage` itself throws in sandboxed iframes (no allow-same-origin),
  // so guard the property access, not just the value.
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch { /* sandboxed frame — fall through to session memory */ }
  if (!MEM.__board) {
    MEM.__board = {
      getItem: (k) => (k in MEM ? MEM[k] : null),
      setItem: (k, v) => { MEM[k] = String(v); },
      removeItem: (k) => { delete MEM[k]; },
    };
  }
  return MEM.__board;
}

/** Load all entries, ranked. */
export function loadBoard(store = defaultStore()) {
  try {
    const raw = store.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return rankEntries(Array.isArray(list) ? list : []);
  } catch {
    return [];
  }
}

/**
 * Notch a scored attempt onto the board.
 * entry: { name, score, kept, total, eraId, eraName, work, ref, sealed, ts }
 * `sealed` is false when the student peeked at Bardify's render first —
 * unsealed attempts are recorded but flagged, never eligible to tiebreak upward.
 */
export function notchScore(entry, store = defaultStore()) {
  const list = readRaw(store);
  const clean = {
    id: "n" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    name: String(entry.name || "A Player").trim().slice(0, 24) || "A Player",
    score: clampInt(entry.score, 0, 100),
    kept: clampInt(entry.kept, 0, 999),
    total: clampInt(entry.total, 0, 999),
    eraId: String(entry.eraId || ""),
    eraName: String(entry.eraName || ""),
    work: String(entry.work || ""),
    ref: String(entry.ref || ""),
    sealed: entry.sealed !== false,
    ts: Number(entry.ts) || Date.now(),
  };
  list.push(clean);
  store.setItem(KEY, JSON.stringify(list));
  return clean;
}

export function removeEntry(id, store = defaultStore()) {
  store.setItem(KEY, JSON.stringify(readRaw(store).filter((e) => e.id !== id)));
}

/** Teacher control: clear the board for a new class period. */
export function clearBoard(store = defaultStore()) {
  store.setItem(KEY, JSON.stringify([]));
}

/** Rank: score desc, then anchors kept desc, then sealed before unsealed, then earliest first. */
export function rankEntries(entries) {
  return [...entries].sort((a, b) =>
    b.score - a.score ||
    b.kept - a.kept ||
    (b.sealed ? 1 : 0) - (a.sealed ? 1 : 0) ||
    a.ts - b.ts
  );
}

/** CSV export for grade books / LMS import. */
export function toCSV(entries) {
  const esc = (s) => {
    const value = String(s);
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const rows = [
    ["rank", "name", "score", "anchors_kept", "anchors_total", "era", "work", "line", "sealed", "timestamp"],
  ];
  rankEntries(entries).forEach((e, i) => {
    rows.push([i + 1, e.name, e.score, e.kept, e.total, e.eraName, e.work, e.ref, e.sealed ? "sealed" : "unsealed", new Date(e.ts).toISOString()]);
  });
  return rows.map((r) => r.map(esc).join(",")).join("\n") + "\n";
}

function readRaw(store) {
  try {
    const raw = store.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function clampInt(n, lo, hi) {
  n = Math.round(Number(n) || 0);
  return Math.max(lo, Math.min(hi, n));
}
