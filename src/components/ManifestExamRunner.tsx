import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import ExamChrome, { type ExamNavGroup } from './ExamChrome'
import ConfirmModal from './ConfirmModal'
import AudioPlayer, { type AudioPlayerHandle } from './AudioPlayer'
import DraggablePdfWindow from './DraggablePdfWindow'

function formatTime(total: number) {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function fileUrl(testId: string, bucket: string, fileRef: string) {
  const path = `${testId}/${fileRef}`
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

function questionText(q: any) {
  return q.question ?? q.prompt ?? q.label ?? ''
}

// ============================================================
// Intro-page copy renderer. Content strings use a tiny markdown-like
// syntax: blocks separated by a blank line; '---' on its own = <hr>;
// a line starting with '## ' = sub-heading; consecutive lines starting
// with '- ' = a bullet list; '**text**' = bold. Plain lines = <p>.
// ============================================================
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part
  )
}

function renderIntroBlock(block: string, key: number) {
  if (block.trim() === '---') return <hr key={key} />
  const lines = block.split('\n').filter((l) => l.trim() !== '')
  const elements: React.ReactNode[] = []
  let bulletBuffer: string[] = []
  const flushBullets = () => {
    if (bulletBuffer.length) {
      elements.push(
        <ul key={`ul-${elements.length}`}>
          {bulletBuffer.map((li, i) => (
            <li key={i}>{renderInline(li)}</li>
          ))}
        </ul>
      )
      bulletBuffer = []
    }
  }
  lines.forEach((line, i) => {
    if (line.startsWith('## ')) {
      flushBullets()
      elements.push(<h3 key={`h-${i}`}>{renderInline(line.slice(3))}</h3>)
    } else if (line.startsWith('- ')) {
      bulletBuffer.push(line.slice(2))
    } else {
      flushBullets()
      elements.push(<p key={`p-${i}`}>{renderInline(line)}</p>)
    }
  })
  flushBullets()
  return <div key={key}>{elements}</div>
}

