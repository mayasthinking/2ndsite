# Self-Hosted Feature Flag + Experimentation Platform Architecture

## 1) Problem Statement

Modern product teams need to release features safely, target functionality to specific user cohorts, and run controlled experiments without coupling release risk to deploy cycles. Many teams rely on hosted feature flag services, but regulated organizations, cost-sensitive companies, and on-premise deployments require a self-hosted alternative with strong tenant isolation, low-latency evaluation, and reliable experiment analytics.

This project builds a self-hosted platform that provides:
- Feature flag management with environment-specific configuration.
- Deterministic low-latency flag evaluation for server and client SDKs.
- Progressive rollouts, targeting rules, and kill switches.
- A/B experimentation primitives (impressions, conversions, assignment tracking).
- Operational controls for audit, security, and multi-tenant deployment.

## 2) Target Users

### Primary Users
- **Application engineers**: Integrate SDKs and evaluate flags in runtime code paths.
- **Product managers / growth teams**: Configure rollouts and experiments.
- **SRE / platform engineers**: Operate and scale the platform.
- **Security/compliance teams**: Validate tenancy boundaries and audit trails.

### Typical Use Cases
- Roll out a risky feature to 5% of production traffic, then ramp to 100%.
- Enable a feature for a specific customer segment only.
- Run an A/B test on checkout flow and measure conversion lift.
- Instantly disable a problematic flag via kill switch.

## 3) System Components

## 3.1 High-Level Topology

1. **Admin UI** (control plane): manages projects, flags, experiments, targeting.
2. **API Service** (control + ingestion plane): CRUD APIs, authz, SDK config endpoints, event ingest endpoints.
3. **Evaluator Service** (data plane): low-latency flag evaluation with deterministic bucketing.
4. **SDKs** (server-side and client-side): local cache, periodic streaming sync, exposure/conversion event emitters.
5. **Data Store**: relational primary store for configuration and metadata; cache for hot reads.
6. **Event Stream**: durable queue/bus for impression/conversion events and downstream analytics workers.
7. **Analytics Pipeline**: stream processors + warehouse tables + metrics/statistics service.

## 3.2 Component Responsibilities

### API Service
- Tenant/project/environment scoped management APIs.
- Authentication and RBAC enforcement.
- Publishes configuration change events.
- Receives high-volume SDK event ingestion batches.

### Evaluator Service
- Evaluates flags by applying rules in priority order.
- Supports percentage rollouts using stable hashing (`entity_id + flag_key + salt`).
- Returns variation and reason metadata.
- Caches active flag definitions per environment.

### SDK Layer
- Retrieves bootstrap configuration from API.
- Receives updates via streaming channel (SSE/WebSocket) with polling fallback.
- Evaluates locally where possible to minimize request latency.
- Emits impression and conversion events asynchronously.

### Admin UI
- Flag and experiment lifecycle workflows.
- Rule builder, segment manager, and rollout scheduler.
- Experiment result dashboards and alerting hooks.
- Audit trail views and approval workflow support.

### Data Store
- **PostgreSQL** (or equivalent): source of truth for control-plane entities.
- **Redis** (or equivalent): low-latency cache for active environment snapshots.
- Partitioned analytics tables or warehouse sink for large event volumes.

### Event Stream
- Kafka/Redpanda/NATS JetStream style event bus.
- Topics: `flag-config-changes`, `impressions`, `conversions`, `dead-letter-events`.
- At-least-once delivery with idempotent consumers.

## 4) Data Model

All core records are tenant-scoped (`tenant_id`) to enforce hard isolation boundaries.

## 4.1 Core Entities

- Tenant
- User
- Project
- Environment
- SDK Key
- Feature Flag
- Flag Rule
- Segment
- Experiment
- Variation
- Assignment (optional explicit assignment ledger)
- Event (impression, conversion)
- Audit Log

## 4.2 Example JSON Shapes

### Tenant
```json
{
  "id": "ten_01HR4NQ5G6",
  "name": "Acme Corp",
  "plan": "enterprise",
  "created_at": "2026-03-10T00:00:00Z"
}
```

