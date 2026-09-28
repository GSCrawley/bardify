# Bardify 🪶

**The Two-Tongued Quill** — translate modern English to Shakespearean prose and back, forge skits in the Bard's tongue, fire genuine Shakespearean insults, and study Early Modern English.

Built from the vocabulary, grammar, and lines of Shakespeare's actual plays and sonnets.

## Features

- **Translate** — two-way rule engine: thou/thee/thy pronoun grammar, -est/-eth verb endings, question inversion (didst thou), poetic contractions ('tis, o'er, ne'er), a vocabulary drawn from the plays, and an adjustable "Ham level" (Subtle → Full Ham 🍖). Shakespearean → Modern mode produces a per-passage student glossary and recognises 20 famous passages with act/scene citations.
- **Script Forge** — write a skit in plain English with characters and stage directions ("Exit, pursued by a bear" included); get a formatted play script, performable aloud with a different voice per character, downloadable as .txt.
- **Insult Cannon** — genuine barbs from the plays with citations, plus fresh ones assembled from Shakespeare's own insult vocabulary.
- **Study Hall** — searchable ~200-word glossary of Early Modern English, grammar cheat-cards, false friends, famous-lines reference.
- **🕰 Era Speak (Generational Translator)** — rewind (or fast-forward) the Bard: render any line into Gen Alpha, Gen Z, Millennial, Gen X, Boomer, or 1920s Jazz Age slang. Browse any act and scene of the full Folger corpus (all plays, sonnets, and narrative poems — 120k+ lines), or paste your own text. Stage-meaning fidelity is scored on 
  the **attempt-first** principle: the student renders a line in an era first, then Bardify reveals its own render and measures how many meaning-anchors survived. Adjustable slang density and a school-safe profanity tier (light cussing off by default) make it classroom-ready.
- **🏆 Hall of Fame (Class Leaderboard)** — attempt-first, made competitive. After a fidelity score is measured, the student notches it to the board with a stage name. Only sealed attempts (no peeking at Bardify's render first) may enter the board — peeked runs are practice, not proof. Offline and device-local (localStorage), ranked with medals, filterable by era, resettable per class period, and exportable to CSV for grade books.
- **Voice** — ElevenLabs text-to-speech via a server-side API route (`/api/tts`), with the browser's built-in speech synthesis as automatic fallback.

## Stack

Next.js (App Router) · React · no other dependencies. The translation engine is pure JavaScript in `lib/engine.js` with its corpus in `lib/data.js`; the Generational Translator lives in `lib/generational.js` with its era lexicon in `lib/generations.js` (a hand-curated, ~90-anchor meaning map — verify-before-trust, no AI at runtime, all citations point at the Folio).

### The full-corpus pipeline

`public/corpus/` holds a JSON render of the complete [Folger Shakespeare](https://folger.edu) texts (per work: acts → scenes → speaker-attributed lines with act.scene.line references). Rebuild it from source TEI with:

```bash
node scripts/build-corpus.mjs   # reads TEI XML zips from scripts/corpus-src/ (gitignored, 197MB)
```

Text © Folger Shakespeare Library, licensed free for **non-commercial** use — fine while Bardify is free; revisit the terms before any monetization.

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## ElevenLabs voice setup

1. Get an API key at elevenlabs.io (profile → API Keys).
2. In Vercel: Project → Settings → Environment Variables → add `ELEVENLABS_API_KEY`.
3. Optional: set `ELEVENLABS_MODEL_ID` (defaults to `eleven_multilingual_v2`).
4. Redeploy. Without the key, the app quietly uses browser voices.

## License

Code: MIT. Quotations: William Shakespeare (1564–1616), public domain — he cannot sue.
