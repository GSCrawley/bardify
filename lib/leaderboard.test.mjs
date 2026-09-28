// node lib/leaderboard.test.mjs
import { loadBoard, notchScore, removeEntry, clearBoard, rankEntries, toCSV } from "./leaderboard.js";

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log("PASS:", name); }
  else { failed++; console.log("FAIL:", name); }
}

// fresh in-memory store per test run
function memStore() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
  };
}
const store = memStore();

// --- recording ---
const a = notchScore({ name: "Rosalind", score: 85, kept: 3, total: 3, eraId: "genz", eraName: "Gen Z", work: "As You Like It", ref: "3.2.1", sealed: true, ts: 1000 }, store);
const b = notchScore({ name: "Feste", score: 92, kept: 4, total: 5, eraId: "boomer", eraName: "Boomer", work: "Twelfth Night", ref: "2.4.11", sealed: true, ts: 2000 }, store);
const c = notchScore({ name: "Malvolio", score: 85, kept: 3, total: 3, eraId: "genalpha", eraName: "Gen Alpha", work: "Twelfth Night", ref: "2.5.99", sealed: false, ts: 3000 }, store);
check("entries recorded with ids", !!a.id && !!b.id && !!c.id);

// --- ranking: score desc, then anchors, then sealed beats unsealed at equal score ---
const board = loadBoard(store);
check("highest score first", board[0].name === "Feste");
check("sealed attempt outranks unsealed at equal score", board[1].name === "Rosalind" && board[2].name === "Malvolio");

check("rankEntries does not mutate input", (() => { const src = [{ score: 1 }, { score: 2 }]; rankEntries(src); return src[0].score === 1; })());

// --- sanitization ---
const messy = notchScore({ name: "  " + "X".repeat(60) + "  ", score: 1e9, kept: -5, total: 9999 }, store);
check("name trimmed + capped at 24 chars", messy.name.length <= 24 && messy.name.length > 0);
check("score clamped to 100", messy.score === 100);
check("negative anchors clamped to 0", messy.kept === 0);
const blank = notchScore({ name: "" }, store);
check("blank name defaults to A Player", blank.name === "A Player");
check("missing sealed flag defaults to sealed", blank.sealed === true);

// --- corrupt storage resilience ---
const bad = memStore();
bad.setItem("bardify-leaderboard-v1", "{not json");
check("corrupt storage loads as empty board", loadBoard(bad).length === 0);

// --- removal and clearing ---
removeEntry(a.id, store);
check("removeEntry drops the notch", loadBoard(store).every((e) => e.name !== "Rosalind"));

// --- CSV export ---
const csv = toCSV(loadBoard(store));
check("CSV has header + one row per entry", csv.split("\n").length === loadBoard(store).length + 2); // header + rows + trailing \n
check("CSV marks seal status", csv.includes('"sealed"') && csv.includes('"unsealed"'));
check("CSV escapes quotes", (() => {
  const s2 = memStore();
  notchScore({ name: 'Sir "Quote-a-lot"', score: 50, sealed: true, ts: 1 }, s2);
  return toCSV(loadBoard(s2)).includes('"Sir ""Quote-a-lot"""');
})());

clearBoard(store);
check("clearBoard empties the board", loadBoard(store).length === 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
