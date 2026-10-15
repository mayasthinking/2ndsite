import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { VariantEditor } from '../components/VariantEditor'
import type { FeatureFlag } from '../types/flags'

interface FlagFormPageProps {
  initialFlag: FeatureFlag | null
  onSave: (flag: FeatureFlag, previousKey?: string) => Promise<void>
  onCancel: () => void
}

const emptyFlag: FeatureFlag = {
  name: '',
  key: '',
  enabled: true,
  variants: [],
}

export function FlagFormPage({ initialFlag, onSave, onCancel }: FlagFormPageProps) {
  const [draft, setDraft] = useState<FeatureFlag>(initialFlag ?? emptyFlag)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEditing = useMemo(() => Boolean(initialFlag), [initialFlag])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft.name.trim() || !draft.key.trim()) {
      setError('Name and key are required.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSave(draft, initialFlag?.key)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save flag.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h2>{isEditing ? 'Edit feature flag' : 'Create feature flag'}</h2>
      <form className="flag-form" onSubmit={onSubmit}>
        <label>
          Name
          <input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Checkout redesign"
          />
        </label>

        <label>
          Key
          <input
            value={draft.key}
            onChange={(event) => setDraft({ ...draft, key: event.target.value })}
            placeholder="checkout_redesign"
          />
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
          />
          Enabled
        </label>

        <VariantEditor variants={draft.variants} onChange={(variants) => setDraft({ ...draft, variants })} />

        {error && <p className="error-text">{error}</p>}
        <div className="actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  )
}
