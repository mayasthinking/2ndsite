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

export interface EvaluationResult {
  flagKey: string
  enabled: boolean
  variant?: FlagVariant
  reason: string
}
