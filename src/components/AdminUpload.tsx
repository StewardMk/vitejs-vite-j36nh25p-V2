import { useState } from 'react'
import { testJsonSchema } from '../lib/testSchema'
import { uploadTest } from '../lib/uploadTest'

function AdminUpload() {
  const [jsonFile, setJsonFile] = useState<File | null>(null)
  const [audioFiles, setAudioFiles] = useState<FileList | null>(null)
  const [status, setStatus] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
  
    if (!jsonFile) {
      setStatus('Please select a JSON test file first.')
      return
    }
  
    setStatus('Reading file...')
  
    let rawText: string
    try {
      rawText = await jsonFile.text()
    } catch {
      setStatus('Could not read the file.')
      return
    }
  
    let parsed: unknown
    try {
      parsed = JSON.parse(rawText)
    } catch {
      setStatus('That file is not valid JSON — check for a missing comma or quote.')
      return
    }
  
    const result = testJsonSchema.safeParse(parsed)
    if (!result.success) {
      const issue = result.error.issues[0]
      setStatus(`Validation error at "${issue.path.join('.')}": ${issue.message}`)
      return
    }
  
    setStatus('Validated. Uploading to Supabase...')
  
    try {
      const { testId, questionCount } = await uploadTest(result.data, audioFiles)
      setStatus(`Success! Test "${result.data.test.title}" created (id: ${testId}) with ${questionCount} questions.`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Something went wrong during upload.')
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: 24 }}>
      <h2>Upload a new test</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="json-file">Test JSON file</label>
          <br />
          <input
            id="json-file"
            type="file"
            accept="application/json"
            onChange={(e) => setJsonFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <label htmlFor="audio-files">Audio files (Listening clips)</label>
          <br />
          <input
            id="audio-files"
            type="file"
            accept="audio/*"
            multiple
            onChange={(e) => setAudioFiles(e.target.files)}
          />
        </div>

        <button type="submit" style={{ marginTop: 16 }}>
          Upload test
        </button>
      </form>

      {status && <p style={{ marginTop: 16 }}>{status}</p>}
    </div>
  )
}

export default AdminUpload