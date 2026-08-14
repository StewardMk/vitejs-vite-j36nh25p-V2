import { useEffect, useRef, useState } from 'react'
import ConfirmModal from './ConfirmModal'
import { submitAttempt } from '../lib/submitAttempt'

interface WritingRunnerProps {
  testData: any
  studentName: string
  sessionGroupId: string
  onComplete: () => void
}

const READING_LOCK_SECONDS = 300
const WRAP_UP_SECONDS = 60
// Case notes say "approximately 180-200 words" for the letter body — used
// only to decide which ConfirmModal variant to show, not for validation.
const TARGET_WORD_COUNT = 180

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function countWords(text: string) {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length
}

function WritingRunner({ testData, studentName, sessionGroupId, onComplete }: WritingRunnerProps) {
  const [phase, setPhase] = useState<'reading' | 'writing'>('reading')
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [letterText, setLetterText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmKind, setConfirmKind] = useState<'skip-reading' | 'submit'>('submit')

  const [wrappingUp, setWrappingUp] = useState(false)
  const [wrapTimeLeft, setWrapTimeLeft] = useState<number | null>(null)

  const writingSubtest = testData.subtests.find((s: any) => s.type === 'writing')
  const part = writingSubtest?.parts?.[0]
  const stimulus = part?.stimuli?.[0]
  const question = stimulus?.questions?.[0]
  const writingSeconds = part ? Math.max(part.time_limit_sec - READING_LOCK_SECONDS, 0) : 0
  const wordCount = countWords(letterText)

  useEffect(() => {
    setTimeLeft(READING_LOCK_SECONDS)
  }, [])

  async function handleSubmit() {
    if (!question || submitting || submitted) return
    setSubmitting(true)
    try {
      await submitAttempt(
        testData.id,
        'writing',
        [{ id: question.id, question_type: question.question_type }],
        { [question.id]: letterText },
        studentName,
        sessionGroupId
      )
      // Submission succeeded — show the "Relax! All your answers have been
      // saved" wrap-up page (its own short countdown) before the existing
      // "awaiting assessment" screen, matching the real test's extra step
      // between finishing and results.
      setWrappingUp(true)
      setWrapTimeLeft(WRAP_UP_SECONDS)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Submission failed.')
    }
    setSubmitting(false)
  }

  const submitRef = useRef(handleSubmit)
  submitRef.current = handleSubmit

  // Reading -> Writing phase timer (auto, no confirmation — same as before).
  useEffect(() => {
    if (timeLeft === null || submitted || wrappingUp) return

    if (timeLeft <= 0) {
      if (phase === 'reading') {
        setPhase('writing')
        setTimeLeft(writingSeconds)
      }
      // Running out of time in the writing phase does NOT auto-submit —
      // real OET still requires the candidate to explicitly finish.
      return
    }

    const timer = setTimeout(() => {
      setTimeLeft((t) => (t !== null ? t - 1 : t))
    }, 1000)

    return () => clearTimeout(timer)
  }, [timeLeft, phase, submitted, writingSeconds, wrappingUp])

  // Wrap-up page's own short countdown — auto-finishes at zero.
  useEffect(() => {
    if (!wrappingUp || wrapTimeLeft === null) return

    if (wrapTimeLeft <= 0) {
      setWrappingUp(false)
      setSubmitted(true)
      return
    }

    const timer = setTimeout(() => {
      setWrapTimeLeft((t) => (t !== null ? t - 1 : t))
    }, 1000)

    return () => clearTimeout(timer)
  }, [wrapTimeLeft, wrappingUp])

  function handleReadingNextClick() {
    setConfirmKind('skip-reading')
    setConfirmOpen(true)
  }

  function handleFinishClick() {
    setConfirmKind('submit')
    setConfirmOpen(true)
  }

  function handleConfirm() {
    setConfirmOpen(false)
    if (confirmKind === 'skip-reading') {
      setPhase('writing')
      setTimeLeft(writingSeconds)
    } else {
      handleSubmit()
    }
  }

  const submitVariant: 'sterner' | 'plain' =
    (timeLeft ?? 0) > 0 && wordCount < TARGET_WORD_COUNT ? 'sterner' : 'plain'

  const confirmProps =
    confirmKind === 'skip-reading'
      ? {
          variant: 'sterner' as const,
          title: 'Confirm Finish Section',
          message:
            'You still have time remaining in this section. If you choose to finish this section, you will not be able to return to it. Are you sure you would like to finish this section?',
          confirmLabel: 'Yes, I would like to finish this section',
          cancelLabel: 'No, I would like to return to this section',
        }
      : {
          variant: submitVariant,
          title: 'Confirm Finish',
          message:
            submitVariant === 'sterner'
              ? `You still have time remaining, and your letter is currently ${wordCount} word${
                  wordCount === 1 ? '' : 's'
                } (the body should be approximately ${TARGET_WORD_COUNT}-200 words). If you select Finish, your answers will be submitted and you will not be able to return. Are you sure you would like to finish?`
              : 'If you select Finish, your answers will be submitted and you will not be able to return to the test.',
          confirmLabel: 'Finish',
          cancelLabel: 'Cancel',
        }

  if (!question) return <p>Could not load the writing task.</p>

  if (wrappingUp) {
    return (
      <div className="exam-shell">
        <div className="card" style={{ textAlign: 'center' }}>
          <span
            className="folder-tab"
            style={{ background: 'var(--color-sage)', color: 'var(--color-ink)' }}
          >
            Writing
          </span>
          <h2>Finish</h2>
          <p style={{ color: 'var(--color-ink-muted)', marginBottom: 8 }}>
            You have now completed the test. All your answers have been saved. Relax!
          </p>
          {wrapTimeLeft !== null && (
            <p
              className="timer-chip"
              style={{ display: 'inline-block', fontSize: 18, padding: '8px 18px', marginTop: 12 }}
            >
              Finish Time Remaining: {formatTime(wrapTimeLeft)}
            </p>
          )}
          <div style={{ marginTop: 28 }}>
            <button
              className="btn-primary"
              onClick={() => {
                setWrappingUp(false)
                setSubmitted(true)
              }}
            >
              Finish Test
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="exam-shell">
      <div className="card">
        <div className="exam-header">
          <div>
            <span
              className="folder-tab"
              style={{ background: 'var(--color-sage)', color: 'var(--color-ink)' }}
            >
              Writing
            </span>
            <h2>{part.label}</h2>
          </div>
          {timeLeft !== null && !submitted && (
            <span className={`timer-chip ${timeLeft <= 60 ? 'urgent' : ''}`}>
              {phase === 'reading' ? 'Reading: ' : 'Writing: '}
              {formatTime(timeLeft)}
            </span>
          )}
        </div>

        {phase === 'reading' && !submitted && (
          <p style={{ fontStyle: 'italic', color: 'var(--color-ink-muted)' }}>
            Read the case notes below. You may not begin writing yet.
          </p>
        )}

        <p
          className="stimulus-text"
          style={{
            background: 'var(--color-folder)',
            padding: 16,
            borderRadius: 'var(--radius-control)',
          }}
        >
          {stimulus.content}
        </p>

        <p className="question-prompt">{question.prompt}</p>

        <textarea
          className="exam-input"
          value={letterText}
          onChange={(e) => setLetterText(e.target.value)}
          disabled={phase === 'reading' || submitted}
          rows={14}
          placeholder={
            phase === 'reading'
              ? 'Writing is locked during reading time...'
              : 'Write your letter here...'
          }
        />
        <p style={{ color: 'var(--color-ink-muted)', fontSize: 13 }}>{wordCount} words</p>

        {submitted ? (
          <div className="results-summary">
            <p style={{ fontWeight: 600 }}>Submitted — awaiting assessment.</p>
            <button className="btn-primary" onClick={onComplete}>
              Finish
            </button>
          </div>
        ) : phase === 'reading' ? (
          <button className="btn-secondary" onClick={handleReadingNextClick}>
            Next
          </button>
        ) : (
          <button className="btn-primary" onClick={handleFinishClick} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Finish Test'}
          </button>
        )}
      </div>

      <ConfirmModal
        open={confirmOpen}
        variant={confirmProps.variant}
        title={confirmProps.title}
        message={confirmProps.message}
        confirmLabel={confirmProps.confirmLabel}
        cancelLabel={confirmProps.cancelLabel}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

export default WritingRunner