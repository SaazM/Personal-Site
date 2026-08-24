// Shared HMAC for TTS auth. Lives outside /api so it isn't a public route,
// and stays tiny so /api/tts doesn't cold-start OpenAI + the corpus.

import { createHmac, randomBytes } from "node:crypto";

// If TTS_HMAC_SECRET isn't set, fall back to a per-instance secret. Fine in
// dev; in production set the env var so sigs verify across instances.
const HMAC_SECRET = process.env.TTS_HMAC_SECRET || randomBytes(32).toString("hex");

export function sign(text) {
  return createHmac("sha256", HMAC_SECRET).update(text).digest("hex");
}
