// Bardify corpus builder — Folger Shakespeare (Folger Digital Texts) XML/TEI -> normalized JSON.
// Texts are free for all non-commercial use; see https://www.folger.edu/explore/shakespeares-works/download/usage-guidelines/
// Usage: node scripts/build-corpus.mjs [--skip-download]
//   Downloads the Folger XML zips into scripts/corpus-src/zips (needs curl), extracts them (needs unzip),
//   parses the TEI, and writes one minified JSON per work into public/corpus/ plus corpus/index.json.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "scripts", "corpus-src");
const ZIPS = path.join(SRC, "zips");
const XMLDIR = path.join(SRC, "xml");
const OUT = path.join(ROOT, "public", "corpus");
const SKIP_DOWNLOAD = process.argv.includes("--skip-download");

// code -> display title (Folger codes, poems included; "All" = A Lover's Complaint)
const TITLES = {
  "1H4": "Henry IV, Part 1", "2H4": "Henry IV, Part 2", "H5": "Henry V",
  "1H6": "Henry VI, Part 1", "2H6": "Henry VI, Part 2", "3H6": "Henry VI, Part 3",
  H8: "Henry VIII", AWW: "All's Well That Ends Well", AYL: "As You Like It",
  Ado: "Much Ado About Nothing", Ant: "Antony and Cleopatra", Cor: "Coriolanus",
  Cym: "Cymbeline", Err: "The Comedy of Errors", Ham: "Hamlet", JC: "Julius Caesar",
  Jn: "King John", LLL: "Love's Labor's Lost", Lr: "King Lear", Mac: "Macbeth",
  MM: "Measure for Measure", MND: "A Midsummer Night's Dream", MV: "The Merchant of Venice",
  Wiv: "The Merry Wives of Windsor", Oth: "Othello", Per: "Pericles", R2: "Richard II",
  R3: "Richard III", Rom: "Romeo and Juliet", Shr: "The Taming of the Shrew",
  TN: "Twelfth Night", TNK: "The Two Noble Kinsmen", TGV: "The Two Gentlemen of Verona",
  Tim: "Timon of Athens", Tit: "Titus Andronicus", Tmp: "The Tempest",
  Tro: "Troilus and Cressida", WT: "The Winter's Tale",
  Son: "The Sonnets", Luc: "The Rape of Lucrece", Ven: "Venus and Adonis", PhT: "The Phoenix and the Turtle",
  All: "A Lover's Complaint",
};
// Folger plays use act/scene; poems and sonnets do not
const POEM_CODES = new Set(["Son", "Luc", "Ven", "PhT", "All"]);

const decode = (s) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
const stripTags = (s) => decode(s.replace(/<[^>]*>/g, ""));
const attr = (s, name) => {
  const m = s.match(new RegExp(name + '="([^"]*)"'));
  return m ? m[1] : null;
};
const linesOf = (units) =>
  units.reduce((sum, u) => sum + u.scenes.reduce((s2, sc) => s2 + sc.entries.reduce((s3, e) => s3 + (e.lines ? e.lines.length : 0), 0), 0), 0);

