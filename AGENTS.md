# Agent Instructions

## Local preview / dev server

When the developer asks to start the dev server, start the preview, or start the server, `cd` into the root of the repo and run:

```bash
python3 -m http.server --bind ::
```

Bind to `::` so `localhost` works when it resolves to IPv6 (`::1`). An IPv4-only bind (`0.0.0.0`) makes Chrome report `ERR_CONNECTION_REFUSED` on `http://localhost:8000`.

Then share the local URL (typically `http://localhost:8000`) so they can preview the site.

If a server is already running in an existing terminal, reuse it instead of starting a duplicate.
