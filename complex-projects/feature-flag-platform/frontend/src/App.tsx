import { useEffect, useState } from 'react'
import './App.css'
import { FlagFormPage } from './pages/FlagFormPage'
import { FlagListPage } from './pages/FlagListPage'
import { EvaluationPlaygroundPage } from './pages/EvaluationPlaygroundPage'
import { flagsApi } from './services/flagsApi'
import type { EvaluationResult, FeatureFlag } from './types/flags'

type View = 'list' | 'form' | 'evaluate'

function App() {
  const [view, setView] = useState<View>('list')
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [activeFlag, setActiveFlag] = useState<FeatureFlag | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadFlags = async () => {
    setLoading(true)
    setError(null)
    try {
      const items = await flagsApi.listFlags()
      setFlags(items)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load flags.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFlags()
  }, [])

  const handleCreate = () => {
    setActiveFlag(null)
    setView('form')
  }

  const handleEdit = (flag: FeatureFlag) => {
    setActiveFlag(flag)
    setView('form')
  }

  const handleSave = async (flag: FeatureFlag, previousKey?: string) => {
    if (previousKey) {
      await flagsApi.updateFlag(previousKey, flag)
    } else {
      await flagsApi.createFlag(flag)
    }
    await loadFlags()
    setView('list')
  }

  const handleEvaluate = async (
    flagKey: string,
    context: Record<string, unknown>,
  ): Promise<EvaluationResult> => flagsApi.evaluate(flagKey, context, flags)

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>Feature Flag Admin</h1>
        <p className="subtitle">API: {(import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000'}</p>
      </header>

      <nav className="tabs">
        <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
          Flag list
        </button>
        <button type="button" className={view === 'form' ? 'active' : ''} onClick={handleCreate}>
          Create/edit flag
        </button>
        <button type="button" className={view === 'evaluate' ? 'active' : ''} onClick={() => setView('evaluate')}>
          Evaluate playground
        </button>
      </nav>

      <main className="page">
        {view === 'list' && (
          <FlagListPage
            flags={flags}
            loading={loading}
            error={error}
            onRefresh={loadFlags}
            onCreate={handleCreate}
            onEdit={handleEdit}
          />
        )}

        {view === 'form' && (
          <FlagFormPage
            key={activeFlag?.key ?? 'new-flag'}
            initialFlag={activeFlag}
            onSave={handleSave}
            onCancel={() => setView('list')}
          />
        )}

        {view === 'evaluate' && (
          <EvaluationPlaygroundPage flags={flags} onEvaluate={handleEvaluate} />
        )}
      </main>
    </div>
  )
}

export default App
