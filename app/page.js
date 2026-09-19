"use client";

import { useEffect, useMemo, useState } from "react";
import {
  toShakespeare,
  toModern,
  generateInsult,
  quoteForTheme,
} from "../lib/engine.js";
import { toEra, scoreAttempt } from "../lib/generational.js";
import { ERAS } from "../lib/generations.js";
import {
  GLOSS_S2M,
  FAMOUS_LINES,
  STAGE_DIRECTIONS,
  CHARACTER_SUGGESTIONS,
  LOADING_LINES,
} from "../lib/data.js";
import {
  speak,
  stopSpeech,
  performSequence,
  ELEVEN_VOICES,
} from "../lib/speech.js";

// ---------- small helpers ----------
function download(name, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

function useFlash() {
  const [flash, setFlash] = useState({});
  const trigger = (key, msg) => {
    setFlash((f) => ({ ...f, [key]: msg }));
    setTimeout(() => setFlash((f) => ({ ...f, [key]: null })), 1200);
  };
  return [flash, trigger];
}

function copyText(t, key, trigger) {
  if (!t) return;
  navigator.clipboard
    .writeText(t)
    .then(() => trigger(key, "✓ Copied!"))
    .catch(() => trigger(key, "✗ Copy failed"));
}

const HAM_OPTIONS = [
  { value: 0, label: "Subtle" },
  { value: 1, label: "Standard" },
  { value: 2, label: "Full Ham 🍖" },
];

// ==================================================================
export default function Home() {
  const [tab, setTab] = useState("translate");
  const [flash, triggerFlash] = useFlash();

  // ---------- translate state ----------
  const [direction, setDirection] = useState("m2s");
  const [src, setSrc] = useState("");
  const [flourish, setFlourish] = useState(1);
  const [result, setResult] = useState(null); // {text, glossary, famous}
  const [loadingLine, setLoadingLine] = useState("");
  const [voiceId, setVoiceId] = useState(ELEVEN_VOICES[0].id);

  function runTranslate(text, dir) {
    const input = text !== undefined ? text : src;
    const d = dir || direction;
    if (!input.trim()) return;
    setLoadingLine(LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)]);
    setTimeout(() => setLoadingLine(""), 900);
    if (d === "m2s") {
      const r = toShakespeare(input, { flourish });
      setResult({ text: r.text, glossary: [], famous: [] });
    } else {
      const r = toModern(input);
      setResult(r);
    }
  }

  function swapDirection() {
    const next = direction === "m2s" ? "s2m" : "m2s";
    setDirection(next);
    if (result?.text) {
      setSrc(result.text);
      runTranslate(result.text, next);
    }
  }

  function downloadTranslation() {
    if (!result?.text) return;
    let c = "BARDIFY — TRANSLATION SCROLL\n" + "=".repeat(40) + "\n\n";
    c += (direction === "m2s" ? "MODERN ORIGINAL:\n" : "SHAKESPEAREAN ORIGINAL:\n") + src + "\n\n";
    c += (direction === "m2s" ? "SHAKESPEAREAN RENDERING:\n" : "MODERN RENDERING:\n") + result.text + "\n";
    if (result.glossary?.length) {
      c += "\nGLOSSARY:\n";
      result.glossary.forEach((g) => {
        c += `  ${g.word} = ${g.modern}${g.note ? "  (" + g.note + ")" : ""}\n`;
      });
    }
    if (result.famous?.length) {
      c += "\nFAMOUS LINES DETECTED:\n";
      result.famous.forEach((f) => (c += `  ${f.source} — ${f.gist}\n`));
    }
    c += "\n— translated by Bardify, with apologies to the First Folio\n";
    download("bardify-translation.txt", c);
  }

  // ---------- quotes ----------
  const [quote, setQuote] = useState(null);
  const [theme, setTheme] = useState("love");

  // ---------- script forge ----------
  const [playTitle, setPlayTitle] = useState("");
  const [characters, setCharacters] = useState(["ROSALIND", "A CLOWN"]);
  const [charInput, setCharInput] = useState("");
  const [lineRows, setLineRows] = useState([
    { type: "line", char: "ROSALIND", text: "Hey, did you eat my leftover pizza?" },
    { type: "direction", text: "Aside" },
    { type: "line", char: "A CLOWN", text: "Maybe. I was hungry and it was delicious. I'm sorry!" },
    { type: "line", char: "ROSALIND", text: "You are the worst roommate ever. I want revenge!" },
  ]);
  const [forgeFlourish, setForgeFlourish] = useState(1);
  const [script, setScript] = useState("");
  const [forgedLines, setForgedLines] = useState([]);
  const [performing, setPerforming] = useState(false);

  function addChar(name) {
    const n = (name || "").trim().toUpperCase();
    if (n && !characters.includes(n)) setCharacters([...characters, n]);
  }
  function summonChar() {
    const pool = CHARACTER_SUGGESTIONS.filter((c) => !characters.includes(c));
    if (pool.length) addChar(pool[Math.floor(Math.random() * pool.length)]);
  }
  function updateRow(i, patch) {
    setLineRows(lineRows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function deleteRow(i) {
    setLineRows(lineRows.filter((_, j) => j !== i));
  }

  function forgeScript() {
    const title = playTitle.trim() || "A Most Lamentable Comedy, Untitled";
    let out = title.toUpperCase() + "\n";
    out += "A short play in one scene, rendered in the Bard's tongue\n\n";
    out += "DRAMATIS PERSONAE: " + characters.join(", ") + "\n\nSCENE I.\n\n";
    const forged = [];
    lineRows.forEach((row) => {
      if (row.type === "direction") {
        out += "    [" + row.text + "]\n\n";
        forged.push({ direction: row.text });
      } else if (row.text.trim()) {
        const t = toShakespeare(row.text, { flourish: forgeFlourish }).text;
        out += row.char + ":\n    " + t + "\n\n";
        forged.push({ char: row.char, text: t });
      }
    });
    out += "    [Exeunt omnes]\n\nFINIS.\n";
    setScript(out);
    setForgedLines(forged);
    return out;
  }

  function performScript() {
    if (!forgedLines.length) return;
    const pitches = [1, 0.7, 1.3, 0.85, 1.15];
    const items = forgedLines.map((it) => {
      if (it.direction)
        return { text: "Stage direction: " + it.direction, voiceId: ELEVEN_VOICES[0].id, pitch: 0.9 };
      const ci = Math.max(0, characters.indexOf(it.char));
      return {
        text: it.char + " speaks. " + it.text,
        voiceId: ELEVEN_VOICES[ci % ELEVEN_VOICES.length].id,
        pitch: pitches[ci % pitches.length],
      };
    });
    setPerforming(true);
    performSequence(items, (i) => {
      if (i === -1) setPerforming(false);
    });
  }

  // ---------- insult cannon ----------
  const [insult, setInsult] = useState(null);

  // ---------- era speak (Generational Translator) ----------
  const [eraMode, setEraMode] = useState("folio"); // "folio" | "free"
  const [eraIdx, setEraIdx] = useState(null);
  const [eraCode, setEraCode] = useState("");
  const [eraWork, setEraWork] = useState(null);
  const [eraUnit, setEraUnit] = useState(0);
  const [eraScene, setEraScene] = useState(0);
  const [eraFree, setEraFree] = useState(
    "All the world's a stage, and all the men and women merely players.",
  );
  const [eraId, setEraId] = useState("genz");
  const [eraDensity, setEraDensity] = useState(1);
  const [schoolSafe, setSchoolSafe] = useState(true); // tiers: 0 = classroom-safe only
  const [eraOut, setEraOut] = useState(null); // { rows:[{speaker,ref,src,era,swaps}], eraId }
  const [eraChallenge, setEraChallenge] = useState("");
  const [eraScore, setEraScore] = useState(null);

  useEffect(() => {
    fetch("corpus/index.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setEraIdx(d.works || []))
      .catch(() => setEraIdx([]));
  }, []);

  function loadEraWork(code) {
    setEraCode(code);
    setEraWork(null);
    setEraUnit(0);
    setEraScene(0);
    setEraOut(null);
    setEraScore(null);
    if (!code) return;
    fetch(`corpus/${code.toLowerCase()}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEraWork(d))
      .catch(() => setEraWork(null));
  }

  // Flatten a scene into display rows: { speaker, ref, text } (stage directions & poem stanzas included)
  function eraSceneRows(unitIdx = eraUnit, sceneIdx = eraScene, limit = 14) {
    const sc = eraWork?.units?.[unitIdx]?.scenes?.[sceneIdx];
    if (!sc) return [];
    const rows = [];
    for (const e of sc.entries || []) {
      if (e.t === "speech") {
        for (const l of e.lines || []) {
          rows.push({ speaker: e.speaker, ref: l.n, text: l.text });
          if (rows.length >= limit) return rows;
        }
      } else if (e.t === "text") {
        for (const l of e.lines || []) {
          rows.push({ speaker: null, ref: l.n, text: l.text });
          if (rows.length >= limit) return rows;
        }
      } else if (e.text && rows.length < limit) {
        rows.push({ speaker: "⌂", ref: null, text: "[" + e.text.trim() + "]" });
      }
    }
    return rows;
  }

  function renderEra() {
    const opts = { density: eraDensity, tier: schoolSafe ? 0 : 1 };
    setEraScore(null);
    if (eraMode === "folio") {
      const rows = eraSceneRows();
      if (!rows.length) return;
      setEraOut({
        eraId,
        rows: rows.map((r) => {
          const res = r.speaker === "⌂" ? { text: r.text, swaps: [] } : toEra(r.text, eraId, opts);
          return { ...r, src: r.text, era: res.text, swaps: res.swaps };
        }),
      });
    } else {
      if (!eraFree.trim()) return;
      const res = toEra(eraFree, eraId, opts);
      setEraOut({ eraId, rows: [{ speaker: null, ref: null, src: eraFree, era: res.text, swaps: res.swaps }] });
    }
  }

  function measureFidelity() {
    const row = eraOut?.rows?.find((r) => r.speaker !== "⌂");
    if (!row || !eraChallenge.trim()) return;
    setEraScore(scoreAttempt(row.src, eraChallenge, eraOut.eraId));
  }

  function downloadEraScroll() {
    if (!eraOut) return;
    const eraInfo = ERAS.find((e) => e.id === eraOut.eraId);
    let c = "BARDIFY — THE GENERATIONAL TRANSLATOR\nRendered into " + eraInfo.name + " (" + eraInfo.years + ")\n" + "=".repeat(40) + "\n\n";
    eraOut.rows.forEach((r) => {
      c += (r.speaker && r.speaker !== "⌂" ? r.speaker + "  " : "") + (r.ref ? r.ref + "  " : "") + "\n";
      c += "  FOLIO:     " + r.src + "\n";
      c += "  " + eraInfo.name.toUpperCase() + ":  " + r.era + "\n\n";
    });
    c += "\n— Bardify Era Speak, texts from the Folger Shakespeare (folger.edu), free for non-commercial use\n";
    download("bardify-era-speak.txt", c);
  }

  // ---------- study hall ----------
  const [glossFilter, setGlossFilter] = useState("");
  const glossEntries = useMemo(() => {
    const f = glossFilter.toLowerCase();
    return Object.entries(GLOSS_S2M)
      .filter(([w, e]) => !f || w.includes(f) || e[0].toLowerCase().includes(f))
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [glossFilter]);

  function downloadGlossary() {
    let c = "BARDIFY — THE WORD-HOARD\nA glossary of Shakespearean English\n" + "=".repeat(40) + "\n\n";
    Object.entries(GLOSS_S2M)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([w, e]) => {
        c += `${w} = ${e[0]}${e[1] ? "  (" + e[1] + ")" : ""}\n`;
      });
    download("bardify-glossary.txt", c);
  }

  // ==================================================================
  return (
    <div className="frame">
      <header>
        <div className="fleuron">❦ ❦ ❦</div>
        <h1>Bardify</h1>
        <p className="tagline">
          The Two-Tongued Quill — Modern English ⇄ the Tongue of the Bard
          <small>Built from the vocabulary, grammar, and lines of Shakespeare&apos;s plays &amp; sonnets</small>
        </p>
      </header>

      <nav>
        {[
          ["translate", "⇄ Translate"],
          ["forge", "✍ Script Forge"],
          ["insult", "☄ Insult Cannon"],
          ["era", "🕰 Era Speak"],
          ["study", "📖 Study Hall"],
        ].map(([key, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      {/* ============ TRANSLATE ============ */}
      {tab === "translate" && (
        <section className="tab active">
          <div className="panel">
            <div className="swap-row">
              <span className="direction-label">
                {direction === "m2s" ? "Modern → Shakespearean" : "Shakespearean → Modern"}
              </span>
              <button className="btn secondary small" onClick={swapDirection} title="Swap direction">
                ⇄ Swap
              </button>
              {direction === "m2s" && (
                <span className="slider-wrap">
                  <label htmlFor="flourish">Ham level:</label>
                  <select id="flourish" value={flourish} onChange={(e) => setFlourish(+e.target.value)}>
                    {HAM_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </span>
              )}
            </div>
            <textarea
              value={src}
              onChange={(e) => setSrc(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runTranslate(); }}
              placeholder={
                direction === "m2s"
                  ? "Type thy modern words here… e.g. “Hey, are you serious? You never listen to me!”"
                  : "Paste the Bard's words here… e.g. “Wherefore art thou Romeo? Deny thy father and refuse thy name.”"
              }
            />
            <div className="btn-row">
              <button className="btn" onClick={() => runTranslate()}>Translate, Forsooth!</button>
              <button
                className="btn secondary"
                onClick={() => { setSrc(""); setResult(null); }}
              >
                Clear
              </button>
            </div>
            <div className="loading-line">{loadingLine}</div>
          </div>

          <div className="panel">
            <div className="output">{result?.text || ""}</div>
            {result?.famous?.map((f, i) => (
              <div className="famous" key={i}>
                🎭 <strong>Famous line spotted!</strong> {f.source} — {f.gist}
              </div>
            ))}
            <div className="btn-row">
              <button className="btn secondary" onClick={() => speak(result?.text, { voiceId })}>
                🔊 Speak It
              </button>
              <button className="btn secondary" onClick={stopSpeech}>⏹ Silence</button>
              <button
                className="btn secondary"
                onClick={(e) => copyText(result?.text, "copy", triggerFlash)}
              >
                {flash.copy || "📋 Copy"}
              </button>
              <button className="btn secondary" onClick={downloadTranslation}>
                📜 Download Scroll (.txt)
              </button>
            </div>
            <div className="controls" style={{ marginTop: "0.6rem" }}>
              <label htmlFor="voiceSel">Voice:</label>
              <select id="voiceSel" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                {ELEVEN_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <p className="audio-note">
              Voices are conjured by ElevenLabs when the incantation (API key) is configured;
              otherwise thy browser&apos;s own voice steps in as understudy.
            </p>
            {result?.glossary?.length > 0 && (
              <>
                <h3>Student&apos;s Glossary for this passage</h3>
                <table className="gloss-table">
                  <thead>
                    <tr><th>Word</th><th>Meaning</th><th>Note</th></tr>
                  </thead>
                  <tbody>
                    {result.glossary.map((g, i) => (
                      <tr key={i}>
                        <td className="gloss-word">{g.word}</td>
                        <td>{g.modern}</td>
                        <td className="gloss-note">{g.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="panel">
            <h3>The Bard&apos;s Wisdom on…</h3>
            <div className="controls">
              <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                {["love", "doubt", "ambition", "courage", "wisdom", "fate", "time", "grief", "mischief"].map((t) => (
                  <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
              <button
                className="btn secondary small"
                onClick={() => setQuote(quoteForTheme(theme, Date.now()))}
              >
                Consult the Bard
              </button>
            </div>
            {quote && (
              <div className="quote-box">
                “{quote.text}”<span className="quote-src">— {quote.source}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ============ SCRIPT FORGE ============ */}
      {tab === "forge" && (
        <section className="tab active">
          <div className="panel">
            <h2>Forge a Skit in the Bard&apos;s Tongue</h2>
            <div className="controls">
              <label htmlFor="playTitle">Title:</label>
              <input
                id="playTitle"
                type="text"
                value={playTitle}
                onChange={(e) => setPlayTitle(e.target.value)}
                placeholder="e.g. The Tragedie of the Empty Fridge"
                style={{ flex: 1, minWidth: 220 }}
              />
            </div>
            <h3>Dramatis Personae</h3>
            <div className="controls">
              <input
                type="text"
                value={charInput}
                onChange={(e) => setCharInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { addChar(charInput); setCharInput(""); } }}
                placeholder="Add a character (or summon one)…"
              />
              <button className="btn secondary small" onClick={() => { addChar(charInput); setCharInput(""); }}>
                Add
              </button>
              <button className="btn secondary small" onClick={summonChar}>🎲 Summon</button>
            </div>
            <div>
              {characters.map((c, i) => (
                <span className="char-chip" key={c}>
                  {c}{" "}
                  <button title="banish" onClick={() => setCharacters(characters.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </span>
              ))}
            </div>

            <h3>
              The Lines{" "}
              <span style={{ fontWeight: "normal", fontVariant: "normal", fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                (write in plain modern English — the quill shall do the rest)
              </span>
            </h3>
            <div>
              {lineRows.map((row, i) => (
                <div className="line-row" key={i}>
                  {row.type === "line" ? (
                    <>
                      <select value={row.char} onChange={(e) => updateRow(i, { char: e.target.value })}>
                        {characters.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={row.text}
                        onChange={(e) => updateRow(i, { text: e.target.value })}
                        placeholder="What do they say? (modern English)"
                      />
                    </>
                  ) : (
                    <select style={{ flex: 1 }} value={row.text} onChange={(e) => updateRow(i, { text: e.target.value })}>
                      {STAGE_DIRECTIONS.map((d) => (
                        <option key={d} value={d}>[{d}]</option>
                      ))}
                    </select>
                  )}
                  <button className="del" title="strike this line" onClick={() => deleteRow(i)}>✕</button>
                </div>
              ))}
            </div>
            <div className="btn-row">
              <button
                className="btn secondary small"
                onClick={() =>
                  setLineRows([
                    ...lineRows,
                    {
                      type: "line",
                      char: characters[lineRows.filter((r) => r.type === "line").length % Math.max(characters.length, 1)] || "",
                      text: "",
                    },
                  ])
                }
              >
                + Add Line
              </button>
              <button
                className="btn secondary small"
                onClick={() => setLineRows([...lineRows, { type: "direction", text: STAGE_DIRECTIONS[0] }])}
              >
                + Stage Direction
              </button>
            </div>
            <div className="controls" style={{ marginTop: "0.7rem" }}>
              <label htmlFor="forgeFlourish">Ham level:</label>
              <select id="forgeFlourish" value={forgeFlourish} onChange={(e) => setForgeFlourish(+e.target.value)}>
                {HAM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button className="btn" onClick={forgeScript}>Forge the Script!</button>
            </div>
          </div>

          <div className="panel">
            <div className="script-out">{script}</div>
            <div className="btn-row">
              <button className="btn secondary" onClick={performScript} disabled={performing}>
                {performing ? "🎭 Performing…" : "🎭 Perform It (each player a different voice)"}
              </button>
              <button className="btn secondary" onClick={() => { stopSpeech(); setPerforming(false); }}>
                ⏹ Curtain
              </button>
              <button className="btn secondary" onClick={() => copyText(script, "copyScript", triggerFlash)}>
                {flash.copyScript || "📋 Copy"}
              </button>
              <button
                className="btn secondary"
                onClick={() => { const s = script || forgeScript(); if (s.trim()) download("bardify-script.txt", s); }}
              >
                📜 Download Script (.txt)
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ============ INSULT CANNON ============ */}
      {tab === "insult" && (
        <section className="tab active">
          <div className="panel insult-box">
            <h2>The Insult Cannon</h2>
            <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem" }}>
              Genuine barbs from the plays, and fresh ones assembled from the Bard&apos;s own word-hoard. Aim responsibly.
            </p>
            <div className="insult-text">{insult?.text || "Press the cannon, an thou darest."}</div>
            <div className="insult-src">
              {insult ? (insult.kind === "quote" ? "— " + insult.source : "(" + insult.source + ")") : ""}
            </div>
            <div className="btn-row" style={{ justifyContent: "center" }}>
              <button className="btn" onClick={() => setInsult(generateInsult(Date.now() + "" + Math.random()))}>
                🔥 Fire!
              </button>
              <button className="btn secondary" onClick={() => speak(insult?.text, { voiceId })}>
                🔊 Hurl It Aloud
              </button>
              <button className="btn secondary" onClick={() => copyText(insult?.text, "copyInsult", triggerFlash)}>
                {flash.copyInsult || "📋 Copy"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ============ STUDY HALL ============ */}
      {tab === "study" && (
        <section className="tab active">
          <div className="panel">
            <h2>Study Hall</h2>
            <p style={{ fontSize: "0.92rem", color: "var(--ink-soft)", marginBottom: "0.7rem" }}>
              Reading Shakespeare for class? Paste any passage in the Translate tab (swap to{" "}
              <i>Shakespearean → Modern</i>) and every archaic word gets explained. Or browse the word-hoard below.
            </p>

            <div className="tip-grid">
              <div className="tip-card">
                <b>Thou vs. Thee vs. Thy</b><br />
                <i>Thou</i> = you (doing the action): “Thou art kind.”<br />
                <i>Thee</i> = you (receiving it): “I thank thee.”<br />
                <i>Thy/Thine</i> = your: “thy sword,” “thine eyes.”
              </div>
              <div className="tip-card">
                <b>-est and -eth endings</b><br />
                With <i>thou</i>, verbs take <b>-est</b>: “thou knowest.”<br />
                With he/she/it, verbs take <b>-eth</b>: “she loveth.”<br />
                <i>Hath</i> = has. <i>Doth</i> = does.
              </div>
              <div className="tip-card">
                <b>False friends</b><br />
                <i>Wherefore</i> = why (not where!).<br />
                <i>Presently</i> = right now. <i>Still</i> = always.<br />
                <i>Nice</i> = fussy. <i>Sad</i> = serious. <i>Brave</i> = splendid.
              </div>
              <div className="tip-card">
                <b>Mild oaths, decoded</b><br />
                <i>Marry!</i> = “by the Virgin Mary.”<br />
                <i>Zounds!</i> = “by God&apos;s wounds.”<br />
                <i>&apos;Sblood!</i> = “by God&apos;s blood.” Scandalous stuff, then.
              </div>
            </div>

            <h3>The Word-Hoard</h3>
            <div className="search-row">
              <input
                type="text"
                value={glossFilter}
                onChange={(e) => setGlossFilter(e.target.value)}
                placeholder="Search a word… e.g. anon, fardel, wherefore"
              />
            </div>
            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              <table className="gloss-table">
                <thead>
                  <tr><th>Word</th><th>Meaning</th><th>Note</th></tr>
                </thead>
                <tbody>
                  {glossEntries.length ? (
                    glossEntries.map(([w, e]) => (
                      <tr key={w}>
                        <td className="gloss-word">{w}</td>
                        <td>{e[0]}</td>
                        <td className="gloss-note">{e[1]}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} style={{ fontStyle: "italic", color: "var(--ink-soft)" }}>
                        Naught found. The Bard kept no such word.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <h3>Famous Lines the Translator Recognises</h3>
            {FAMOUS_LINES.map((f) => (
              <div className="quote-box" style={{ fontSize: "0.92rem" }} key={f.match}>
                “{f.match[0].toUpperCase() + f.match.slice(1)}…”
                <span className="quote-src">— {f.source}. {f.gist}</span>
              </div>
            ))}
            <div className="btn-row">
              <button className="btn secondary" onClick={downloadGlossary}>
                📜 Download the Whole Word-Hoard (.txt)
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ============ ERA SPEAK (Generational Translator) ============ */}
      {tab === "era" && (
        <section className="tab active">
          <div className="panel">
            <p className="direction-label">The Generational Translator — the Bard, four hundred years of slang deep</p>
            <p style={{ fontSize: "0.9rem", color: "var(--ink-soft)", margin: "0.3rem 0 0.7rem" }}>
              Pick a passage from the Folger corpus (or paste your own), choose a generation, and hear the Bard
              speak it. Then attempt it yourself and measure thy fidelity against the original.
            </p>
            <div className="swap-row">
              <button className={"btn small " + (eraMode === "folio" ? "" : "secondary")} onClick={() => setEraMode("folio")}>
                📜 From the Folio
              </button>
              <button className={"btn small " + (eraMode === "free" ? "" : "secondary")} onClick={() => setEraMode("free")}>
                ✒ Free Text
              </button>
              <label style={{ fontSize: "0.85rem", marginLeft: "auto" }}>
                <input type="checkbox" checked={schoolSafe} onChange={(e) => setSchoolSafe(e.target.checked)} style={{ marginRight: 4 }} />
                Keep it school-safe
              </label>
            </div>

            {eraMode === "folio" && (
              <div className="controls">
                <label htmlFor="eraWorkSel">Work:</label>
                <select id="eraWorkSel" value={eraCode} onChange={(e) => loadEraWork(e.target.value)}>
                  <option value="">— choose from the Folger shelves —</option>
                  {(eraIdx || []).map((w) => (
                    <option key={w.code} value={w.code}>
                      {w.title} ({w.kind})
                    </option>
                  ))}
                </select>
                {eraWork && eraWork.units?.length > 1 && (
                  <>
                    <label htmlFor="eraUnitSel">Act:</label>
                    <select id="eraUnitSel" value={eraUnit} onChange={(e) => { setEraUnit(+e.target.value); setEraScene(0); setEraOut(null); }}>
                      {eraWork.units.map((u, i) => (
                        <option key={i} value={i}>Act {u.label}</option>
                      ))}
                    </select>
                  </>
                )}
                {eraWork && eraWork.units?.[eraUnit]?.scenes?.length > 1 && (
                  <>
                    <label htmlFor="eraSceneSel">Scene:</label>
                    <select id="eraSceneSel" value={eraScene} onChange={(e) => { setEraScene(+e.target.value); setEraOut(null); }}>
                      {eraWork.units[eraUnit].scenes.map((s, i) => (
                        <option key={i} value={i}>Scene {s.label}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}

            {eraMode === "free" && (
              <textarea
                value={eraFree}
                onChange={(e) => { setEraFree(e.target.value); setEraOut(null); }}
                placeholder="Paste any passage here — Shakespeare's or thine own…"
              />
            )}

            <div className="era-chips">
              {ERAS.map((e) => (
                <button
                  key={e.id}
                  className={"era-chip" + (eraId === e.id ? " active" : "")}
                  onClick={() => { setEraId(e.id); setEraOut(null); setEraScore(null); }}
                  title={e.tagline}
                >
                  {e.name}
                  <small>{e.years}</small>
                </button>
              ))}
            </div>

            <div className="btn-row" style={{ alignItems: "center" }}>
              <button className="btn" onClick={renderEra}>Speak in {ERAS.find((x) => x.id === eraId)?.name}!</button>
              <span className="slider-wrap">
                <label htmlFor="eraDensity">Slang level:</label>
                <select id="eraDensity" value={eraDensity} onChange={(e) => setEraDensity(+e.target.value)}>
                  <option value={0}>A dash</option>
                  <option value={1}>Sprinkled</option>
                  <option value={2}>Drenched</option>
                </select>
              </span>
            </div>
          </div>

          {eraOut && (
            <div className="panel">
              <div className="era-grid">
                {eraOut.rows.map((r, i) => (
                  <div className="era-card" key={i}>
                    <div className="era-src">
                      {r.speaker && r.speaker !== "⌂" && <b>{r.speaker}</b>}
                      {r.ref && <span className="era-ref"> {r.ref}</span>}
                      <p>{r.src}</p>
                    </div>
                    <div className="era-render">
                      <p>{r.era}</p>
                      {r.swaps.length > 0 && (
                        <p className="era-swaps">
                          {r.swaps.slice(0, 4).map((s, j) => (
                            <span key={j}>{s.from} → {s.to}</span>
                          ))}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="btn-row">
                <button className="btn secondary" onClick={() => speak(eraOut.rows.map((r) => r.era).join(" "), { voiceId })}>
                  🔊 Hear the Era
                </button>
                <button className="btn secondary" onClick={stopSpeech}>⏹ Silence</button>
                <button className="btn secondary" onClick={downloadEraScroll}>📜 Download Scroll (.txt)</button>
              </div>

              {/* attempt-first challenge: the student renders, THEN Bardify weighs fidelity */}
              {eraOut.rows.some((r) => r.speaker !== "⌂") && (
                <div className="famous" style={{ marginTop: "0.9rem" }}>
                  🎯 <strong>Thy turn, student.</strong> Render that first line in {ERAS.find((x) => x.id === eraOut.eraId)?.name}
                  thyself — then measure how faithfully thou kept'st the Bard's meaning.
                  <textarea
                    style={{ marginTop: "0.5rem" }}
                    value={eraChallenge}
                    onChange={(e) => { setEraChallenge(e.target.value); setEraScore(null); }}
                    placeholder="Write thine own era-render here…"
                  />
                  <div className="btn-row">
                    <button className="btn small" onClick={measureFidelity}>Reveal &amp; Measure Fidelity</button>
                  </div>
                  {eraScore && (
                    <div className="score-box">
                      <div className={"score-num " + (eraScore.score >= 70 ? "good" : eraScore.score >= 40 ? "mid" : "low")}>
                        {eraScore.score}<small>/100</small>
                      </div>
                      <div>
                        <p><b>{eraScore.kept.length}</b> of {eraScore.kept.length + eraScore.missed.length} meaning-anchors kept
                          — {eraScore.eraFlair} era flourishes found.</p>
                        {eraScore.missed.length > 0 && (
                          <p>Missed meanings: {eraScore.missed.map((m) => <code key={m} style={{ marginRight: 6 }}>{m}</code>)}</p>
                        )}
                        <p style={{ fontSize: "0.85rem", fontStyle: "italic" }}>
                          Bardify&apos;s own render, for comparison: &ldquo;{(eraOut.rows.find((r) => r.speaker !== "⌂") || eraOut.rows[0]).era.slice(0, 140)}&rdquo;
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <footer>❦ All quotations from the works of William Shakespeare (1564–1616), who cannot sue. ❦</footer>
    </div>
  );
}
