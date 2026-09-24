import { useMemo, useState } from 'react'
import { JsonInput } from '../components/JsonInput'
import type { EvaluationResult, FeatureFlag } from '../types/flags'
import { parseContextJson } from '../utils/flagUtils'

interface EvaluationPlaygroundPageProps {
  flags: FeatureFlag[]
  onEvaluate: (flagKey: string, context: Record<string, unknown>) => Promise<EvaluationResult>
}

export function EvaluationPlaygroundPage({ flags, onEvaluate }: EvaluationPlaygroundPageProps) {
  const [selectedFlagKey, setSelectedFlagKey] = useState('')
  const [contextInput, setContextInput] = useState('{\n  "userId": "abc-123"\n}')
  const [result, setResult] = useState<EvaluationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const parsedContext = useMemo(() => parseContextJson(contextInput), [contextInput])

  const evaluate = async () => {
    if (!selectedFlagKey || parsedContext.error || parsedContext.value === null) {
      return
    }

    setLoading(true)
    setError(null)
    try {
      const evaluation = await onEvaluate(selectedFlagKey, parsedContext.value)
      setResult(evaluation)
    } catch (evaluationError) {
      setError(evaluationError instanceof Error ? evaluationError.message : 'Evaluation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <h2>Evaluation playground</h2>

      <label>
        Flag
        <select value={selectedFlagKey} onChange={(event) => setSelectedFlagKey(event.target.value)}>
          <option value="">Select a flag</option>
          {flags.map((flag) => (
            <option key={flag.key} value={flag.key}>
              {flag.name} ({flag.key})
            </option>
          ))}
        </select>
      </label>

      <JsonInput value={contextInput} onChange={setContextInput} error={parsedContext.error} />

      <button type="button" disabled={!selectedFlagKey || loading || Boolean(parsedContext.error)} onClick={evaluate}>
        {loading ? 'Evaluating...' : 'Evaluate'}
      </button>

      {error && <p className="error-text">{error}</p>}

      {result && (
        <pre className="result-card">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </section>
  )
}
