"use client";

import { useMemo, useState } from "react";
import {
  toShakespeare,
  toModern,
  generateInsult,
  quoteForTheme,
} from "../lib/engine.js";
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

      <footer>❦ All quotations from the works of William Shakespeare (1564–1616), who cannot sue. ❦</footer>
    </div>
  );
}
