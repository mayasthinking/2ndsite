import { describe, expect, it, vi } from 'vitest'
import { FeatureFlagClient } from '../src/client'
import type { FeatureFlag } from '../src/types'

describe('FeatureFlagClient', () => {
  it('fetches and caches flags during init', async () => {
    const flags: FeatureFlag[] = [
      {
        name: 'Checkout redesign',
        key: 'checkout_redesign',
        enabled: true,
        variants: [
          { key: 'control', value: 'off' },
          { key: 'treatment', value: 'on' },
        ],
      },
    ]

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => flags,
    })

    const client = new FeatureFlagClient({
      apiBaseUrl: 'http://localhost:4000',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await client.init()

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const evaluation = client.evaluate('checkout_redesign', { userId: 'abc' })
    expect(evaluation.enabled).toBe(true)
    expect(evaluation.variant).toBeDefined()
    expect(client.getCachedFlags()).toHaveLength(1)
  })
})
