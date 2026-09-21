// Bardify Generational Translator — offline era-register engine.
// Renders any text (Folger passage, student writing, anything) into a chosen
// generation's slang register, and scores a student's own re-render for
// semantic fidelity against the source. No API calls; lexicon lives in
// generations.js and is versioned/editable as slang evolves.
import { ERAS, LEXICON } from "./generations.js";

// ---------- tiny shared helpers (mirrors lib/engine.js) ----------
function matchCase(src, out) {
  if (!src) return out;
  const m = src.match(/[a-zA-Z]/);
  if (!m) return out;
  const letters = src.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 1 && letters === letters.toUpperCase()) return out.toUpperCase();
  if (/[A-Z]/.test(m[0])) return out.replace(/[a-zA-Z]/, (ch) => ch.toUpperCase());
  return out;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return function () {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

// ---------- form indices ----------
// MATCH_INDEX: original/neutral/archaic forms only — used when *rendering*, so an
// era form like "no way" can't hijack a line's literal meaning against a different anchor.
// First occurrence wins: shared forms keep their primary (earliest) anchor mapping.
let MATCH_INDEX = null;
function matchIndex() {
  if (MATCH_INDEX) return MATCH_INDEX;
  MATCH_INDEX = new Map();
  for (const e of LEXICON) {
    for (const f of e.o || []) {
      const k = f.toLowerCase();
      if (!MATCH_INDEX.has(k)) MATCH_INDEX.set(k, e);
    }
  }
  return MATCH_INDEX;
}
// ALL_INDEX: every form in every era → ALL candidate entries (a slang form can legitimately
// belong to more than one anchor, e.g. "fr" under both "true" and "indeed"). Used by
// neutralize() for attempt scoring, so a student's valid render never counts as missed
// just because the form also serves another anchor.
let ALL_INDEX = null;
function allIndex() {
  if (ALL_INDEX) return ALL_INDEX;
  ALL_INDEX = new Map();
  const add = (k, e) => {
    if (!ALL_INDEX.has(k)) ALL_INDEX.set(k, []);
    const list = ALL_INDEX.get(k);
    if (!list.includes(e)) list.push(e);
  };
  for (const e of LEXICON) {
    for (const f of e.o || []) add(f.toLowerCase(), e);
    for (const era of ERAS) for (const f of e[era.id] || []) add(f.toLowerCase(), e);
  }
  return ALL_INDEX;
}
const allEntries = (form) => allIndex().get(form) || [];

// longest-first phrase list for multi-word forms
let PHRASE_LIST = null;
function phrases() {
  if (PHRASE_LIST) return PHRASE_LIST;
  PHRASE_LIST = [...matchIndex().keys()].filter((f) => f.includes(" ")).sort((a, b) => b.length - a.length);
  return PHRASE_LIST;
}
function allPhrases() {
  return [...allIndex().keys()].filter((f) => f.includes(" ")).sort((a, b) => b.length - a.length);
}

function eraReplacement(entry, eraId, rnd, tier) {
  // classroom filter: out-of-tier entries fall back to the plain neutral word
  if ((entry.tier || 0) > tier) return entry.n || entry.o[0];
  const bank = entry[eraId];
  if (!bank || !bank.length) return null;
  return pick(bank, rnd);
}

// ---------- the render ----------
export function toEra(input, eraId, opts) {
  opts = opts || {};
  const era = ERAS.find((e) => e.id === eraId);
  if (!era) throw new Error("unknown era " + eraId);
  const density = opts.density === undefined ? 1 : opts.density; // 0 lean, 1 flavorful, 2 zero subtlety
  const tier = opts.tier === undefined ? 0 : opts.tier; // 0 school-safe (default), 1 mildly salty
  if (!input || !input.trim()) return { text: "", swaps: [] };
  const rnd = seedFrom(input + "|" + eraId + "|" + density + "|" + tier);
  const swaps = [];
  let text = input;

  // 1. multi-word forms first — replaced spans are stashed as placeholders so the
  //    word pass cannot re-swap words inside a replacement ("good morrow"→"oh hi"
  //    must not then become "oh oh hi")
  const stash = [];
  for (const form of phrases()) {
    const entry = matchIndex().get(form);
    const re = new RegExp("\\b" + esc(form).replace(/ /g, "\\s+") + "\\b", "gi");
    text = text.replace(re, (m) => {
      const rep = eraReplacement(entry, eraId, rnd, tier);
      if (!rep) return m;
      swaps.push({ anchor: entry.a, from: m, to: rep });
      stash.push(matchCase(m, rep));
      return "\x00" + (stash.length - 1) + "\x00";
    });
  }

  // 2. single tokens + contractions-aware split
  let tokens = text.split(/(\s+|[.,;:!?\"()—–]|'(?![a-z]))/i);
  const prob = density === 0 ? 0.85 : 1; // density 0: some originals survive untouched
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const m = t.match(/^([a-z][a-z'-]*)$/i);
    if (!m) continue;
    const entry = matchIndex().get(t.toLowerCase());
    if (!entry) continue;
    if (density === 0 && rnd() > prob) continue;
    let rep = eraReplacement(entry, eraId, rnd, tier);
    if (!rep) continue;
    // avoid "the The king": if the text just before is an article and the replacement
    // opens with the same article, drop the replacement's
    const left = tokens.slice(0, i).join("").replace(/\s+$/, "");
    const am = left.match(/\b(the|a|an)$/i);
    const rm = am && rep.match(/^(the|a|an)\s+/i);
    if (rm) rep = rep.slice(rm[0].length);
    swaps.push({ anchor: entry.a, from: t, to: rep });
    tokens[i] = matchCase(t, rep);
  }
  text = tokens.join("");

  // 2b. restore protected phrase replacements
  text = text.replace(/\x00(\d+)\x00/g, (_, i) => stash[+i]);

  // 3. era styling: openers/closers/intensifiers per sentence
  const SENT_SPLIT = /([^.!?]+[.!?]+[\"']?|[^.!?]+$)/g;
  const sentences = text.match(SENT_SPLIT) || [text];
  const styleProb = density === 0 ? 0.15 : density === 1 ? 0.35 : 0.6;
  text = sentences
    .map((s) => {
      const trimmed = s.trim();
      if (trimmed.length < 18 || rnd() > styleProb) return s;
      const era_style = era.style;
      let lead = s.match(/^\s*/)[0];
      let body = s.slice(lead.length);
      const roll = rnd();
      if (roll < 0.35 && era_style.openers?.length) {
        const op = pick(era_style.openers, rnd);
        body = op + ", " + (/^I\b/.test(body) ? body : body.charAt(0).toLowerCase() + body.slice(1));
      } else if (roll < 0.7 && era_style.intensifiers?.length) {
        body = body.replace(/([.!?])/, (pm) => ", " + pick(era_style.intensifiers, rnd) + pm);
      } else if (era_style.closers?.length) {
        body = body.replace(/\s*([.!?])[\"']?\s*$/, (pm) => " — " + pick(era_style.closers, rnd) + ".");
      }
      return lead + body;
    })
    .join("");

  // 4. era cosmetic pass: genalpha/genz go lowercase + may shrug on an emoji
  if (era.style.lowercase) {
    text = text
      .split(/([.!?]\s+)/)
      .map((seg) =>
        /^[A-Z]/.test(seg) && !/^I\b/.test(seg) && rnd() < 0.9
          ? seg.charAt(0).toLowerCase() + seg.slice(1)
          : seg,
      )
      .join("");
  }
  if (era.style.emojis?.length && density >= 1 && rnd() < 0.55) {
    text = text.replace(/\s*$/, " " + pick(era.style.emojis, rnd));
  }
  return { text: text.trim(), swaps };
}

// ---------- attempt-first fidelity scoring ----------
// Maps every known form (archaic, neutral, every era) back to its anchor concept.
export function neutralize(text, { generous = false } = {}) {
  const anchors = new Set();
  if (!text) return anchors;
  const take = (list) => (generous ? list : list.slice(0, 1));
  let work = " " + text.toLowerCase() + " ";
  for (const form of allPhrases()) {
    const re = new RegExp("\\b" + esc(form).replace(/ /g, "\\s+") + "\\b", "g");
    if (re.test(work)) for (const e of take(allEntries(form))) anchors.add(e.a);
  }
  const toks = text.toLowerCase().match(/[a-z][a-z'-]*/g) || [];
  for (const t of toks) {
    // tolerant lookup: exact, then strip possessive/contraction tail ("karma's" → "karma")
    const cands = allEntries(t).concat(allEntries(t.replace(/'s$/, "")), allEntries(t.replace(/'$/, "")));
    for (const e of take(cands)) anchors.add(e.a);
  }
  return anchors;
}

// A light content-word overlap so the score isn't lexicon-bound.
const STOPWORDS = new Set("the a an and or but if then of to in on at for with by from as is are was were be been am do does did have has had i you he she it we they me him her us them my your his our their this that these those not no yes will would can could shall should may might must than too about above after again against all any before below between both down during each few more most other out over own same so some such only up very when where which while who whom".split(" "));
function contentWords(text) {
  return new Set((text.toLowerCase().match(/[a-z][a-z'-]*/g) || []).filter((w) => !STOPWORDS.has(w) && !allIndex().has(w)));
}

export function scoreAttempt(source, student, eraId) {
  const srcAnchors = neutralize(source);            // canonical: first candidate anchor per form
  const stuAnchors = neutralize(student, { generous: true }); // any legitimate anchor counts
  const kept = [...srcAnchors].filter((a) => stuAnchors.has(a));
  const missed = [...srcAnchors].filter((a) => !stuAnchors.has(a));
  const srcWords = contentWords(source);
  const stuWords = contentWords(student);
  const keptWords = [...srcWords].filter((w) => stuWords.has(w)).length;
  const anchorScore = srcAnchors.size ? (kept.length / srcAnchors.size) * 70 : 35;
  const wordScore = srcWords.size ? (keptWords / srcWords.size) * 30 : 30;
  const score = Math.round(anchorScore + wordScore);
  // era flair: how many era-slang words the student actually used
  let eraFlair = 0;
  const toks = student.toLowerCase().match(/[a-z][a-z'-]*/g) || [];
  const eraForms = new Set();
  for (const e of LEXICON) for (const form of e[eraId] || []) {
    for (const fw of form.toLowerCase().match(/[a-z][a-z'-]*/g) || []) eraForms.add(fw);
  }
  for (const t of toks) if (eraForms.has(t)) eraFlair++;
  return { score, kept, missed, eraFlair, srcTotal: srcAnchors.size + srcWords.size };
}
