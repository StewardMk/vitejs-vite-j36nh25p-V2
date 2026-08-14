interface BreakScreenProps {
  sectionLabel: string
  timeLeft: number | null
  onResume: () => void
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Full-page takeover shown between timed sections (e.g. Reading Part A and
 * the merged Part B&C). Owns no timer state itself — the parent runner ticks
 * `timeLeft` down and calls `onResume` either when the candidate clicks
 * "Resume Test" or when the parent's own countdown effect hits zero.
 */
function BreakScreen({ sectionLabel, timeLeft, onResume }: BreakScreenProps) {
  return (
    <div className="exam-shell">
      <div className="card" style={{ textAlign: 'center' }}>
        <span className="folder-tab" style={{ background: 'var(--color-amber-dark)' }}>
          {sectionLabel}
        </span>
        <h2>Break</h2>
        <p style={{ color: 'var(--color-ink-muted)', marginBottom: 28 }}>
          You have a short break before continuing to the next part of the test. The
          test will resume automatically when the break ends, or you can resume early.
        </p>
        {timeLeft !== null && (
          <p
            className="timer-chip"
            style={{ display: 'inline-block', fontSize: 20, padding: '10px 20px' }}
          >
            {formatTime(timeLeft)}
          </p>
        )}
        <div style={{ marginTop: 28 }}>
          <button className="btn-primary" onClick={onResume}>
            Resume Test
          </button>
        </div>
      </div>
    </div>
  )
}

export default BreakScreen