interface NavQuestion {
  id: string
  number: number
}

interface QuestionNavSidebarProps {
  questions: NavQuestion[]
  answers: Record<string, string>
  activeQuestionId?: string | null
}

/**
 * Pure navigation aid — doesn't own any state. Clicking a tab scrolls the
 * corresponding question into view; the questions themselves must be
 * rendered with a matching `id={questionAnchorId(question.id)}` wrapper for
 * this to have anything to scroll to.
 */
export function questionAnchorId(questionId: string) {
  return `question-${questionId}`
}

function QuestionNavSidebar({ questions, answers, activeQuestionId }: QuestionNavSidebarProps) {
  function handleSelect(questionId: string) {
    const el = document.getElementById(questionAnchorId(questionId))
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <nav className="nav-sidebar" aria-label="Question navigation">
      {questions.map((q) => {
        const answered = Boolean(answers[q.id])
        const isActive = q.id === activeQuestionId
        return (
          <button
            key={q.id}
            type="button"
            className={`nav-tab ${answered ? 'answered' : ''} ${isActive ? 'current' : ''}`}
            onClick={() => handleSelect(q.id)}
            aria-current={isActive || undefined}
            title={`Question ${q.number}${answered ? ' (answered)' : ' (unanswered)'}`}
          >
            {q.number}
          </button>
        )
      })}
    </nav>
  )
}

export default QuestionNavSidebar