import type { FlagVariant } from '../types/flags'

interface VariantEditorProps {
  variants: FlagVariant[]
  onChange: (variants: FlagVariant[]) => void
}

const blankVariant: FlagVariant = { key: '', value: '' }

export function VariantEditor({ variants, onChange }: VariantEditorProps) {
  const addVariant = () => onChange([...variants, blankVariant])

  const updateVariant = (index: number, nextVariant: FlagVariant) => {
    const nextVariants = variants.map((variant, variantIndex) => {
      if (variantIndex !== index) {
        return variant
      }
      return nextVariant
    })
    onChange(nextVariants)
  }

  const removeVariant = (index: number) => {
    const nextVariants = variants.filter((_, variantIndex) => variantIndex !== index)
    onChange(nextVariants)
  }

  return (
    <div className="variants">
      <div className="variants__header">
        <h3>Variants</h3>
        <button type="button" onClick={addVariant}>
          Add variant
        </button>
      </div>

      {variants.length === 0 && <p className="empty-state">No variants configured.</p>}

      {variants.map((variant, index) => (
        <div className="variant-row" key={`${variant.key}-${index}`}>
          <label>
            Key
            <input
              value={variant.key}
              onChange={(event) => updateVariant(index, { ...variant, key: event.target.value })}
              placeholder="control"
            />
          </label>
          <label>
            Value
            <input
              value={variant.value}
              onChange={(event) => updateVariant(index, { ...variant, value: event.target.value })}
              placeholder="off"
            />
          </label>
          <button type="button" className="danger" onClick={() => removeVariant(index)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  )
}
