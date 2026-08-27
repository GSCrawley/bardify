// Bardify TTS proxy — keeps the ElevenLabs API key server-side.
// Requires the ELEVENLABS_API_KEY environment variable in Vercel.
// Until the key is set, this returns 501 and the client falls back
// to the browser's built-in speech synthesis.

const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb"; // "George" — warm British narration
const MAX_CHARS = 2500;

export async function POST(request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "TTS not configured — set ELEVENLABS_API_KEY" },
      { status: 501 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = (body.text || "").toString().trim();
  if (!text) return Response.json({ error: "No text provided" }, { status: 400 });
  if (text.length > MAX_CHARS) {
    return Response.json(
      { error: `Text too long (max ${MAX_CHARS} characters)` },
      { status: 400 }
    );
  }

  const voiceId = /^[A-Za-z0-9]{10,40}$/.test(body.voiceId || "")
    ? body.voiceId
    : DEFAULT_VOICE;

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
        voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35 },
      }),
    }
  );

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return Response.json(
      { error: "ElevenLabs request failed", status: upstream.status, detail: detail.slice(0, 500) },
      { status: 502 }
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
