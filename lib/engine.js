// Bardify translation engine (ES module)
import * as D from "./data.js";

// ============================================================
// BARDIFY — translation engine (two directions + insults)
// ============================================================
/* global PHRASES_M2S, WORDS_M2S, THOU_AUX, THOU_VERBS, ETH_VERBS,
 CONTRACTIONS_M2S, FLOURISH, INSULT_QUOTES, INSULT_KIT, QUOTES,
 GLOSS_S2M, PHRASES_S2M, FAMOUS_LINES */


// -------- helpers --------
function matchCase(src, out) {
  if (!src) return out;
  const m = src.match(/[a-zA-Z]/);
  if (!m) return out;
  const letters = src.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 1 && letters === letters.toUpperCase()) return out.toUpperCase();
  if (/[A-Z]/.test(m[0])) return out.replace(/[a-zA-Z]/, ch => ch.toUpperCase());
  return out;
}
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// seeded pseudo-random so a given input always translates the same way
function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return function () {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}
function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

function replacePhrases(text, pairs) {
  for (const [from, to] of pairs) {
    const re = new RegExp("\\b" + esc(from).replace(/ /g, "\\s+") + "\\b", "gi");
    text = text.replace(re, (m) => matchCase(m, to));
  }
  return text;
}

const SENT_SPLIT = /([^.!?]+[.!?]+["']?|[^.!?]+$)/g;
const OBJ_CONTEXT = /\b(to|for|with|at|of|from|on|upon|by|see|saw|tell|told|love|loves|loved|thank|give|gave|need|want|hear|heard|beg|ask|asked|beseech|kill|help|miss|missed|hate|hated|know|knew|meet|met|find|found|bring|brought|show|showed|call|called|warn|warned|pay|paid|trust|join|serve|follow|save|between|against|before|behind|without|unto|near|beside|toward|towards|like|prithee)$/i;

// -------- Modern -> Shakespearean --------
export function toShakespeare(input, opts) {
  opts = opts || {};
  const level = opts.flourish === undefined ? 1 : opts.flourish; // 0 subtle, 1 standard, 2 full ham
  if (!input || !input.trim()) return { text: "", notes: [] };
  const rnd = seedFrom(input + "|" + level);
  let text = input;

  // 1. multi-word phrases & contractions
  text = replacePhrases(text, D.PHRASES_M2S);
  text = replacePhrases(text, D.CONTRACTIONS_M2S.filter(p => p[0].includes(" ") || p[0].includes("'")));

  // 2. tokenize
  let tokens = text.split(/(\s+|[.,;:!?"()—–]|'(?![a-z]))/i).filter(t => t !== undefined && t !== "");

  // helper: find previous/next word token
  function prevWord(i) { for (let j = i - 1; j >= 0; j--) { if (/[a-z']/i.test(tokens[j])) return { w: tokens[j], j }; if (/[.!?;]/.test(tokens[j])) break; } return null; }

  // 3. pronouns: you -> thou/thee, your -> thy/thine
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i], low = t.toLowerCase();
    if (low === "you") {
      const p = prevWord(i);
      const objective = p && OBJ_CONTEXT.test(p.w);
      tokens[i] = matchCase(t, objective ? "thee" : "thou");
    } else if (low === "your") {
      // thine before vowel sound
      let nextW = null;
      for (let j = i + 1; j < tokens.length; j++) { if (/[a-z]/i.test(tokens[j])) { nextW = tokens[j]; break; } }
      tokens[i] = matchCase(t, nextW && /^[aeiou]/i.test(nextW) ? "thine" : "thy");
    } else if (low === "yours") tokens[i] = matchCase(t, "thine");
    else if (low === "yourself" || low === "yourselves") tokens[i] = matchCase(t, "thyself");
    else if (low === "my") {
      let nextW = null;
      for (let j = i + 1; j < tokens.length; j++) { if (/[a-z]/i.test(tokens[j])) { nextW = tokens[j]; break; } }
      if (nextW && /^[aeiou]/i.test(nextW)) tokens[i] = matchCase(t, "mine");
    }
  }

  // 4. verb agreement after thou; -eth after he/she/it/name
  const SKIP_ADV = /^(not|never|ne'er|ever|e'er|oft|always|evermore|verily|most|still|now|then|surely|truly)$/i;
  for (let i = 0; i < tokens.length; i++) {
    const low = tokens[i].toLowerCase();
    if (low !== "thou") continue;
    // question inversion: "did thou" -> "didst thou" (aux BEFORE thou)
    const p = prevWord(i);
    if (p && D.THOU_AUX[p.w.toLowerCase()]) {
      tokens[p.j] = matchCase(tokens[p.j], D.THOU_AUX[p.w.toLowerCase()]);
      continue; // verb after thou stays in base form
    }
    for (let j = i + 1; j < tokens.length; j++) {
      if (!/[a-z']/i.test(tokens[j])) { if (/[.!?;,]/.test(tokens[j])) break; continue; }
      const v = tokens[j].toLowerCase();
      if (SKIP_ADV.test(v)) continue;
      if (D.THOU_AUX[v]) tokens[j] = matchCase(tokens[j], D.THOU_AUX[v]);
      else if (D.THOU_VERBS[v]) tokens[j] = matchCase(tokens[j], D.THOU_VERBS[v]);
      break;
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    const low = tokens[i].toLowerCase();
    if (D.ETH_VERBS[low]) {
      const p = prevWord(i);
      // avoid converting after thou/you/I/we/they
      if (!p || !/^(thou|you|i|we|they|ye)$/i.test(p.w)) {
        tokens[i] = matchCase(tokens[i], D.ETH_VERBS[low]);
      }
    }
  }

  // 5. vocabulary swaps (skip words already touched)
  for (let i = 0; i < tokens.length; i++) {
    const low = tokens[i].toLowerCase();
    if (D.WORDS_M2S[low]) tokens[i] = matchCase(tokens[i], D.WORDS_M2S[low]);
  }
  text = tokens.join("");

  // 6. single-word poetic contractions (over->o'er etc.) — only at standard+
  if (level >= 1) {
    text = text.replace(/\bover\b/gi, m => matchCase(m, "o'er"));
    text = text.replace(/\bnever\b/gi, m => matchCase(m, "ne'er"));
    text = text.replace(/\bit is\b/gi, m => matchCase(m, "'tis"));
    text = text.replace(/\bit was\b/gi, m => matchCase(m, "'twas"));
  }

  // 7. flourishes per sentence
  const sentences = text.match(SENT_SPLIT) || [text];
  const prob = level === 0 ? 0.12 : level === 1 ? 0.4 : 0.85;
  const out = sentences.map((s) => {
    const trimmed = s.trim();
    if (!trimmed) return s;
    if (rnd() > prob) return s;
    let bank = D.FLOURISH.neutral;
    if (/\?\s*$/.test(trimmed)) bank = D.FLOURISH.question;
    else if (/!\s*$/.test(trimmed)) bank = D.FLOURISH.exclaim;
    else if (/\b(nay|not|ne'er|woe|ill|foul|abhor|alas)\b/i.test(trimmed)) bank = D.FLOURISH.negative;
    const fl = pick(bank, rnd);
    const lead = s.match(/^\s*/)[0];
    const body = s.slice(lead.length);
    const lowered = /^I\b/.test(body) || /^['A-Z][A-Z]/.test(body)
      ? body : body.charAt(0).toLowerCase() + body.slice(1);
    return lead + fl + " " + lowered;
  });
  text = out.join("");

  // 8. full-ham closer
  if (level === 2 && rnd() < 0.5) {
    text = text.replace(/\s*$/, "") ;
    text += " " + pick(D.FLOURISH.closer, rnd);
  }
  return { text: text.trim(), notes: [] };
}

// -------- Shakespearean -> Modern (with glossary) --------
export function toModern(input) {
  if (!input || !input.trim()) return { text: "", glossary: [], famous: [] };
  let text = input;
  const glossary = [];
  const seen = new Set();

  // famous line detection
  const famous = [];
  const norm = input.toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ");
  for (const f of D.FAMOUS_LINES) {
    if (norm.includes(f.match)) famous.push(f);
  }

  // phrase replacements
  for (const [from, to] of D.PHRASES_S2M) {
    const re = new RegExp("\\b" + esc(from).replace(/ /g, "\\s+") + "\\b", "gi");
    if (re.test(text)) {
      text = text.replace(re, (m) => matchCase(m, to));
      if (!seen.has(from)) { seen.add(from); glossary.push({ word: from, modern: to, note: "" }); }
    }
  }

  // word-level glossary swaps
  let tokens = text.split(/(\s+|[.,;:!?"()—–])/).filter(t => t !== "");
  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];
    if (!/[a-z]/i.test(raw)) continue;
    const low = raw.toLowerCase();
    const entry = D.GLOSS_S2M[low];
    if (entry) {
      const modern = entry[0].split(" / ")[0];
      tokens[i] = matchCase(raw, modern);
      if (!seen.has(low)) { seen.add(low); glossary.push({ word: low, modern: entry[0], note: entry[1] }); }
      continue;
    }
    // -eth  -> -s
    for (const [mod, old] of Object.entries(D.ETH_VERBS)) {
      if (low === old) { tokens[i] = matchCase(raw, mod); if (!seen.has(old)) { seen.add(old); glossary.push({ word: old, modern: mod, note: "old third-person '-eth' ending" }); } break; }
    }
    for (const [mod, old] of Object.entries(D.THOU_VERBS)) {
      if (low === old) { tokens[i] = matchCase(raw, mod); if (!seen.has(old)) { seen.add(old); glossary.push({ word: old, modern: mod, note: "old '-est' ending used with 'thou'" }); } break; }
    }
  }
  text = tokens.join("");

  // fix leftover agreement: "you are" etc. handled by gloss (art->are)
  text = text.replace(/\bthou\b/gi, m => matchCase(m, "you"));
  text = text.replace(/\byou is\b/gi, m => matchCase(m, "you are"));

  return { text: text.trim(), glossary, famous };
}

// -------- Insult generator --------
export function generateInsult(rndSeed) {
  const rnd = seedFrom(String(rndSeed));
  if (rnd() < 0.35) {
    const q = pick(D.INSULT_QUOTES, rnd);
    return { text: q.text, source: q.source, kind: "quote" };
  }
  const a = pick(D.INSULT_KIT.adj1, rnd), b = pick(D.INSULT_KIT.adj2, rnd), n = pick(D.INSULT_KIT.noun, rnd);
  return { text: `Thou ${a}, ${b} ${n}!`, source: "assembled from words found across the plays", kind: "kit" };
}

export function quoteForTheme(theme, rndSeed) {
  const rnd = seedFrom(String(rndSeed));
  const pool = D.QUOTES.filter(q => q.theme === theme);
  return pick(pool.length ? pool : D.QUOTES, rnd);
}
