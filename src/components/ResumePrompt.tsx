interface ResumePromptProps {
  testTitle: string
  /** When the unfinished attempt was last saved (ms since epoch), if known. */
  savedAt: number | null
  onContinue: () => void
  onStartOver: () => void
}

function timeAgo(savedAt: number): string {
  const minutes = Math.floor((Date.now() - savedAt) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/**
 * Shown when a student opens a test they have an unfinished attempt of.
 * Reuses the exam modal styling but deliberately has no click-outside
 * dismissal: "Start over" deletes saved answers, so it must never fire by
 * accident -- the student has to pick one of the two buttons.
 */
function ResumePrompt({ testTitle, savedAt, onContinue, onStartOver }: ResumePromptProps) {
  return (
    <div className="modal-overlay" role="presentation">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-prompt-title"
        aria-describedby="resume-prompt-message"
      >
        <div className="modal-header plain">
          <h3 id="resume-prompt-title">Unfinished test found</h3>
        </div>

        <div className="modal-body">
          <span className="modal-icon plain" aria-hidden="true">
            ↺
          </span>
          <div id="resume-prompt-message" style={{ textAlign: 'left' }}>
            <p>
              You have an unfinished attempt of <strong>{testTitle}</strong>
              {savedAt ? ` (last saved ${timeAgo(savedAt)})` : ''}. Would you like to continue where you left off, or
              start over from the beginning?
            </p>
            <p style={{ marginTop: 10, fontSize: 13, color: '#5a6472' }}>
              Starting over deletes the answers saved from your previous attempt.
            </p>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-primary" onClick={onContinue} autoFocus>
            Continue previous attempt
          </button>
          <button className="btn-secondary" onClick={onStartOver}>
            Start over
          </button>
        </div>
      </div>
    </div>
  )
}

export default ResumePrompt
