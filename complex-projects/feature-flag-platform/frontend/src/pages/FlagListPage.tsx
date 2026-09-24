import { FlagTable } from '../components/FlagTable'
import type { FeatureFlag } from '../types/flags'

interface FlagListPageProps {
  flags: FeatureFlag[]
  loading: boolean
  error: string | null
  onRefresh: () => Promise<void>
  onCreate: () => void
  onEdit: (flag: FeatureFlag) => void
}

export function FlagListPage({ flags, loading, error, onRefresh, onCreate, onEdit }: FlagListPageProps) {
  return (
    <section>
      <div className="page-header">
        <h2>Feature flags</h2>
        <div className="actions">
          <button type="button" onClick={() => void onRefresh()}>
            Refresh
          </button>
          <button type="button" onClick={onCreate}>
            Create flag
          </button>
        </div>
      </div>
      {loading && <p>Loading flags...</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && <FlagTable flags={flags} onEdit={onEdit} />}
    </section>
  )
}
