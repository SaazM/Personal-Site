// Local dev server: static files + /api functions, no Vercel login needed.
// Production uses Vercel's native function hosting; this file is dev-only.
// Reads .env.local for API keys if present.

import http from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHome } from "./render-home.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sitePath = join(root, "content", "site.json");
const port = Number(process.env.PORT) || 3000;

// .env.local → process.env (KEY=VALUE lines, # comments)
const envFile = join(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#")) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
  console.log("loaded .env.local");
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".md": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 2_000_000) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function validateSite(data) {
  if (!data || typeof data !== "object") return "body must be a JSON object";
  for (const key of ["meta", "header", "writing", "footer"]) {
    if (!data[key] || typeof data[key] !== "object") return `missing ${key}`;
  }
  for (const key of ["experience", "projects", "hackathons", "education"]) {
    if (!Array.isArray(data[key])) return `${key} must be an array`;
  }
  if (!Array.isArray(data.writing.items)) return "writing.items must be an array";
  return null;
}

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;

  if (path === "/api/content") {
    if (req.method === "GET" || req.method === "HEAD") {
      if (!existsSync(sitePath)) return json(res, 404, { error: "site.json missing" });
      const body = readFileSync(sitePath);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      return res.end(req.method === "HEAD" ? undefined : body);
    }
    if (req.method === "POST") {
      try {
        const raw = await readBody(req);
        const data = JSON.parse(raw);
        const err = validateSite(data);
        if (err) return json(res, 400, { error: err });
        writeFileSync(sitePath, JSON.stringify(data, null, 2) + "\n");
        buildHome();
        return json(res, 200, { ok: true });
      } catch (e) {
        return json(res, 400, { error: e.message || "invalid JSON" });
      }
    }
    res.statusCode = 405;
    return res.end("method not allowed");
  }

  if (path === "/api/ask") {
    const { default: ask } = await import("../api/ask.js");
    return ask(req, res);
  }
  if (path === "/api/tts") {
    const { default: tts } = await import("../api/tts.js");
    return tts(req, res);
  }

  // Static: resolve, block traversal, serve index.html for directories.
  let file = normalize(join(root, decodeURIComponent(path)));
  if (!file.startsWith(root)) {
    res.statusCode = 403;
    return res.end("forbidden");
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) {
    res.statusCode = 404;
    return res.end("not found");
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});

server.listen(port, () => console.log(`dev server → http://localhost:${port}`));
