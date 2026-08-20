import { useMemo, useState } from 'react'
import { testJsonSchema } from '../lib/testSchema'
import { countQuestions, uploadTest } from '../lib/uploadTest'

type AssetKind = 'pdf' | 'audio'

function AdminUpload() {
  const [jsonFile, setJsonFile] = useState<File | null>(null)
  const [pdfFiles, setPdfFiles] = useState<File[]>([])
  const [audioFiles, setAudioFiles] = useState<File[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [manifest, setManifest] = useState<any>(null)
  const [testId, setTestId] = useState('')

  const selectedPdfNames = useMemo(() => new Set(pdfFiles.map((f) => f.name)), [pdfFiles])
  const selectedAudioNames = useMemo(() => new Set(audioFiles.map((f) => f.name)), [audioFiles])

  const requiredAssets = useMemo(() => {
    if (!manifest) return { pdf: [] as string[], audio: [] as string[] }

    const pdf = new Set<string>()
    const audio = new Set<string>()
    const add = (kind: AssetKind, fileRef?: string) => {
      if (!fileRef) return
      ;(kind === 'pdf' ? pdf : audio).add(fileRef)
    }

    for (const stage of manifest.exam.stages) {
      if (stage.audio?.file_ref) add('audio', stage.audio.file_ref)
      for (const doc of stage.documents ?? []) add('pdf', doc.file_ref)
      for (const extract of stage.extracts ?? []) {
        add('audio', extract.file_ref)
        for (const q of extract.questions ?? []) add('audio', q.audio?.file_ref)
      }
      for (const q of stage.questions ?? []) add('audio', q.audio?.file_ref)
    }

    return { pdf: [...pdf], audio: [...audio] }
  }, [manifest])

  const allRequiredAssets = [...requiredAssets.pdf, ...requiredAssets.audio]
  const selectedCount = pdfFiles.length + audioFiles.length
  const missingPdf = requiredAssets.pdf.filter((name) => !selectedPdfNames.has(name))
  const missingAudio = requiredAssets.audio.filter((name) => !selectedAudioNames.has(name))
  const missing = [...missingPdf, ...missingAudio]

  async function handleJson(file: File | null) {
    setJsonFile(file)
    setManifest(null)
    setTestId('')
    setStatus('')
    if (!file) return

    try {
      const parsed = JSON.parse(await file.text())
      const result = testJsonSchema.safeParse(parsed)
      if (!result.success) {
        const issue = result.error.issues[0]
        setStatus(`Validation error at "${issue.path.join('.')}": ${issue.message}`)
        return
      }
      setManifest(result.data)
      setStatus('JSON validated successfully. Now select the four PDFs and thirteen audio files.')
    } catch {
      setStatus('That file is not valid JSON.')
    }
  }

  function replaceFiles(kind: AssetKind, files: FileList | null) {
    const selected = files ? Array.from(files) : []
    if (kind === 'pdf') setPdfFiles(selected)
    else setAudioFiles(selected)
    setStatus('')
    setTestId('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!jsonFile || !manifest) {
      setStatus('Select and validate the master JSON first.')
      return
    }
    if (missing.length) {
      setStatus(`Missing ${missing.length} required asset(s): ${missing.join(', ')}`)
      return
    }

    setBusy(true)
    setTestId('')
    setStatus('Creating the exam and uploading its assets…')

    try {
      const result = await uploadTest(manifest, [...pdfFiles, ...audioFiles])
      setTestId(result.testId)
      setStatus(`Upload complete. ${result.questionCount} questions and ${allRequiredAssets.length} referenced assets are ready.`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-upload-page">
      <div className="admin-upload-card card">
        <span className="eyebrow">Exam administration</span>
        <h1>Upload a complete OET exam</h1>
        <p className="admin-upload-intro">
          Upload the master manifest, then attach the exact PDF and audio assets referenced by it.
        </p>

        <form onSubmit={handleSubmit} className="admin-upload-form">
          <label className="upload-dropzone">
            <strong>1. Master exam JSON</strong>
            <span>{jsonFile?.name ?? 'Choose oet_nursing_full_exam_01.json'}</span>
            <input type="file" accept="application/json,.json" onChange={(e) => handleJson(e.target.files?.[0] ?? null)} />
          </label>

          {manifest && (
            <div className="upload-summary">
              <div>
                <strong>{manifest.exam.title}</strong>
                <span>{manifest.exam.profession} · {manifest.exam.stages.length} stages · {countQuestions(manifest)} questions</span>
              </div>
              <span className="upload-summary-version">Schema {manifest.schema_version}</span>
            </div>
          )}

          <label className="upload-dropzone">
            <strong>2. Exam PDFs</strong>
            <span>{pdfFiles.length ? `${pdfFiles.length} PDF file${pdfFiles.length === 1 ? '' : 's'} selected` : 'Select the four PDF documents'}</span>
            <input type="file" accept="application/pdf,.pdf" multiple onChange={(e) => replaceFiles('pdf', e.target.files)} disabled={!manifest || busy} />
          </label>

          <label className="upload-dropzone">
            <strong>3. Listening audio</strong>
            <span>{audioFiles.length ? `${audioFiles.length} audio file${audioFiles.length === 1 ? '' : 's'} selected` : 'Select the thirteen MP3/audio files'}</span>
            <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg" multiple onChange={(e) => replaceFiles('audio', e.target.files)} disabled={!manifest || busy} />
          </label>

          {manifest && (
            <div className="asset-checklist">
              <div className="asset-checklist-header">
                <h3>Asset checklist</h3>
                <span>{selectedCount} selected · {allRequiredAssets.length} required</span>
              </div>

              <div className="asset-group">
                <strong>PDF documents ({requiredAssets.pdf.length})</strong>
                {requiredAssets.pdf.map((name) => (
                  <div className={`asset-row ${selectedPdfNames.has(name) ? 'ready' : 'missing'}`} key={name}>
                    <span>{selectedPdfNames.has(name) ? '✓' : '○'}</span>
                    <span>{name}</span>
                  </div>
                ))}
              </div>

              <div className="asset-group">
                <strong>Listening audio ({requiredAssets.audio.length})</strong>
                {requiredAssets.audio.map((name) => (
                  <div className={`asset-row ${selectedAudioNames.has(name) ? 'ready' : 'missing'}`} key={name}>
                    <span>{selectedAudioNames.has(name) ? '✓' : '○'}</span>
                    <span>{name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={busy || !manifest || missing.length > 0}>
            {busy ? 'Uploading exam…' : missing.length ? `Select ${missing.length} missing asset${missing.length === 1 ? '' : 's'}` : 'Upload complete exam'}
          </button>
        </form>

        {status && <div className="admin-upload-status">{status}</div>}

        {testId && (
          <div className="admin-upload-success">
            <strong>Exam ID</strong>
            <code>{testId}</code>
            <span>This is the test record created in Supabase.</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminUpload
