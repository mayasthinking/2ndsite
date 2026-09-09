# Agent Instructions

## Local preview / dev server

When the developer asks to start the dev server, start the preview, or start the server, `cd` into the root of the repo and run:

```bash
node scripts/preview.mjs
```

This serves the site and the Open Access `/api/commons` and `/api/met` proxies on port 8000, bound to IPv6 (`::`) so `localhost` works in Chrome. Plain `python3 -m http.server` 404s those API routes, so the library shelf never finishes loading.

Then share the local URL (typically `http://localhost:8000`) so they can preview the site.

If a server is already running in an existing terminal, reuse it instead of starting a duplicate.
