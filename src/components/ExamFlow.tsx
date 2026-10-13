import { useEffect, useState } from 'react'
import StudentEntry from './StudentEntry'
import ManifestExamRunner from './ManifestExamRunner'
import ResumePrompt from './ResumePrompt'
import {
  clearReloadIntent,
  clearSavedProgress,
  findUnfinishedAttempt,
  hasReloadIntent,
  loadExamSession,
  saveExamSession,
  type ExamSession,
} from '../lib/examSession'

// An exam the student is about to open, held back until they choose whether to
// continue an earlier unfinished attempt of it or start over.
type PendingResume = { session: ExamSession; savedAt: number | null }

function testTitleOf(test: any): string {
  return test?.title ?? test?.manifest?.exam?.title ?? 'this test'
}

// Decides what to show on first render.
//
// - No stored tab session: show the access-code login.
// - Stored session and the exam's own "Reload Exam" button was just pressed:
//   resume silently (that button promises exactly that).
// - Stored session, but this test + student has an unfinished attempt saved:
//   ask before restoring it. Until now the saved attempt was restored without
//   asking, so a student who left an exam unfinished and then opened the same
//   test again was dropped back into the old attempt.
// - Stored session with nothing worth restoring: just open it.
function initialFlow(): { session: ExamSession | null; pending: PendingResume | null } {
  const stored = loadExamSession()
  if (!stored) return { session: null, pending: null }
  if (hasReloadIntent()) return { session: stored, pending: null }

  const unfinished = findUnfinishedAttempt(stored.test.id, stored.studentName)
  if (unfinished) return { session: null, pending: { session: stored, savedAt: unfinished.savedAt } }

  return { session: stored, pending: null }
}

function ExamFlow() {
  // Seeded synchronously from sessionStorage so a deliberate reload (the
  // exam's own "Reload Exam" button) lands straight back in the exam instead
  // of bouncing through the login screen again. See src/lib/examSession.ts.
  const [initial] = useState(initialFlow)
  const [session, setSession] = useState<ExamSession | null>(initial.session)
  const [pending, setPending] = useState<PendingResume | null>(initial.pending)

  // The reload marker is single-use; clear it once it has been read.
  useEffect(() => {
    clearReloadIntent()
  }, [])

  function openExam(next: ExamSession) {
    saveExamSession(next)
    setPending(null)
    setSession(next)
  }

  function handleLogin(testData: any, name: string) {
    const next: ExamSession = { test: testData, studentName: name }
    const unfinished = findUnfinishedAttempt(testData.id, name)
    if (unfinished) {
      setPending({ session: next, savedAt: unfinished.savedAt })
      return
    }
    openExam(next)
  }

  if (session) {
    return <ManifestExamRunner test={session.test} studentName={session.studentName} />
  }

  if (pending) {
    return (
      <ResumePrompt
        testTitle={testTitleOf(pending.session.test)}
        savedAt={pending.savedAt}
        // Continue: the runner finds the saved progress and restores it.
        onContinue={() => openExam(pending.session)}
        // Start over: discard the old progress first so the runner starts clean.
        onStartOver={() => {
          clearSavedProgress(pending.session.test.id, pending.session.studentName)
          openExam(pending.session)
        }}
      />
    )
  }

  return <StudentEntry onSuccess={handleLogin} />
}

export default ExamFlow