### Feature Flag
```json
{
  "id": "ff_01HR4W8YJ8",
  "tenant_id": "ten_01HR4NQ5G6",
  "project_id": "proj_checkout",
  "environment_id": "env_prod",
  "key": "checkout_redesign",
  "name": "Checkout Redesign",
  "status": "active",
  "salt": "d8275ce7",
  "default_variation": "control",
  "variations": [
    { "key": "control", "payload": { "enabled": false } },
    { "key": "treatment", "payload": { "enabled": true } }
  ],
  "rules": [
    {
      "id": "rule_1",
      "priority": 10,
      "type": "segment_match",
      "segment_id": "seg_beta_users",
      "serve": "treatment"
    },
    {
      "id": "rule_2",
      "priority": 20,
      "type": "percentage_rollout",
      "rollout": [
        { "variation": "control", "weight": 50 },
        { "variation": "treatment", "weight": 50 }
      ]
    }
  ],
  "version": 18,
  "updated_at": "2026-03-10T00:00:00Z"
}
```

### Experiment
```json
{
  "id": "exp_checkout_button_color",
  "tenant_id": "ten_01HR4NQ5G6",
  "project_id": "proj_checkout",
  "environment_id": "env_prod",
  "flag_key": "checkout_redesign",
  "status": "running",
  "hypothesis": "Treatment increases completed checkout rate",
  "primary_metric": "checkout_completed",
  "guardrail_metrics": ["payment_error_rate"],
  "start_at": "2026-03-15T00:00:00Z",
  "end_at": null
}
```

### Impression Event
```json
{
  "event_id": "evt_01HR52A4QK",
  "tenant_id": "ten_01HR4NQ5G6",
  "project_id": "proj_checkout",
  "environment_id": "env_prod",
  "type": "impression",
  "timestamp": "2026-03-10T00:00:00Z",
  "entity_id": "user_12345",
  "flag_key": "checkout_redesign",
  "variation": "treatment",
  "experiment_id": "exp_checkout_button_color",
  "context": {
    "country": "US",
    "device": "mobile"
  }
}
```

### Conversion Event
```json
{
  "event_id": "evt_01HR52C2R9",
  "tenant_id": "ten_01HR4NQ5G6",
  "project_id": "proj_checkout",
  "environment_id": "env_prod",
  "type": "conversion",
  "timestamp": "2026-03-10T00:01:12Z",
  "entity_id": "user_12345",
  "metric_key": "checkout_completed",
  "value": 1,
  "experiment_id": "exp_checkout_button_color"
}
```

## 5) API Surface Outline (REST)

Base path: `/api/v1`

