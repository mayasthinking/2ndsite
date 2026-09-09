#!/usr/bin/env node

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import commonsHandler from "../api/commons.mjs";
import metHandler from "../api/met.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || "::";

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/jsonl; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function queryObject(searchParams) {
  const query = {};
  for (const [key, value] of searchParams) query[key] = value;
  return query;
}

function vercelRes(res) {
  return {
    statusCode: 200,
    setHeader(name, value) {
      res.setHeader(name, value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      res.statusCode = this.statusCode;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(payload));
    },
  };
}

async function serveApi(handler, req, res, url) {
  await handler({ method: req.method || "GET", query: queryObject(url.searchParams) }, vercelRes(res));
}

async function serveFile(req, res, url) {
  let relative = decodeURIComponent(url.pathname);
  if (relative.endsWith("/")) relative += "index.html";
  const filePath = normalize(join(ROOT, relative));
  const rootWithSep = ROOT.endsWith(sep) ? ROOT : `${ROOT}${sep}`;
  if (filePath !== ROOT && !filePath.startsWith(rootWithSep)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    const resolved = info.isDirectory() ? join(filePath, "index.html") : filePath;
    const data = await readFile(resolved);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(resolved).toLowerCase()] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("File not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/api/commons") {
      await serveApi(commonsHandler, req, res, url);
      return;
    }
    if (url.pathname === "/api/met") {
      await serveApi(metHandler, req, res, url);
      return;
    }
    await serveFile(req, res, url);
  } catch (error) {
    console.error("preview failed", error);
    if (!res.headersSent) res.writeHead(500);
    res.end("preview failed");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`preview on http://localhost:${PORT}`);
});
