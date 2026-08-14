import { useState } from 'react'
import StudentEntry from './StudentEntry'
import ListeningRunner from './ListeningRunner'
import TestRunner from './TestRunner'
import WritingRunner from './WritingRunner'
import { generateResultsPdf } from '../lib/generateResultsPdf'

type Phase = 'entry' | 'listening' | 'reading' | 'writing' | 'complete'

interface SubtestResult {
  correctCount: number
  scorableCount: number
}

function ExamFlow() {
  const [phase, setPhase] = useState<Phase>('entry')
  const [testData, setTestData] = useState<any>(null)
  const [studentName, setStudentName] = useState('')
  const [sessionGroupId] = useState(() => crypto.randomUUID())
  const [listeningResult, setListeningResult] = useState<SubtestResult | null>(null)
  const [readingResult, setReadingResult] = useState<SubtestResult | null>(null)

  function handleEntrySuccess(data: any, name: string) {
    setTestData(data)
    setStudentName(name)
    setPhase('listening')
  }

  if (phase === 'entry') {
    return <StudentEntry onSuccess={handleEntrySuccess} />
  }

  if (phase === 'listening') {
    return (
      <ListeningRunner
        testData={testData}
        studentName={studentName}
        sessionGroupId={sessionGroupId}
        onComplete={(result) => {
          setListeningResult(result)
          setPhase('reading')
        }}
      />
    )
  }

  if (phase === 'reading') {
    return (
      <TestRunner
        testData={testData}
        studentName={studentName}
        sessionGroupId={sessionGroupId}
        onComplete={(result) => {
          setReadingResult(result)
          setPhase('writing')
        }}
      />
    )
  }

  if (phase === 'writing') {
    return (
      <WritingRunner
        testData={testData}
        studentName={studentName}
        sessionGroupId={sessionGroupId}
        onComplete={() => setPhase('complete')}
      />
    )
  }

  return (
    <div style={{ maxWidth: 500, margin: '40px auto', padding: 24 }}>
      <h2>All done, {studentName}!</h2>
      <p>Here's a summary of your results:</p>
      <ul>
        <li>
          Listening:{' '}
          {listeningResult
            ? `${listeningResult.correctCount} / ${listeningResult.scorableCount} correct`
            : '—'}
        </li>
        <li>
          Reading:{' '}
          {readingResult
            ? `${readingResult.correctCount} / ${readingResult.scorableCount} correct`
            : '—'}
        </li>
        <li>Writing: awaiting assessment</li>
      </ul>
      <button
        onClick={() =>
          generateResultsPdf(studentName, testData.title, listeningResult, readingResult)
        }
      >
        Download Results PDF
      </button>
      <p>Your tutor will provide your full results shortly.</p>
    </div>
  )
}

export default ExamFlow