// NOTE: `listening_intro` and `reading_bc_intro` are NEW stage ids that
// don't exist in the manifest yet -- these two entries have no effect
// until matching stage objects are added to tests.manifest.exam.stages
// in Supabase (see handover notes). Every other key below matches an
// existing stage id and takes effect immediately.
const INTRO_COPY: Record<string, string> = {
  listening_intro:
    "You are about to start the Listening test. This test will take approximately 40 minutes. As soon as you click **'Next'** below, the audio will begin to play automatically, and you will not be able to pause or replay the recording.\n\n- **Part A:** After completing each section, use any remaining time to check your answers.\n- **Part B:** You won't be able to go back to previous questions once they are completed.\n- **Part C:** After completing each section, use any remaining time to check your answers.\n\nYou can also click **'Next'** to go to the next section. **You cannot return to a section after you click 'Next'.**\n\n- **One mark will be granted for each correct answer.**\n- **Answer ALL questions. Marks are NOT deducted for incorrect answers.**\n\nPlease be patient. The Listening test may take a few moments to load.\n\nPlease click the **'Next'** button and then **'Yes, I would like to finish this section'** to begin the Listening sub-test.",
  listening_a_intro:
    "In this part of the test, you'll hear two different extracts. In each extract, a health professional is talking to a patient.\n\nComplete the notes with information that you hear.\n\nNow, look at the notes for extract one.",
  listening_b_intro:
    "In this part of the test, you'll hear six different extracts. In each extract, you'll hear people talking in a different healthcare setting.\n\nChoose the answer (A, B or C) which fits best according to what you hear. You'll have time to read each question before you listen. Complete your answers as you listen.\n\n**After you answer each Part B question, click 'Next' to proceed. You will not be able to return to previous questions.**\n\nEnsure you complete all six questions before the timer ends.",
  listening_c_intro:
    "In this part of the test, you'll hear two different extracts. In each extract, you'll hear health professionals talking about aspects of their work.\n\nChoose the answer (A, B or C) which fits best according to what you hear.\n\nYou'll have time to read the questions before you listen.\n\nComplete your answers as you listen.\n\nUse the 'Next' button to move on to Extract 2.",
  reading_intro:
    "## Part A\n\n- You have 15 minutes to complete Part A.\n- Answer the questions on the right using the texts on the left.\n- **One mark will be granted for each correct answer.**\n- **Answer ALL questions. Marks are NOT deducted for incorrect answers.**\n- When you click 'Next' below, the 15-minute timer will start.\n\n## Scheduled break after Part A\n\n- After Part A, there is an optional 10-minute break.\n- The break starts when you click 'Next' at the end of Part A.\n- If you leave the room or the Proctor's view, you must complete the check-in procedure again when you return.\n\n## Parts B and C\n\n- At the end of the break, or when you click 'Resume Test' during the break, the 45-minute timer for Parts B and C will start.\n- You can move between all questions in Parts B and C with the blue numbered tabs or with the 'Next' and 'Back' buttons.\n\nClick 'Next' button to begin the Reading sub-test.",
  reading_bc_intro:
    "In this part of the test, there are six short extracts relating to the work of health professionals.\n\nFor each question, choose the answer (A, B or C) which you think fits best according to the text.\n\nUse the blue numbered tabs or 'Next' and 'Back' buttons to move between questions.",
  writing_intro:
    "You are about to start the Writing test.\n\n## Time allowed\n\n- **Reading time:** 5 minutes\n- **Writing time:** 40 minutes\n\n## Reading time (5 minutes)\n\n- During this time, you can review the writing task and notes.\n- You cannot highlight text or type notes.\n- If you click 'Next' before 5 minutes' Reading time are up, you'll move to the Writing task.\n\n## Writing time (40 minutes)\n\n- After the reading time, the 40-minute timer will begin automatically.\n- You can use the highlighter function and type your response in the text box.\n\n**Once you complete the test, you need to click 'Finish Test' on the top right-hand side of the screen and you will not be able to return to the test.**\n\nClick 'Next' button to begin the Writing sub-test.",
}

const WRITING_READING_ONLY_COPY =
  "You now have 5 minutes to read the Case Notes and the Writing Task. You will not be able to use the highlight function on the PDF during this section. You will be able to use the highlight function on the PDF in the next section.\n\nAfter 5 minutes you will then progress to the next section where you will have the Case Notes and the Writing Task, and 40 minutes to write your answer in a text box.\n\nPlease click 'Next' and then 'Yes, I would like to finish this section' to end this 'reading only' section and begin the Writing section of the test."

// ============================================================
// Flatten stages -> one entry per actual screen the candidate sees.
// This is the piece the old flat renderer was missing entirely.
// ============================================================
interface Page {
  key: string
  stageId: string
  sectionLabel: string
  navGroupLabel: string
  timerKey: string | null
  isStageFirstPage: boolean
  isStageLastPage: boolean
  isFinalPage: boolean
  kind:
    | 'intro'
    | 'break'
    | 'listening_extract'
    | 'listening_question'
    | 'reading_all'
    | 'reading_question'
    | 'reading_extract'
    | 'writing_reading'
    | 'writing'
  stage: any
  data?: any
  stageQuestions: any[]
}

