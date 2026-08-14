import { useEffect, useRef, useState } from 'react'
import QuestionInput from './QuestionInput'
import ConfirmModal from './ConfirmModal'
import BreakScreen from './BreakScreen'
import QuestionNavSidebar, { questionAnchorId } from './QuestionNavSidebar'
import { submitAttempt } from '../lib/submitAttempt'

interface SubtestResult {
  correctCount: number
  scorableCount: number
}

interface TestRunnerProps {
  testData: any
  studentName: string
  sessionGroupId: string
  onComplete: (result: SubtestResult) => void
}

interface ReadingSection {
  id: string
  label: string
  time_limit_sec: number
  parts: any[]
}

const BREAK_DURATION_SEC = 10 * 60

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Real OET treats Reading Part A as its own timed section, then merges Parts
// B & C into one continuous, single-timer sequence. There's no part_type
// column for this (see schema note in HANDOVER.md) — we detect it from the
// label, same pattern used for Listening Part B. Any consecutive run of
// parts labeled "Part B" / "Part C" gets merged into one section; everything
// else (e.g. "Part A") stays standalone.
//
// NOTE: when parts are merged, only the FIRST part's time_limit_sec is used —
// later parts' time fields are ignored by convention. Tutors uploading a
// Part C should leave its time_limit_sec blank/irrelevant, since it will
// never be read. Worth flagging clearly in the upload UI at some point.
function buildReadingSections(parts: any[]): ReadingSection[] {
  const sections: ReadingSection[] = []
  let i = 0
  while (i < parts.length) {
    const part = parts[i]
    if (/part\s*b\b/i.test(part.label ?? '')) {
      const group = [part]
      let j = i + 1
      while (j < parts.length && /part\s*[bc]\b/i.test(parts[j].label ?? '')) {
        group.push(parts[j])
        j++
      }
      sections.push({
        id: group.map((p) => p.id).join('-'),
        label: group.map((p: any) => p.label).join(' & '),
        time_limit_sec: group[0].time_limit_sec,
        parts: group,
      })
      i = j
    } else {
      sections.push({
        id: part.id,
        label: part.label,
        time_limit_sec: part.time_limit_sec,
        parts: [part],
      })
      i++
    }
  }
  return sections
}

