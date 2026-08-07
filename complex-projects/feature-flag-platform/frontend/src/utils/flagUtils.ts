import type { EvaluationResult, FeatureFlag, FlagVariant } from '../types/flags'

function hashString(input: string): number {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

export function parseContextJson(input: string): {
  value: Record<string, unknown> | null
  error: string | null
} {
  if (!input.trim()) {
    return { value: {}, error: null }
  }

  try {
    const parsed = JSON.parse(input) as unknown
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      return { value: null, error: 'Context must be a JSON object.' }
    }
    return { value: parsed as Record<string, unknown>, error: null }
  } catch {
    return { value: null, error: 'Invalid JSON context.' }
  }
}

export function selectVariant(flag: FeatureFlag, context: Record<string, unknown>): FlagVariant | undefined {
  if (flag.variants.length === 0) {
    return undefined
  }

  const forcedVariant = context.forceVariantKey
  if (typeof forcedVariant === 'string') {
    const match = flag.variants.find((variant) => variant.key === forcedVariant)
    if (match) {
      return match
    }
  }

  const stableInput = `${flag.key}:${JSON.stringify(context)}`
  const variantIndex = hashString(stableInput) % flag.variants.length
  return flag.variants[variantIndex]
}

export function evaluateLocally(
  flag: FeatureFlag | undefined,
  context: Record<string, unknown>,
): EvaluationResult {
  if (!flag) {
    return {
      flagKey: '',
      enabled: false,
      reason: 'Flag was not found in local cache.',
    }
  }

  if (!flag.enabled) {
    return {
      flagKey: flag.key,
      enabled: false,
      reason: 'Flag is disabled.',
    }
  }

  const variant = selectVariant(flag, context)
  return {
    flagKey: flag.key,
    enabled: true,
    variant,
    reason: variant ? 'Evaluated locally with deterministic variant selection.' : 'Flag is on.',
  }
}
