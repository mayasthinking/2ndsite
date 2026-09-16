# Feature Flag Platform Backend (Scaffold)

Node.js + TypeScript backend scaffold for a self-hosted feature flag and experimentation platform.

## What is included

- Express server (`src/server.ts`)
- Health endpoint (`GET /health`)
- CRUD APIs for:
  - Projects
  - Environments (scoped to project)
  - Flags (scoped to environment)
- JSON condition tree for targeting rules
- Evaluation endpoint for context-based flag resolution
- Event ingestion endpoint for impression/conversion tracking
- In-memory repositories (no external DB dependency)
- Repository interfaces for easy swap to DB-backed adapters
- Basic request validation (Zod) + centralized error handling
- Unit tests for evaluator + one API integration test

## Quick start

```bash
cd /workspace/complex-projects/feature-flag-platform/backend
npm install
npm run dev
```

Server runs at `http://localhost:4000` by default.

### Build and run

```bash
npm run build
npm start
```

### Run tests

```bash
npm test
```

## API examples

### Health

```bash
curl http://localhost:4000/health
```

### Create project

```bash
curl -X POST http://localhost:4000/projects \
  -H "Content-Type: application/json" \
  -d '{
    "key": "shop",
    "name": "Shop Platform",
    "description": "Main commerce application"
  }'
```

### Create environment

```bash
curl -X POST http://localhost:4000/projects/{projectId}/environments \
  -H "Content-Type: application/json" \
  -d '{
    "key": "prod",
    "name": "Production"
  }'
```

### Create flag with targeting rules

```bash
curl -X POST http://localhost:4000/projects/{projectId}/environments/{environmentId}/flags \
  -H "Content-Type: application/json" \
  -d '{
    "key": "new_checkout",
    "name": "New Checkout Flow",
    "enabled": true,
    "defaultVariant": "control",
    "defaultValue": false,
    "targetingRules": [
      {
        "name": "Internal users",
        "variant": "treatment",
        "value": true,
        "condition": {
          "op": "all",
          "conditions": [
            {
              "op": "match",
              "attribute": "user.isInternal",
              "comparator": "eq",
              "value": true
            },
            {
              "op": "match",
              "attribute": "request.country",
              "comparator": "in",
              "value": ["US", "CA"]
            }
          ]
        }
      }
    ]
  }'
```

### Evaluate flag

```bash
curl -X POST http://localhost:4000/projects/{projectId}/environments/{environmentId}/flags/new_checkout/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "user": {
        "isInternal": true
      },
      "request": {
        "country": "US"
      }
    }
  }'
```

### Ingest event

```bash
curl -X POST http://localhost:4000/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "impression",
    "projectId": "{projectId}",
    "environmentId": "{environmentId}",
    "flagKey": "new_checkout",
    "variant": "treatment",
    "context": {
      "user": {
        "id": "user-123"
      }
    }
  }'
```

## Project structure

```text
src/
  api/            # routes, schemas, HTTP helpers
  domain/         # models + domain errors
  evaluator/      # condition tree + flag evaluation logic
  repositories/   # interfaces + in-memory adapter
  services/       # business logic orchestration
  app.ts          # app factory
  server.ts       # runnable server entry
test/
  evaluator.test.ts
  api.evaluation.test.ts
```

## TODOs for production hardening

- Add authentication/authorization (e.g. service tokens, RBAC)
- Add rate limiting and payload size protections per endpoint
- Persist data in a DB and add migrations
- Add audit logging and immutable event storage
- Add request tracing/metrics and structured logs
- Harden schema validation for stricter contract versioning
