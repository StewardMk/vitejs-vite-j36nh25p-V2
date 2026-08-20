import { useState } from 'react'
import StudentEntry from './StudentEntry'
import ManifestExamRunner from './ManifestExamRunner'

function ExamFlow() {
  const [test, setTest] = useState<any>(null)
  const [studentName, setStudentName] = useState('')

  if (!test) {
    return (
      <StudentEntry
        onSuccess={(testData, name) => {
          setTest(testData)
          setStudentName(name)
        }}
      />
    )
  }

  return <ManifestExamRunner test={test} studentName={studentName} />
}

export default ExamFlow
