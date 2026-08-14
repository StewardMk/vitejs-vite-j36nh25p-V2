import jsPDF from 'jspdf'

interface SubtestResult {
  correctCount: number
  scorableCount: number
}

export function generateResultsPdf(
  studentName: string,
  testTitle: string,
  listeningResult: SubtestResult | null,
  readingResult: SubtestResult | null
) {
  const doc = new jsPDF()

  doc.setFontSize(18)
  doc.text('OET Practice Test Results', 20, 20)

  doc.setFontSize(12)
  doc.text(`Student: ${studentName}`, 20, 35)
  doc.text(`Test: ${testTitle}`, 20, 43)
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 51)

  doc.setFontSize(14)
  doc.text('Results', 20, 65)

  doc.setFontSize(12)
  let y = 75

  doc.text(
    `Listening: ${
      listeningResult
        ? `${listeningResult.correctCount} / ${listeningResult.scorableCount} correct`
        : 'Not completed'
    }`,
    20,
    y
  )
  y += 10

  doc.text(
    `Reading: ${
      readingResult
        ? `${readingResult.correctCount} / ${readingResult.scorableCount} correct`
        : 'Not completed'
    }`,
    20,
    y
  )
  y += 10

  doc.text('Writing: Awaiting assessment', 20, y)

  const safeName = studentName.trim().replace(/\s+/g, '_') || 'student'
  doc.save(`${safeName}_OET_Results.pdf`)
}