function buildPages(stages: any[]): Page[] {
  const pages: Page[] = []

  function stageAllQuestions(stage: any): any[] {
    const qs: any[] = [...(stage.questions ?? [])]
    for (const ex of stage.extracts ?? []) qs.push(...(ex.questions ?? []))
    return qs
  }

  stages.forEach((stage, stageIdx) => {
    const stageQuestions = stageAllQuestions(stage)
    const isLastStage = stageIdx === stages.length - 1

    function push(kind: Page['kind'], data: any, subIdx: number, subCount: number) {
      const key = `${stage.id}-${subIdx}`
      // Scoped to Parts A/C only (confirmed broken) -- Part B's six short
      // questions stay on the shared-stage timer for now since a full
      // independent timer per question would balloon its total time.
      const perPageTimer = kind === 'listening_extract'
      pages.push({
        key,
        stageId: stage.id,
        sectionLabel: perPageTimer && subCount > 1 ? `${stage.label}-${subIdx + 1}` : stage.label,
        navGroupLabel: stage.label,
        // Listening: each extract/question gets its OWN independent countdown
        // (matches the real test's "Listening Part A-1" / "-2" sectioning).
        // Everything else keeps sharing a clock at the stage/section_group level.
        timerKey: perPageTimer ? key : stage.section_group ?? stage.id,
        isStageFirstPage: subIdx === 0,
        isStageLastPage: subIdx === subCount - 1,
        isFinalPage: isLastStage && subIdx === subCount - 1,
        kind,
        stage,
        data,
        stageQuestions,
      })
    }

    if (stage.presentation === 'introduction') {
      push('intro', null, 0, 1)
      return
    }

    if (stage.id === 'reading_break') {
      push('break', null, 0, 1)
      return
    }

    if (stage.presentation === 'audio') {
      const extracts = stage.extracts
      if (extracts && extracts.length) {
        extracts.forEach((ex: any, i: number) => push('listening_extract', ex, i, extracts.length))
      } else {
        const qs = stage.questions ?? []
        qs.forEach((q: any, i: number) => push('listening_question', q, i, qs.length))
      }
      return
    }

    if (stage.id === 'reading_a') {
      push('reading_all', null, 0, 1)
      return
    }

    if (stage.presentation === 'question_page') {
      const qs = stage.questions ?? []
      qs.forEach((q: any, i: number) => push('reading_question', q, i, qs.length))
      return
    }

    if (stage.presentation === 'pdf' && stage.id === 'reading_c') {
      const docs = stage.documents ?? []
      docs.forEach((doc: any, i: number) => {
        push('reading_extract', { doc }, i, docs.length)
      })
      return
    }

    if (stage.presentation === 'pdf' && stage.id === 'writing_reading') {
      push('writing_reading', null, 0, 1)
      return
    }

    if (stage.presentation === 'writing') {
      push('writing', null, 0, 1)
      return
    }

    push('reading_all', null, 0, 1)
  })

  return pages
}

// ============================================================
// Page content
// ============================================================
function OptionList({ q, value, onChange }: { q: any; value: string; onChange: (v: string) => void }) {
  return (
    <div className="manifest-options">
      {(q.options ?? []).map((option: any) => (
        <label key={option.id} className={`manifest-option ${value === option.id ? 'selected' : ''}`}>
          <input type="radio" name={q.id} value={option.id} checked={value === option.id} onChange={() => onChange(option.id)} />
          <span className="option-letter">{option.id}</span>
          <span>{option.text}</span>
        </label>
      ))}
    </div>
  )
}

function QuestionInput({ q, value, onChange }: { q: any; value: string; onChange: (v: string) => void }) {
  if (q.question_type === 'multiple_choice') return <OptionList q={q} value={value} onChange={onChange} />
  return (
    <input
      className="manifest-answer-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Type your answer"
      autoComplete="off"
    />
  )
}

