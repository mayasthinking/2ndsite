import type { FeatureFlag } from '../types/flags'

interface FlagTableProps {
  flags: FeatureFlag[]
  onEdit: (flag: FeatureFlag) => void
}

export function FlagTable({ flags, onEdit }: FlagTableProps) {
  if (flags.length === 0) {
    return <p className="empty-state">No flags found yet.</p>
  }

  return (
    <table className="flag-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Key</th>
          <th>Status</th>
          <th>Variants</th>
          <th aria-label="actions" />
        </tr>
      </thead>
      <tbody>
        {flags.map((flag) => (
          <tr key={flag.key}>
            <td>{flag.name}</td>
            <td>
              <code>{flag.key}</code>
            </td>
            <td>{flag.enabled ? 'Enabled' : 'Disabled'}</td>
            <td>{flag.variants.length}</td>
            <td>
              <button type="button" onClick={() => onEdit(flag)}>
                Edit
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
