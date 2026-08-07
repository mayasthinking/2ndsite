export interface FlagVariant {
  key: string
  value: string
}

export interface FeatureFlag {
  name: string
  key: string
  enabled: boolean
  variants: FlagVariant[]
}

export type EvaluationContext = Record<string, unknown>

export interface EvaluationResult {
  flagKey: string
  enabled: boolean
  variant?: FlagVariant
  reason: string
  source: 'cache'
}

export interface FeatureFlagClientOptions {
  apiBaseUrl?: string
  flagsEndpoint?: string
  pollingIntervalMs?: number
  fetchImpl?: typeof fetch
}
