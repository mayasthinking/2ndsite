interface JsonInputProps {
  value: string
  onChange: (value: string) => void
  error?: string | null
}

export function JsonInput({ value, onChange, error }: JsonInputProps) {
  return (
    <label className="json-input">
      Context JSON
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={10}
        spellCheck={false}
        placeholder={`{\n  "userId": "123",\n  "country": "US"\n}`}
      />
      {error && <span className="error-text">{error}</span>}
    </label>
  )
}
