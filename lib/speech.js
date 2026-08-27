// Bardify speech layer: ElevenLabs via /api/tts, with browser
// speechSynthesis as automatic fallback.

export const ELEVEN_VOICES = [
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George — warm British narrator" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel — deep British authority" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice — clear British lady" },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte — velvety and sly" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum — gravelly rogue" },
];

let elevenAvailable = null; // null = unknown, true/false once probed
let currentAudio = null;
let generation = 0;

export function stopSpeech() {
  generation++;
  if (currentAudio) {
    try { currentAudio.pause(); } catch {}
    currentAudio = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function speakBrowser(text, { rate = 0.9, pitch = 1 } = {}) {
  return new Promise((resolve) => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synth) return resolve(false);
    const u = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const gb = voices.find((v) => /en(-|_)GB/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang));
    if (gb) u.voice = gb;
    u.rate = rate;
    u.pitch = pitch;
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    synth.speak(u);
  });
}

async function speakEleven(text, voiceId, gen) {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voiceId }),
  });
  if (res.status === 501) { elevenAvailable = false; return null; }
  if (!res.ok) return null;
  const blob = await res.blob();
  if (gen !== generation) return true; // cancelled while fetching
  const url = URL.createObjectURL(blob);
  elevenAvailable = true;
  return new Promise((resolve) => {
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => { URL.revokeObjectURL(url); resolve(true); };
    audio.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    audio.play().catch(() => resolve(false));
  });
}

/**
 * Speak text. Tries ElevenLabs first (unless known unavailable),
 * falls back to the browser voice. Resolves when playback ends.
 */
export async function speak(text, opts = {}) {
  if (!text || !text.trim()) return false;
  stopSpeech();
  const gen = generation;
  if (elevenAvailable !== false) {
    const ok = await speakEleven(text.slice(0, 2400), opts.voiceId, gen);
    if (ok !== null) return ok;
  }
  if (gen !== generation) return false;
  return speakBrowser(text, opts);
}

/**
 * Perform a sequence of items: [{text, voiceId, pitch}].
 * Stops cleanly if stopSpeech() is called. onProgress(i) fires per item.
 */
export async function performSequence(items, onProgress) {
  stopSpeech();
  const gen = ++generation;
  for (let i = 0; i < items.length; i++) {
    if (gen !== generation) return;
    if (onProgress) onProgress(i);
    const it = items[i];
    if (elevenAvailable !== false) {
      const ok = await speakEleven(it.text.slice(0, 2400), it.voiceId, gen);
      if (ok !== null) continue;
    }
    if (gen !== generation) return;
    await speakBrowser(it.text, { rate: it.rate || 0.92, pitch: it.pitch || 1 });
  }
  if (onProgress && gen === generation) onProgress(-1);
}

export function elevenIsKnownUnavailable() {
  return elevenAvailable === false;
}
