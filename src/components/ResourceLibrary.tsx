import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Icon } from './PortalLayout'

const BUCKET = 'tutor-resources'

export const CATEGORIES: { key: string; label: string }[] = [
  { key: 'tutor_guide', label: 'Tutor guides' },
  { key: 'printable_test', label: 'Printable tests' },
  { key: 'answer_key', label: 'Answer keys' },
  { key: 'audio_script', label: 'Audio scripts' },
  { key: 'other', label: 'Other' },
]

interface ResourceRow {
  id: string
  title: string
  description: string | null
  category: string
  exam_label: string | null
  file_path: string
  file_name: string
  file_size: number | null
  created_at: string
}

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function categoryLabel(key: string) {
  return CATEGORIES.find((c) => c.key === key)?.label.replace(/s$/, '') ?? 'Other'
}

interface Props {
  userId: string
  canDelete: boolean
}

function ResourceLibrary({ userId, canDelete }: Props) {
  const [rows, setRows] = useState<ResourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('tutor_guide')
  const [examLabel, setExamLabel] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [fileKey, setFileKey] = useState(0)

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('tutor_resources')
      .select('*')
      .order('created_at', { ascending: false })
    setLoading(false)
    if (err) { setError(err.message); return }
    setError('')
    setRows((data as ResourceRow[]) ?? [])
  }

  useEffect(() => { load() }, [])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter !== 'all' && r.category !== filter) return false
      if (!q) return true
      return [r.title, r.exam_label ?? '', r.file_name].some((s) => s.toLowerCase().includes(q))
    })
  }, [rows, filter, search])

  async function handleDownload(r: ResourceRow) {
    setBusyId(r.id)
    const { data, error: err } = await supabase.storage.from(BUCKET).createSignedUrl(r.file_path, 120, { download: r.file_name })
    setBusyId(null)
    if (err || !data?.signedUrl) { setError(err?.message ?? 'Could not create a download link.'); return }
    window.location.href = data.signedUrl
  }

  async function handleDelete(r: ResourceRow) {
    if (!window.confirm(`Delete "${r.title}"? This cannot be undone.`)) return
    setBusyId(r.id)
    const rm = await supabase.storage.from(BUCKET).remove([r.file_path])
    if (rm.error) { setBusyId(null); setError(rm.error.message); return }
    const { error: err } = await supabase.from('tutor_resources').delete().eq('id', r.id)
    setBusyId(null)
    if (err) { setError(err.message); return }
    setRows((prev) => prev.filter((x) => x.id !== r.id))
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    setUploadError('')
    if (!file) { setUploadError('Choose a file first.'); return }
    if (!title.trim()) { setUploadError('Give the document a title.'); return }
    setUploading(true)
    const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_')
    const path = `${Date.now()}-${safe}`
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
    if (up.error) { setUploading(false); setUploadError(up.error.message); return }
    const { error: err } = await supabase.from('tutor_resources').insert({
      title: title.trim(),
      category,
      exam_label: examLabel.trim() || null,
      file_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || null,
      uploaded_by: userId,
    })
    setUploading(false)
    if (err) {
      await supabase.storage.from(BUCKET).remove([path])
      setUploadError(err.message)
      return
    }
    setTitle(''); setExamLabel(''); setFile(null); setShowUpload(false)
    setFileKey((k) => k + 1)
    load()
  }

  return (
    <>
      <div className="resource-toolbar">
        <input type="search" placeholder="Search by title or exam…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn-primary" onClick={() => setShowUpload((v) => !v)}>
          {showUpload ? 'Close' : 'Upload document'}
        </button>
      </div>

      {showUpload && (
        <form className="panel" onSubmit={handleUpload}>
          <h2>Upload a document</h2>
          <p className="panel-sub">PDF, Word or audio files up to 50 MB. Only tutors and admins can see these.</p>
          <div className="upload-form">
            <label>Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Exam 8 Writing tutor guide" />
            </label>
            <label>Category
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label.replace(/s$/, '')}</option>)}
              </select>
            </label>
            <label>Exam (optional)
              <input value={examLabel} onChange={(e) => setExamLabel(e.target.value)} placeholder="e.g. Full Exam 8" />
            </label>
            <label>File
              <input key={fileKey} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <button className="btn-primary" type="submit" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
          </div>
          {uploadError && <p className="tutor-error">{uploadError}</p>}
        </form>
      )}

      <div className="chip-row">
        <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All ({rows.length})</button>
        {CATEGORIES.map((c) => (
          <button key={c.key} className={`chip ${filter === c.key ? 'active' : ''}`} onClick={() => setFilter(c.key)}>
            {c.label} ({rows.filter((r) => r.category === c.key).length})
          </button>
        ))}
      </div>

      {error && <p className="tutor-error">{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : visible.length === 0 ? (
        <div className="panel empty-state">
          <strong>{rows.length === 0 ? 'No documents yet' : 'Nothing matches your search'}</strong>
          {rows.length === 0 ? 'Use “Upload document” to add tutor guides, printable tests and answer keys.' : 'Try a different category or search term.'}
        </div>
      ) : (
        <div className="resource-grid">
          {visible.map((r) => (
            <div key={r.id} className="resource-card">
              <div>
                <span className="resource-tag">{categoryLabel(r.category)}</span>
                <h3>{r.title}</h3>
              </div>
              <div className="resource-meta">
                {[r.exam_label, formatSize(r.file_size), new Date(r.created_at).toLocaleDateString()].filter(Boolean).join(' · ')}
              </div>
              <div className="resource-actions">
                <button className="btn-primary" disabled={busyId === r.id} onClick={() => handleDownload(r)}>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Icon name="file" />Download</span>
                </button>
                {canDelete && (
                  <button className="btn-secondary" disabled={busyId === r.id} onClick={() => handleDelete(r)}>Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export default ResourceLibrary
