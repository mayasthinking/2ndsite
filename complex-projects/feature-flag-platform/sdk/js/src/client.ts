import type {
  EvaluationContext,
  EvaluationResult,
  FeatureFlag,
  FeatureFlagClientOptions,
  FlagVariant,
} from './types.js'

function resolveDefaultApiBaseUrl(): string {
  const maybeProcess = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }
  return maybeProcess.process?.env?.FEATURE_FLAG_API_BASE_URL ?? 'http://localhost:4000'
}

function hash(input: string): number {
  let value = 0
  for (let index = 0; index < input.length; index += 1) {
    value = (value << 5) - value + input.charCodeAt(index)
    value |= 0
  }
  return Math.abs(value)
}

function selectVariant(flag: FeatureFlag, context: EvaluationContext): FlagVariant | undefined {
  if (!flag.variants.length) {
    return undefined
  }

  const forcedVariant = context.forceVariantKey
  if (typeof forcedVariant === 'string') {
    const forcedMatch = flag.variants.find((variant) => variant.key === forcedVariant)
    if (forcedMatch) {
      return forcedMatch
    }
  }

  const key = `${flag.key}:${JSON.stringify(context)}`
  return flag.variants[hash(key) % flag.variants.length]
}

export class FeatureFlagClient {
  private readonly apiBaseUrl: string
  private readonly flagsEndpoint: string
  private readonly fetchImpl: typeof fetch
  private readonly pollingIntervalMs?: number
  private readonly cache = new Map<string, FeatureFlag>()
  private pollHandle?: ReturnType<typeof setInterval>

  constructor(options: FeatureFlagClientOptions = {}) {
    this.apiBaseUrl = options.apiBaseUrl ?? resolveDefaultApiBaseUrl()
    this.flagsEndpoint = options.flagsEndpoint ?? '/api/flags'
    this.fetchImpl = options.fetchImpl ?? fetch
    this.pollingIntervalMs = options.pollingIntervalMs
  }

  async init(): Promise<void> {
    await this.refresh()
    if (this.pollingIntervalMs && this.pollingIntervalMs > 0) {
      this.pollHandle = setInterval(() => {
        void this.refresh().catch(() => undefined)
      }, this.pollingIntervalMs)
    }
  }

  async refresh(): Promise<FeatureFlag[]> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}${this.flagsEndpoint}`)
    if (!response.ok) {
      throw new Error(`Unable to fetch flags: ${response.status}`)
    }

    const flags = (await response.json()) as FeatureFlag[]
    this.cache.clear()
    flags.forEach((flag) => this.cache.set(flag.key, flag))
    return flags
  }

  getCachedFlags(): FeatureFlag[] {
    return Array.from(this.cache.values())
  }

  evaluate(flagKey: string, context: EvaluationContext = {}): EvaluationResult {
    const flag = this.cache.get(flagKey)
    if (!flag) {
      return {
        flagKey,
        enabled: false,
        reason: 'Flag not found in cache.',
        source: 'cache',
      }
    }

    if (!flag.enabled) {
      return {
        flagKey,
        enabled: false,
        reason: 'Flag is disabled.',
        source: 'cache',
      }
    }

    const variant = selectVariant(flag, context)
    return {
      flagKey,
      enabled: true,
      variant,
      reason: variant ? 'Flag enabled with deterministic variant.' : 'Flag enabled.',
      source: 'cache',
    }
  }

  destroy(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle)
      this.pollHandle = undefined
    }
  }
}

export async function initFeatureFlagClient(options: FeatureFlagClientOptions = {}): Promise<FeatureFlagClient> {
  const client = new FeatureFlagClient(options)
  await client.init()
  return client
}
