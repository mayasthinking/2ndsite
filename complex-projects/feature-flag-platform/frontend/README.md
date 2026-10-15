# Feature Flag Platform Frontend

React + TypeScript admin UI scaffold for:

- Listing feature flags
- Creating/editing flags (name, key, enabled, variants)
- Evaluating flags with a context JSON playground

## Setup

```bash
npm install
npm run dev
```

## Environment

Configure API base URL via:

```bash
VITE_API_BASE_URL=http://localhost:4000
```

The frontend expects:

- `GET /api/flags`
- `POST /api/flags`
- `PUT /api/flags/:key`
- `POST /api/evaluate`

If API calls fail, localStorage fallback is used for basic local scaffolding behavior.
