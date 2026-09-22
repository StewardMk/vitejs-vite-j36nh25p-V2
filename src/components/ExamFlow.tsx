import { useState } from 'react'
import StudentEntry from './StudentEntry'
import ManifestExamRunner from './ManifestExamRunner'
import { loadExamSession, saveExamSession, type ExamSession } from '../lib/examSession'

function ExamFlow() {
  // Seeded synchronously from sessionStorage so a reload (including the
  // exam's own "Reload Exam" button) lands straight back in the exam
  // instead of bouncing through the login screen again. See
  // src/lib/examSession.ts for why this exists.
  const [session, setSession] = useState<ExamSession | null>(() => loadExamSession())

  if (!session) {
    return (
      <StudentEntry
        onSuccess={(testData, name) => {
          const next: ExamSession = { test: testData, studentName: name }
          saveExamSession(next)
          setSession(next)
        }}
      />
    )
  }

  return <ManifestExamRunner test={session.test} studentName={session.studentName} />
}

export default ExamFlow