function parseWork(xml) {
  xml = xml.replace(/\r/g, "");
  const bs = xml.indexOf("<body>");
  const be = xml.indexOf("</body>");
  if (bs < 0) return { units: [], characters: [] };
  const body = xml.slice(bs, be);

  const units = []; // [{label, scenes:[{label, entries:[...]}]}]
  const characters = new Set();
  let actN = "1", sceneN = null;
  let curUnit = null, curScene = null;
  let inSp = false, speaker = null; // collecting speaker name
  let inStage = false, stageText = [];
  let lineMap = null; // per-block: n -> [{word, text}], order preserved
  let lastLineKey = null;

  const ensureUnit = () => {
    if (!curUnit) { curUnit = { label: actN, scenes: [] }; units.push(curUnit); }
    return curUnit;
  };
  const ensureScene = () => {
    if (!curScene) {
      curScene = { label: sceneN, entries: [] };
      ensureUnit().scenes.push(curScene);
    }
    return curScene;
  };
  const flushStage = () => {
    if (stageText.length) {
      ensureScene().entries.push({ t: "stage", text: tidy(stageText) });
      stageText = [];
    }
  };
  const flushSpeech = () => {
    if (lineMap && lineMap.size) {
      const lines = [];
      for (const [n, parts] of lineMap.entries()) lines.push({ n, text: tidy(parts) });
      ensureScene().entries.push(speaker ? { t: "speech", speaker, lines } : { t: "text", lines });
    }
    lineMap = null;
  };
  const tidy = (parts) =>
    decode(parts.map((p) => p.text).join(""))
      .replace(/\s+/g, " ")
      .replace(/ ([,.;:!?)\]])/g, "$1")
      .replace(/\s+'/g, "'")
      .replace(/ ([,.;:!?)\]]])/g, "$1")
      .replace(/([(\[]) /g, "$1")
      .trim();

  const addToken = (nAttr, text, isWord) => {
    if (inStage) { stageText.push({ text }); return; }
    // skip headers/titles (unnumbered <w> outside any speech); poems flow speakerless via numbered tokens
    if (speaker === null && !nAttr) return;
    if (!lineMap) lineMap = new Map();
    const key = nAttr || lastLineKey || "?";
    lastLineKey = key;
    if (!lineMap.has(key)) lineMap.set(key, []);
    // ' ' between words; punctuation/space tokens carry their own glue
    lineMap.get(key).push({ text: isWord ? " " + text : text });
  };

  const RE = /<(div1|div2)\b([^>]*)\/?>|<\/(div1|div2)>|<sp\b[^>]*>|<\/sp>|<sp><\/sp>|<speaker\b[^>]*>([\s\S]*?)<\/speaker>|<stage\b[^>]*>([\s\S]*?)<\/stage>|<w\b([^>]*)\/?>([\s\S]*?)<\/w>|<pc\b([^>]*)\/?>([\s\S]*?)<\/pc>|<c\b([^>]*)\/?>([\s\S]*?)<\/c>/g;
  let m;
  while ((m = RE.exec(body))) {
    const [full, divOpen, divAttrs, divClose, spkContent, stageContent, wAttr, wText, pcAttr, pcText, cAttr, cText] = m;
    if (divOpen && divAttrs !== undefined) {
      const n = attr(divAttrs, "n");
      flushStage(); flushSpeech();
      if (divOpen === "div1") { actN = n || String(units.length + 1); sceneN = null; curUnit = null; curScene = null; }
      else { sceneN = n; curScene = { label: n, entries: [] }; ensureUnit().scenes.push(curScene); }
      continue;
    }
    if (spkContent !== undefined) {
      speaker = stripTags(spkContent).replace(/\s+/g, " ").trim();
      if (speaker) characters.add(speaker);
      continue;
    }
    if (stageContent !== undefined) {
      flushSpeech();
      ensureScene().entries.push({ t: "stage", text: tidy([{ text: stripTags(stageContent) }]) });
      inStage = false;
      continue;
    }
    if (full === "</sp>") { flushSpeech(); speaker = null; lastLineKey = null; continue; }
    // scene/act boundaries end any lingering anonymous (poem) block
    if (divClose === "div1" || divClose === "div2") { flushStage(); flushSpeech(); lastLineKey = null; curScene = null; if (divClose === "div1") curUnit = null; continue; }
    if (wText !== undefined && full.startsWith("<w")) { addToken(attr(wAttr, "n"), stripTags(wText), true); continue; }
    if (pcText !== undefined && full.startsWith("<pc")) { addToken(attr(pcAttr, "n"), stripTags(pcText), false); continue; }
    if (cText !== undefined && full.startsWith("<c")) {
      const t = stripTags(cText); if (t.trim()) addToken(attr(cAttr, "n"), t, false);
      continue;
    }
  }
  flushStage(); flushSpeech();

  // poems & sonnets: drop the meaningless act level, promote the div2 sections
  if (POEM_CODES.has(__code)) {
    const scenes = units.flatMap((u) => u.scenes);
    return { units: [{ label: "", scenes: scenes.map((sc, i) => ({ ...sc, label: sc.label || String(i + 1) })) }], characters: [...characters].sort(), lineCount: linesOf(units) };
  }
  const lineCount = units.reduce((sum, u) => sum + u.scenes.reduce((s2, sc) => s2 + sc.entries.reduce((s3, e) => s3 + (e.lines ? e.lines.length : 0), 0), 0), 0);
  return { units, characters: [...characters].sort(), lineCount };
}

let __code = "";

async function main() {
  fs.mkdirSync(ZIPS, { recursive: true });
  fs.mkdirSync(XMLDIR, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  if (!SKIP_DOWNLOAD) {
    for (const code of Object.keys(TITLES)) {
      const zipFile = path.join(ZIPS, code + ".zip");
      if (fs.existsSync(zipFile)) continue;
      const url = `https://flgr.sh/txtfss${code}xml`;
      console.log("downloading", code);
      execFileSync("curl", ["-sL", "--max-time", "60", url, "-o", zipFile]);
    }
    for (const f of fs.readdirSync(ZIPS)) {
      if (!f.endsWith(".zip")) continue;
      execFileSync("unzip", ["-qq", "-o", path.join(ZIPS, f), "-d", XMLDIR]);
    }
  }

  const xmlFiles = fs
    .readdirSync(XMLDIR, { recursive: true })
    .map((f) => String(f))
    .filter((f) => f.endsWith(".xml") && !f.includes("__MACOSX"));

  const index = [];
  for (const rel of xmlFiles) {
    const file = path.join(XMLDIR, rel);
    const code = path.basename(rel, ".xml");
    __code = code;
    const title = TITLES[code];
    if (!title) { console.warn("unknown code", code, "— skipped"); continue; }
    const xml = fs.readFileSync(file, "utf8");
    const parsed = parseWork(xml);
    const outName = code.toLowerCase(); // e.g. ham.json
    const kind = POEM_CODES.has(code) ? (code === "Son" ? "sonnets" : "poem") : "play";
    const work = { code, title, kind, ...parsed };
    fs.writeFileSync(path.join(OUT, outName + ".json"), JSON.stringify(work));
    index.push({
      code, title, kind, file: "corpus/" + outName + ".json",
      lineCount: parsed.lineCount,
      unitCount: parsed.units.length,
      characters: parsed.characters.length,
    });
    console.log(`${code}  ${title} — ${parsed.lineCount} lines, ${parsed.characters.length} characters`);
  }
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify({ sourcedFrom: "The Folger Shakespeare (Folger Shakespeare Library), folger.edu — free for non-commercial use", works: index.sort((a, b) => a.title.localeCompare(b.title)) }));
  console.log("\nWrote", index.length, "works to", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
