// GET /api/tts?text=...&sig=... — streams mp3 of the avatar's voice.
// sig is the HMAC that /api/ask issued for exactly this text, so this
// endpoint can't be used as a free TTS proxy for arbitrary content.
// GET with no params is a cold-start warmup (204).

import { timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { sign } from "../lib/sign.js";

// Flash is built for low TTFA; override with ELEVENLABS_MODEL if needed.
const TTS_MODEL = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";

export default async function handler(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  const text = url.searchParams.get("text") || "";
  const sig = url.searchParams.get("sig") || "";

  // Warmup / health — load this function without spending ElevenLabs quota.
  if (req.method === "HEAD" || (req.method === "GET" && !text)) {
    res.statusCode = 204;
    res.setHeader("Cache-Control", "no-store");
    return res.end();
  }

  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "method_not_allowed" }));
  }

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
        model_id: TTS_MODEL,
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