function TestRunner({ testData, studentName, sessionGroupId, onComplete }: TestRunnerProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<SubtestResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [onBreak, setOnBreak] = useState(false)
  const [breakTimeLeft, setBreakTimeLeft] = useState<number | null>(null)

  const readingSubtest = testData.subtests.find((s: any) => s.type === 'reading')
  const parts = readingSubtest?.parts ?? []
  const sections = buildReadingSections(parts)
  const currentSection = sections[currentSectionIndex]
  const isLastSection = currentSectionIndex === sections.length - 1

  const allReadingQuestions = parts.flatMap((p: any) =>
    p.stimuli.flatMap((s: any) => s.questions)
  )
  const sectionQuestions = currentSection
    ? currentSection.parts.flatMap((p: any) => p.stimuli.flatMap((s: any) => s.questions))
    : []
  const unansweredInSection = sectionQuestions.filter((q: any) => !answers[q.id]).length
  const sectionQuestionNumbers = new Map(
    sectionQuestions.map((q: any, i: number) => [q.id, i + 1])
  )

  // A break only ever follows Part A, before the merged B&C section — matches
  // the real test structure. If content is ever ordered differently this
  // simply won't trigger, which is the safe default.
  const shouldBreakAfterCurrent =
    !isLastSection && /part\s*a\b/i.test(currentSection?.label ?? '')

  // Section timer starts the moment the runner mounts, same continuous-timer
  // principle used for Listening.
  useEffect(() => {
    if (sections[0]) {
      setTimeLeft(sections[0].time_limit_sec)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleAnswerChange(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  async function finalizeSubmission() {
    if (submitting || result) return
    setSubmitting(true)
    try {
      const outcome = await submitAttempt(
        testData.id,
        'reading',
        allReadingQuestions,
        answers,
        studentName,
        sessionGroupId
      )
      setResult(outcome)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Submission failed.')
    }
    setSubmitting(false)
  }

  function goToSection(index: number) {
    setCurrentSectionIndex(index)
    setTimeLeft(sections[index].time_limit_sec)
  }

  function advanceSection() {
    if (isLastSection) {
      finalizeSubmission()
      return
    }
    if (shouldBreakAfterCurrent) {
      setOnBreak(true)
      setBreakTimeLeft(BREAK_DURATION_SEC)
      return
    }
    goToSection(currentSectionIndex + 1)
  }

  function resumeFromBreak() {
    setOnBreak(false)
    setBreakTimeLeft(null)
    goToSection(currentSectionIndex + 1)
  }

  const advanceRef = useRef(advanceSection)
  advanceRef.current = advanceSection
  const resumeRef = useRef(resumeFromBreak)
  resumeRef.current = resumeFromBreak

  // Section timer.
  useEffect(() => {
    if (onBreak || timeLeft === null || result) return

    if (timeLeft <= 0) {
      setConfirmOpen(false)
      advanceRef.current()
      return
    }

    const timer = setTimeout(() => {
      setTimeLeft((t) => (t !== null ? t - 1 : t))
    }, 1000)

    return () => clearTimeout(timer)
  }, [timeLeft, result, onBreak])

  // Break timer — separate clock, auto-resumes at zero.
  useEffect(() => {
    if (!onBreak || breakTimeLeft === null) return

    if (breakTimeLeft <= 0) {
      resumeRef.current()
      return
    }

    const timer = setTimeout(() => {
      setBreakTimeLeft((t) => (t !== null ? t - 1 : t))
    }, 1000)

    return () => clearTimeout(timer)
  }, [breakTimeLeft, onBreak])

  function handleFinishClick() {
    setConfirmOpen(true)
  }

  function handleConfirmFinish() {
    setConfirmOpen(false)
    advanceSection()
  }

  const confirmVariant: 'sterner' | 'plain' =
    (timeLeft ?? 0) > 0 && unansweredInSection > 0 ? 'sterner' : 'plain'

  const confirmTitle = isLastSection ? 'Confirm Finish Test' : 'Confirm Finish Section'
  const confirmMessage =
    confirmVariant === 'sterner'
      ? `You still have time remaining in this ${
          isLastSection ? 'test' : 'section'
        }, and ${unansweredInSection} question${
          unansweredInSection === 1 ? '' : 's'
        } unanswered. If you choose to finish, you will not be able to return. Are you sure you would like to finish?`
      : isLastSection
      ? 'If you select Finish, your answers will be submitted and you will not be able to return to the test.'
      : 'Are you sure you would like to finish this section? You will not be able to return to it.'

  if (onBreak) {
    return (
      <BreakScreen
        sectionLabel="Reading"
        timeLeft={breakTimeLeft}
        onResume={resumeFromBreak}
      />
    )
  }

  return (
    <div className="exam-layout">
      <QuestionNavSidebar
        questions={sectionQuestions.map((q: any) => ({
          id: q.id,
          number: sectionQuestionNumbers.get(q.id)!,
        }))}
        answers={answers}
      />

      <div className="exam-shell">
        <div className="card">
          <div className="exam-header">
            <div>
              <span className="folder-tab" style={{ background: 'var(--color-amber-dark)' }}>
                Reading
              </span>
              <h2>{currentSection?.label}</h2>
            </div>
            {timeLeft !== null && !result && (
              <span className={`timer-chip ${timeLeft <= 60 ? 'urgent' : ''}`}>
                {formatTime(timeLeft)}
              </span>
            )}
          </div>

          {currentSection?.parts.map((part: any) =>
            part.stimuli.map((stimulus: any) => (
              <div key={stimulus.id} style={{ marginBottom: 28 }}>
                <p className="stimulus-text">{stimulus.content}</p>

                {stimulus.questions.map((q: any) => (
                  <div key={q.id} id={questionAnchorId(q.id)}>
                    <QuestionInput
                      question={{
                        ...q,
                        prompt: `${sectionQuestionNumbers.get(q.id)}. ${q.prompt}`,
                      }}
                      value={answers[q.id] ?? ''}
                      onChange={(value) => handleAnswerChange(q.id, value)}
                    />
                  </div>
                ))}
              </div>
            ))
          )}

          {result ? (
            <div className="results-summary">
              <p style={{ fontWeight: 600 }}>Reading complete.</p>
              <button className="btn-primary" onClick={() => onComplete(result)}>
                Continue
              </button>
            </div>
          ) : (
            <button
              className={isLastSection ? 'btn-primary' : 'btn-secondary'}
              onClick={handleFinishClick}
              disabled={submitting}
            >
              {submitting
                ? 'Submitting...'
                : isLastSection
                ? 'Finish Reading'
                : "I'm finished — continue"}
            </button>
          )}
        </div>

        <ConfirmModal
          open={confirmOpen}
          variant={confirmVariant}
          title={confirmTitle}
          message={confirmMessage}
          confirmLabel={confirmVariant === 'sterner' ? 'Yes, finish' : 'Finish'}
          cancelLabel={
            confirmVariant === 'sterner' ? 'No, return to this section' : 'Cancel'
          }
          onConfirm={handleConfirmFinish}
          onCancel={() => setConfirmOpen(false)}
        />
      </div>
    </div>
  )
}

export default TestRunner