function ManifestExamRunner({ test, studentName }: { test: any; studentName: string }) {
  const stages: any[] = test.manifest?.exam?.stages ?? []
  const pages = useMemo(() => buildPages(stages), [stages])

  const [pageIndex, setPageIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [completed, setCompleted] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingAdvance, setPendingAdvance] = useState<'next' | 'finish' | null>(null)
  const [timeUpOpen, setTimeUpOpen] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [pdfPinned, setPdfPinned] = useState(false)
  const [pdfPanelWidth, setPdfPanelWidth] = useState(480)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const saveAttemptRef = useRef(false)

  const audioRef = useRef<AudioPlayerHandle | null>(null)
  const advanceRef = useRef<() => void>(() => {})
  const lastAutoPlayedKey = useRef<string | null>(null)

  const page = pages[pageIndex]

  const setAnswer = (id: string, value: string) => setAnswers((prev) => ({ ...prev, [id]: value }))

  const durationByTimerKey = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of pages) {
      const key = p.timerKey
      if (key && !map.has(key) && typeof p.stage.duration_seconds === 'number') {
        map.set(key, p.stage.duration_seconds)
      }
    }
    return map
  }, [pages])

  useEffect(() => {
    if (pages.length) {
      const key = pages[0].timerKey
      setTimeLeft(key ? durationByTimerKey.get(key) ?? null : null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!page) return
    const hasAudio =
      page.kind === 'listening_extract' ||
      page.kind === 'listening_question' ||
      (page.kind === 'intro' && page.stage.audio?.file_ref)
    if (hasAudio) {
      if (lastAutoPlayedKey.current !== page.key) {
        lastAutoPlayedKey.current = page.key
        setTimeout(() => audioRef.current?.play(), 50)
      }
    }
  }, [page])

  function openPdf() {
    setPdfOpen(true)
    setPdfPinned(true)
  }

  function goToPage(index: number) {
    const target = pages[index]
    const prevKey = page?.timerKey
    setPageIndex(index)
    if (target.timerKey !== prevKey) {
      setTimeLeft(target.timerKey ? durationByTimerKey.get(target.timerKey) ?? null : null)
    }
    setPdfOpen(false)
    setPdfPinned(false)
  }

  async function saveAttempt() {
    if (saveAttemptRef.current) return true
    setSaving(true)
    setSaveError(null)

    try {
      const { error } = await supabase.rpc('save_manifest_attempt', {
        p_test_id: test.id,
        p_student_name: studentName,
        p_answers: answers,
      })

      if (error) throw new Error(error.message)
      saveAttemptRef.current = true
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save your test results.'
      setSaveError(message)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function finishTest() {
    const saved = await saveAttempt()
    if (saved) setCompleted(true)
  }

  function actuallyAdvance() {
    if (page.isFinalPage) {
      void finishTest()
      return
    }
    goToPage(pageIndex + 1)
  }

  function skipToNextStageBoundary() {
    let i = pageIndex
    while (i < pages.length - 1 && !pages[i].isStageLastPage) i++
    if (i >= pages.length - 1) {
      void finishTest()
      return
    }
    goToPage(i + 1)
  }

  advanceRef.current = () => {
    if (pendingAdvance === 'finish' || (page && page.isStageLastPage)) {
      skipToNextStageBoundary()
    } else {
      actuallyAdvance()
    }
  }

  useEffect(() => {
    if (timeLeft === null || completed) return
    if (timeLeft <= 0) {
      if (!timeUpOpen) setTimeUpOpen(true)
      return
    }
    const t = window.setTimeout(() => setTimeLeft((v) => (v === null ? v : v - 1)), 1000)
    return () => window.clearTimeout(t)
  }, [timeLeft, completed, timeUpOpen])

  function handleTimeUpContinue() {
    setTimeUpOpen(false)
    advanceRef.current()
  }

  const unansweredInStage = useMemo(() => {
    if (!page) return 0

    let questions = page.stageQuestions

    if (page.kind === 'reading_extract') {
      const docId = page.data?.doc?.id
      const docIndex = (page.stage.documents ?? []).findIndex((doc: any) => doc.id === docId)
      const allQuestions = page.stage.questions ?? []
      const byExtract = allQuestions.filter((q: any) => q.extract_id === docId)

      questions = byExtract.length
        ? byExtract
        : allQuestions.filter((q: any) => {
            const order = Number(q.order_index)
            return docIndex === 0 ? order >= 7 && order <= 14 : order >= 15 && order <= 22
          })
    }

    return questions.filter((q: any) => !answers[q.id]?.trim()).length
  }, [page, answers])

  function handleNextClick() {
    if (!page) return
    if (page.isStageLastPage && unansweredInStage > 0) {
      setPendingAdvance('next')
      setConfirmOpen(true)
      return
    }
    actuallyAdvance()
  }

  function handleFinishClick() {
    setPendingAdvance('finish')
    setConfirmOpen(true)
  }

  function handleConfirm() {
    setConfirmOpen(false)
    if (pendingAdvance === 'finish') skipToNextStageBoundary()
    else actuallyAdvance()
    setPendingAdvance(null)
  }

  const confirmVariant: 'sterner' | 'plain' = (timeLeft ?? 0) > 0 && unansweredInStage > 0 ? 'sterner' : 'plain'
  const confirmTitle = pendingAdvance === 'finish' ? 'Confirm Finish Section' : 'Confirm Continue'
  const confirmMessage =
    confirmVariant === 'sterner'
      ? `You still have time remaining, and ${unansweredInStage} question${unansweredInStage === 1 ? '' : 's'} unanswered in this section. If you continue, you will not be able to return. Are you sure?`
      : 'If you continue, you will not be able to return to this section. Are you sure?'

  const timeUpMessage = page
    ? page.isFinalPage
      ? `Time for ${page.sectionLabel} has expired. This is the end of the test — click Continue to finish.`
      : `Time for ${page.sectionLabel} has expired. You'll now move on to the next section automatically.`
    : ''

  const questionCount = useMemo(() => {
    let n = 0
    for (const s of stages) {
      n += s.questions?.length ?? 0
      for (const e of s.extracts ?? []) n += e.questions?.length ?? 0
    }
    return n
  }, [stages])

  if (completed) {
    return (
      <div className="manifest-complete-page">
        <div className="card">
          <span className="eyebrow">Test complete</span>
          <h1>Well done, {studentName}.</h1>
          <p>You have completed the {test.title} practice examination.</p>
          <p className="muted">Your responses have been saved to your test attempt. Scoring will be added once our verified answer key is prepared.</p>
          <div className="completion-stat"><strong>{Object.keys(answers).length}</strong><span>responses recorded</span></div>
          <div className="completion-stat"><strong>{questionCount}</strong><span>questions in this exam</span></div>
        </div>
      </div>
    )
  }

  if (!page) return null

  const navGroups: ExamNavGroup[] = []
  let runningPageNumber = 0
  const pageNumberOf = new Map<string, number>()
  for (const p of pages) {
    runningPageNumber++
    pageNumberOf.set(p.key, runningPageNumber)
    let group = navGroups[navGroups.length - 1]
    if (!group || group.label !== p.navGroupLabel) {
      group = { label: p.navGroupLabel, tabs: [] }
      navGroups.push(group)
    }
    const answeredOnPage =
      p.kind === 'listening_extract'
        ? (p.data?.questions ?? []).every((q: any) => answers[q.id]?.trim())
        : p.kind === 'reading_question' || p.kind === 'listening_question'
        ? Boolean(answers[p.data?.id]?.trim())
        : undefined
    group.tabs.push({ key: p.key, number: runningPageNumber, answered: answeredOnPage, stageId: p.stageId })
  }

  const currentPdfDoc =
    page.kind === 'reading_all'
      ? page.stage.documents?.[0]
      : page.kind === 'reading_extract'
      ? page.data?.doc
      : page.kind === 'writing_reading' || page.kind === 'writing'
      ? stages.find((s) => s.id === 'writing_reading')?.documents?.[0]
      : null

  return (
    <>
      <ExamChrome
        pageNumber={pageNumberOf.get(page.key) ?? pageIndex + 1}
        sectionLabel={page.sectionLabel}
        testTitle={test.title}
        candidateName={studentName}
        timerLabel={page.kind === 'intro' ? 'Introduction Time Remaining' : 'Section Time Remaining'}
        timerValue={timeLeft !== null ? formatTime(timeLeft) : null}
        timerUrgent={timeLeft !== null && timeLeft <= 60}
        finishLabel={page.isFinalPage ? 'Finish Test' : 'Finish Section'}
        onFinishClick={handleFinishClick}
        navGroups={navGroups}
        activeNavKey={page.key}
        onNavSelect={(key) => {
          if (page.stage.presentation === 'audio') return
          const idx = pages.findIndex((p) => p.key === key)
          if (idx >= 0 && pages[idx].stageId === page.stageId) goToPage(idx)
        }}
        onBack={
          pageIndex > 0 &&
          pages[pageIndex - 1].stageId === page.stageId &&
          page.stage.presentation !== 'audio'
            ? () => goToPage(pageIndex - 1)
            : undefined
        }
        onNext={handleNextClick}
        nextLabel={page.isFinalPage ? 'Finish' : 'Next'}
        leftInset={pdfOpen && pdfPinned ? pdfPanelWidth : undefined}
      >
        {page.kind === 'intro' && (
          <div className="manifest-intro-stage">
            <span className="folder-tab">{page.stage.section}</span>
            <h1>{page.stage.label}</h1>
            <div className="intro-copy">
              {(INTRO_COPY[page.stage.id] ?? 'Please read the instructions carefully before continuing.')
                .split('\n\n')
                .map((block, i) => renderIntroBlock(block, i))}
            </div>
            {page.stage.audio?.file_ref && (
              <AudioPlayer ref={audioRef} src={fileUrl(test.id, 'listening-audio', page.stage.audio.file_ref)} />
            )}
          </div>
        )}

        {page.kind === 'break' && (
          <div className="manifest-intro-stage">
            <h1>Optional Break</h1>
            <p>You may take a short break before continuing. Click Next when you're ready to resume.</p>
          </div>
        )}

        {page.kind === 'listening_extract' && (
          <div className="manifest-extract">
            <h2>{page.data.title ?? `Extract ${page.data.order_index}`}</h2>
            <AudioPlayer ref={audioRef} src={fileUrl(test.id, 'listening-audio', page.data.file_ref)} />
            {page.data.instructions && <p>{page.data.instructions}</p>}
            {(page.data.questions ?? []).map((q: any) => (
              <div className="manifest-question-card" key={q.id}>
                <h3>{q.order_index}. {q.question ?? q.label}</h3>
                {q.notes_template && <pre className="manifest-notes-template">{q.notes_template}</pre>}
                <QuestionInput q={q} value={answers[q.id] ?? ''} onChange={(v) => setAnswer(q.id, v)} />
              </div>
            ))}
          </div>
        )}

        {page.kind === 'listening_question' && (
          <div className="manifest-question-card">
            <AudioPlayer ref={audioRef} src={fileUrl(test.id, 'listening-audio', page.data.audio.file_ref)} />
            <h3>{page.data.order_index}. {questionText(page.data)}</h3>
            <QuestionInput q={page.data} value={answers[page.data.id] ?? ''} onChange={(v) => setAnswer(page.data.id, v)} />
          </div>
        )}

        {page.kind === 'reading_all' && (
          <div className="manifest-question-stage">
            <button className="btn-secondary" onClick={openPdf} style={{ marginBottom: 16 }}>
              View exam document
            </button>
            {(page.stage.questions ?? []).map((q: any) => (
              <div className="manifest-question-card" key={q.id}>
                <h3>{q.order_index}. {questionText(q)}</h3>
                <QuestionInput q={q} value={answers[q.id] ?? ''} onChange={(v) => setAnswer(q.id, v)} />
              </div>
            ))}
          </div>
        )}

        {page.kind === 'reading_question' && (
          <div className="manifest-question-card">
            {page.data.passage && <div className="manifest-passage">{page.data.passage}</div>}
            <h3>{page.data.order_index}. {questionText(page.data)}</h3>
            <QuestionInput q={page.data} value={answers[page.data.id] ?? ''} onChange={(v) => setAnswer(page.data.id, v)} />
          </div>
        )}

        {page.kind === 'reading_extract' && (
          <div className="manifest-question-stage">
            <button className="btn-secondary" onClick={openPdf} style={{ marginBottom: 16 }}>
              View {page.data.doc.title ?? 'exam document'}
            </button>
            {(() => {
              const docId = page.data.doc.id
              const docIndex = (page.stage.documents ?? []).findIndex((doc: any) => doc.id === docId)
              const allQuestions = page.stage.questions ?? []
              const extractQuestions = allQuestions.filter((q: any) => q.extract_id === docId)

              // Older manifests may not have extract_id. In that case, Reading C
              // is 16 questions split evenly across its two PDF extracts.
              const questions = extractQuestions.length
                ? extractQuestions
                : allQuestions.filter((q: any) => {
                    const order = Number(q.order_index)
                    return docIndex === 0 ? order >= 7 && order <= 14 : order >= 15 && order <= 22
                  })

              return questions.map((q: any) => (
                <div className="manifest-question-card" key={q.id}>
                  <h3>{q.order_index}. {questionText(q)}</h3>
                  <QuestionInput q={q} value={answers[q.id] ?? ''} onChange={(v) => setAnswer(q.id, v)} />
                </div>
              ))
            })()}
          </div>
        )}

        {page.kind === 'writing_reading' && (
          <div className="manifest-intro-stage">
            <div className="intro-copy">
              {WRITING_READING_ONLY_COPY.split('\n\n').map((block, i) => renderIntroBlock(block, i))}
            </div>
            <button className="btn-secondary" onClick={openPdf}>
              Writing Case Notes
            </button>
          </div>
        )}

        {page.kind === 'writing' && (
          <div className="manifest-writing-stage">
            <button className="btn-secondary" onClick={openPdf} style={{ marginBottom: 16 }}>
              View case notes
            </button>
            {page.stage.questions?.[0] && (
              <>
                <p className="writing-prompt">{questionText(page.stage.questions[0])}</p>
                <textarea
                  className="manifest-writing-box"
                  value={answers[page.stage.questions[0].id] ?? ''}
                  onChange={(e) => setAnswer(page.stage.questions[0].id, e.target.value)}
                  placeholder="Write your response here…"
                />
              </>
            )}
          </div>
        )}
      </ExamChrome>

      {pdfOpen && currentPdfDoc && (
        <DraggablePdfWindow
          title={currentPdfDoc.title ?? 'Exam document'}
          src={`${fileUrl(test.id, 'exam-documents', currentPdfDoc.file_ref)}${
            currentPdfDoc.page_start ? `#page=${currentPdfDoc.page_start}` : ''
          }`}
          pinned={pdfPinned}
          onTogglePin={() => setPdfPinned((v) => !v)}
          onResize={setPdfPanelWidth}
          onClose={() => {
            setPdfOpen(false)
            setPdfPinned(false)
          }}
        />
      )}

      {saving && (
        <div className="card" style={{ position: 'fixed', inset: 'auto 24px 24px auto', zIndex: 1000, padding: 16 }}>
          Saving your test results…
        </div>
      )}

      {saveError && !completed && (
        <div className="card" style={{ position: 'fixed', inset: 'auto 24px 24px auto', zIndex: 1000, padding: 16 }}>
          <strong>Could not save your test results.</strong>
          <p className="muted">{saveError}</p>
          <button className="btn-primary" onClick={() => void finishTest()} disabled={saving}>
            {saving ? 'Saving…' : 'Try again'}
          </button>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        variant={confirmVariant}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel="Yes, continue"
        cancelLabel="No, stay here"
        onConfirm={handleConfirm}
        onCancel={() => {
          setConfirmOpen(false)
          setPendingAdvance(null)
        }}
      />

      <ConfirmModal
        open={timeUpOpen}
        variant="notice"
        title="Time's Up"
        message={timeUpMessage}
        confirmLabel="Continue"
        onConfirm={handleTimeUpContinue}
      />
    </>
  )
}

export default ManifestExamRunner
