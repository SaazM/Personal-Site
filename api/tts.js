// GET /api/tts?text=...&sig=... — streams mp3 of the avatar's voice.
// sig is the HMAC that /api/ask issued for exactly this text, so this
// endpoint can't be used as a free TTS proxy for arbitrary content.

import { timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { sign } from "./ask.js";

export default async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const text = url.searchParams.get("text") || "";
  const sig = url.searchParams.get("sig") || "";

  if (!text || text.length > 1200 || !sig) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "bad_request" }));
  }

  const expected = sign(text);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: "bad_signature" }));
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = "NkKp7kXG9NGsWVOyZ6w2";
  if (!apiKey) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: "voice_offline" }));
  }

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { speed: 1.1 },
      }),
    },
  );

  if (!upstream.ok || !upstream.body) {
    console.error(
      "elevenlabs:",
      upstream.status,
      await upstream.text().catch(() => ""),
    );
    res.statusCode = 502;
    return res.end(JSON.stringify({ error: "voice_error" }));
  }

  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "no-store",
  });
  // Progressive mp3: the <audio> element starts playing before this finishes.
  Readable.fromWeb(upstream.body).pipe(res);
}
