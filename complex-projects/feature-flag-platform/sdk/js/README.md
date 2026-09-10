# Feature Flag Platform JS SDK

Lightweight TypeScript SDK for evaluating feature flags from a self-hosted API.

## Install

```bash
npm install @feature-flag-platform/js-sdk
```

## Quick start

```ts
import { initFeatureFlagClient } from '@feature-flag-platform/js-sdk'

const client = await initFeatureFlagClient({
  apiBaseUrl: process.env.FEATURE_FLAG_API_BASE_URL,
})

const result = client.evaluate('checkout_redesign', {
  userId: 'u-123',
  country: 'US',
})

console.log(result.enabled, result.variant)
```

## Configuration

`FeatureFlagClient` accepts:

- `apiBaseUrl` (default: `process.env.FEATURE_FLAG_API_BASE_URL` or `http://localhost:4000`)
- `flagsEndpoint` (default: `/api/flags`)
- `pollingIntervalMs` (optional interval to refresh cache automatically)
- `fetchImpl` (optional custom fetch implementation)

## Polling example

```ts
import { FeatureFlagClient } from '@feature-flag-platform/js-sdk'

const client = new FeatureFlagClient({
  apiBaseUrl: 'http://localhost:4000',
  pollingIntervalMs: 30000,
})

await client.init()
const flagResult = client.evaluate('new_pricing', { accountId: 'acct-42' })

client.destroy()
```
