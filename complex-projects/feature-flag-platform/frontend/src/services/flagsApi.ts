import type { EvaluationResult, FeatureFlag } from '../types/flags'
import { evaluateLocally } from '../utils/flagUtils'

const defaultBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000'
const localStorageKey = 'feature-flag-platform.flags'

function getStoredFlags(): FeatureFlag[] {
  const raw = window.localStorage.getItem(localStorageKey)
  if (!raw) {
    return []
  }

  try {
    return JSON.parse(raw) as FeatureFlag[]
  } catch {
    return []
  }
}

function setStoredFlags(flags: FeatureFlag[]): void {
  window.localStorage.setItem(localStorageKey, JSON.stringify(flags))
}

export class FlagsApi {
  private readonly baseUrl: string

  constructor(baseUrl = defaultBaseUrl) {
    this.baseUrl = baseUrl
  }

  async listFlags(): Promise<FeatureFlag[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/flags`)
      if (!response.ok) {
        throw new Error(`Flags request failed with ${response.status}`)
      }
      const flags = (await response.json()) as FeatureFlag[]
      setStoredFlags(flags)
      return flags
    } catch {
      return getStoredFlags()
    }
  }

  async createFlag(flag: FeatureFlag): Promise<FeatureFlag> {
    try {
      const response = await fetch(`${this.baseUrl}/api/flags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flag),
      })
      if (!response.ok) {
        throw new Error(`Create request failed with ${response.status}`)
      }
      return (await response.json()) as FeatureFlag
    } catch {
      const flags = getStoredFlags()
      const nextFlags = [...flags, flag]
      setStoredFlags(nextFlags)
      return flag
    }
  }

  async updateFlag(flagKey: string, updatedFlag: FeatureFlag): Promise<FeatureFlag> {
    try {
      const response = await fetch(`${this.baseUrl}/api/flags/${encodeURIComponent(flagKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFlag),
      })
      if (!response.ok) {
        throw new Error(`Update request failed with ${response.status}`)
      }
      return (await response.json()) as FeatureFlag
    } catch {
      const flags = getStoredFlags()
      const nextFlags = flags.map((flag) => (flag.key === flagKey ? updatedFlag : flag))
      setStoredFlags(nextFlags)
      return updatedFlag
    }
  }

  async evaluate(flagKey: string, context: Record<string, unknown>, flags: FeatureFlag[]): Promise<EvaluationResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagKey, context }),
      })
      if (!response.ok) {
        throw new Error(`Evaluate request failed with ${response.status}`)
      }
      return (await response.json()) as EvaluationResult
    } catch {
      const flag = flags.find((item) => item.key === flagKey)
      return evaluateLocally(flag, context)
    }
  }
}

export const flagsApi = new FlagsApi()
