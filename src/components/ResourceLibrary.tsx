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

/** Guess title, category and exam from a file name such as FNE7_Writing_Tutor_Guide.pdf. */
export function describeFile(name: string) {
  const base = name.replace(/\.[^.]+$/, '')
  const lower = base.toLowerCase()
  const exam = lower.match(/fne\s*_?(\d+)/)?.[1]
  let category = 'other'
  if (/tutor[_ -]?guide/.test(lower)) category = 'tutor_guide'
  else if (/answer[_ -]?key/.test(lower)) category = 'answer_key'
  else if (/script|recording/.test(lower)) category = 'audio_script'
  else if (/case[_ -]?notes|reading_[abc]|texts?/.test(lower)) category = 'printable_test'
  const words = base.replace(/^fne\s*_?\d+[_ -]*/i, '').replace(/[_-]+/g, ' ').trim()
  const nice = words.charAt(0).toUpperCase() + words.slice(1)
  return {
    category,
    examLabel: exam ? `Full Exam ${exam}` : '',
    title: exam ? `Exam ${exam} – ${nice}` : nice || base,
  }
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
  const [files, setFiles] = useState<File[]>([])
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

  async function uploadOne(f: File, meta: { title: string; category: string; examLabel: string }) {
    const safe = f.name.replace(/[^A-Za-z0-9._-]+/g, '_')
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`
    const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined })
    if (up.error) return up.error.message
    const { error: err } = await supabase.from('tutor_resources').insert({
      title: meta.title,
      category: meta.category,
      exam_label: meta.examLabel || null,
      file_path: path,
      file_name: f.name,
      file_size: f.size,
      mime_type: f.type || null,
      uploaded_by: userId,
    })
    if (err) {
      await supabase.storage.from(BUCKET).remove([path])
      return err.message
    }
    return ''
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    setUploadError('')
    if (files.length === 0) { setUploadError('Choose at least one file.'); return }
    const bulk = files.length > 1
    if (!bulk && !title.trim()) { setUploadError('Give the document a title.'); return }
    setUploading(true)
    const failures: string[] = []
    for (const f of files) {
      const meta = bulk ? describeFile(f.name) : { title: title.trim(), category, examLabel: examLabel.trim() }
      const msg = await uploadOne(f, meta)
      if (msg) failures.push(`${f.name}: ${msg}`)
    }
    setUploading(false)
    if (failures.length) setUploadError(failures.join(' | '))
    else setShowUpload(false)
    setTitle(''); setExamLabel(''); setFiles([]); setFileKey((k) => k + 1)
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
          <p className="panel-sub">PDF, Word or audio files up to 50 MB. Choose several files at once and the title, category and exam are filled in from each file name (for example FNE7_Writing_Tutor_Guide.pdf). Only tutors and admins can see these.</p>
          <div className="upload-form">
            <label>File(s)
              <input key={fileKey} type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            </label>
            {files.length <= 1 && (
              <>
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
              </>
            )}
            <button className="btn-primary" type="submit" disabled={uploading}>{uploading ? 'Uploading…' : files.length > 1 ? `Upload ${files.length} files` : 'Upload'}</button>
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
