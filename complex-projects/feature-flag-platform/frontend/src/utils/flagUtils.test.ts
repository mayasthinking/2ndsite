import { describe, expect, it } from 'vitest'
import { evaluateLocally, parseContextJson } from './flagUtils'
import type { FeatureFlag } from '../types/flags'

describe('flagUtils', () => {
  it('parses valid context JSON', () => {
    const result = parseContextJson('{"userId":"u-1"}')
    expect(result.error).toBeNull()
    expect(result.value).toEqual({ userId: 'u-1' })
  })

  it('evaluates an enabled flag deterministically', () => {
    const flag: FeatureFlag = {
      name: 'Search ranking test',
      key: 'search_ranking_test',
      enabled: true,
      variants: [
        { key: 'control', value: 'off' },
        { key: 'treatment', value: 'on' },
      ],
    }

    const first = evaluateLocally(flag, { userId: 'abc' })
    const second = evaluateLocally(flag, { userId: 'abc' })
    expect(first.variant).toEqual(second.variant)
    expect(first.enabled).toBe(true)
  })
})