### Auth and Identity
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /me`

### Tenant / Project / Environment
- `GET /tenants`
- `POST /tenants`
- `GET /tenants/{tenantId}`
- `GET /tenants/{tenantId}/projects`
- `POST /tenants/{tenantId}/projects`
- `GET /projects/{projectId}/environments`
- `POST /projects/{projectId}/environments`

### Flags and Targeting
- `GET /environments/{environmentId}/flags`
- `POST /environments/{environmentId}/flags`
- `GET /flags/{flagId}`
- `PATCH /flags/{flagId}`
- `POST /flags/{flagId}/publish`
- `POST /flags/{flagId}/archive`
- `GET /segments`
- `POST /segments`
- `PATCH /segments/{segmentId}`

### Evaluation and Config Distribution
- `POST /evaluate` (single evaluation)
- `POST /evaluate/batch`
- `GET /sdk/bootstrap` (full config snapshot for SDK key)
- `GET /sdk/stream` (SSE stream for config updates)

### Experiments
- `GET /experiments`
- `POST /experiments`
- `GET /experiments/{experimentId}`
- `PATCH /experiments/{experimentId}`
- `POST /experiments/{experimentId}/start`
- `POST /experiments/{experimentId}/stop`
- `GET /experiments/{experimentId}/results`

### Event Ingestion
- `POST /events/impressions:batch`
- `POST /events/conversions:batch`
- `GET /events/schema`

### Audit and Admin
- `GET /audit-logs`
- `GET /sdk-keys`
- `POST /sdk-keys`
- `POST /sdk-keys/{keyId}/rotate`

## 6) Real-Time Update Approach

1. Admin changes a flag in UI and publishes configuration.
2. API service writes new version to primary store and cache, then emits `flag-config-changes` event.
3. SDK stream service pushes change notices over SSE/WebSocket to subscribed SDK clients.
4. SDK validates monotonic version, fetches delta/full snapshot if required, and atomically swaps local in-memory config.
5. Fallback path: periodic polling with `If-None-Match`/`ETag` to avoid excess payload.

Key design details:
- Versioned environment snapshots for deterministic rollback.
- Idempotent update handling in SDKs.
- Backoff and jitter for reconnect storms.
- Optional regional relay nodes for low-latency fan-out.

## 7) Experimentation Analytics Pipeline

## 7.1 Event Lifecycle

1. SDK emits **impression** at evaluation time (once per exposure key window, with dedupe token).
2. Application emits **conversion** event when a metric action occurs.
3. API ingests batches, performs schema validation and tenant-level auth checks.
4. Events are appended to stream; invalid or oversized records go to dead-letter topic.
5. Stream processors normalize, deduplicate (`event_id`), and enrich with assignment metadata.
6. Aggregation jobs compute daily/hourly metric tables by experiment and variation.
7. Statistics service computes lift, confidence intervals, p-values (or Bayesian posterior, configurable).
8. Results endpoint and dashboard read from materialized views.

## 7.2 Analytics Correctness Concerns
- Late arrivals handled with watermark windows and backfill jobs.
- Idempotency keys prevent duplicate counting.
- Time synchronization and UTC-normalized event timestamps.
- Guardrails for sample ratio mismatch and novelty effects.

## 8) Security and Tenancy Model

## 8.1 Authentication and Authorization
- OIDC/SAML SSO support for enterprise tenants.
- Short-lived JWT access tokens; refresh token rotation.
- RBAC roles: `owner`, `admin`, `editor`, `analyst`, `viewer`.
- Fine-grained permissions by project/environment.

## 8.2 Tenant Isolation
- Every table includes `tenant_id`; queries enforce tenant predicate in repository layer.
- Optional database row-level security policies for defense in depth.
- Per-tenant SDK keys with scoped environment access.
- Encryption at rest and TLS in transit.

## 8.3 Security Controls
- Secrets managed via vault/KMS integration.
- Audit logs for all write operations and access to sensitive endpoints.
- Rate limits and WAF rules on ingestion/evaluation endpoints.
- Key rotation workflow and compromised key revocation.

## 9) Scaling and Reliability Concerns

## 9.1 Performance Targets (initial)
- P50 evaluation latency < 5 ms (local SDK) / < 20 ms (remote evaluate API).
- P99 evaluation latency < 50 ms.
- Event ingestion throughput: 50k+ events/sec per cluster (horizontally scalable).
- Control-plane publish propagation to SDKs: < 2 seconds p95.

## 9.2 Scaling Strategy
- Stateless API/evaluator pods behind load balancers.
- Redis cache sharding for hot configuration paths.
- Stream topic partitioning by tenant/project for parallel processing.
- Read replicas and partitioned analytics tables for heavy queries.

## 9.3 Reliability Strategy
- Multi-AZ deployment for critical services.
- Circuit breakers and retries with jitter between services.
- Durable event log + replay capability for analytics recovery.
- Graceful degradation: SDKs continue serving last known good config when control plane is unavailable.

## 10) Testing Strategy

- **Unit tests**: rule evaluation engine, bucketing determinism, permission checks.
- **Contract tests**: SDK <-> API schema compatibility and backward compatibility.
- **Integration tests**: end-to-end flow (publish flag -> SDK update -> impression ingestion -> results).
- **Load/perf tests**: evaluation and ingest endpoints under projected production traffic.
- **Fault-injection tests**: stream lag, cache outage, partial DB outage, reconnect storms.
- **Security tests**: authz bypass attempts, tenant data leakage checks, key misuse scenarios.
- **Statistical validation tests**: experiment math correctness against known datasets.

## 11) 3-Milestone Roadmap

| Milestone | Scope | Exit Criteria |
|---|---|---|
| **MVP (Milestone 1)** | Core flag CRUD, local evaluation SDK (one language), basic targeting (attribute + percentage rollout), manual publish, impression ingestion, simple dashboard | Teams can create flags, evaluate in production app, and see exposure counts; kill switch works reliably |
| **Beta (Milestone 2)** | Multi-SDK support, realtime config streaming, experiment entity + conversion tracking, RBAC, audit logs, initial statistical reporting | At least 2 pilot tenants run real experiments with reliable assignment and conversion attribution |
| **Production (Milestone 3)** | HA deployment patterns, SSO/SAML, key rotation automation, advanced analytics/guardrails, operational tooling, SLO monitoring and alerting | Platform meets SLOs, passes security review, supports multi-tenant self-hosted rollout with runbook coverage |

## 12) Open Design Decisions (to finalize early)

- Choice of stream backbone (Kafka vs managed-compatible alternatives).
- Default statistical method (frequentist vs Bayesian) and user-facing interpretation model.
- Whether to support remote evaluation for client SDKs in strict privacy environments.
- Data retention defaults for raw events versus aggregated experiment metrics.
