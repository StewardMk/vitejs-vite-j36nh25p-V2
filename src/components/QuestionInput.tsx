interface Question {
  id: string
  prompt: string
  question_type: string
  options: string[] | null
}

interface QuestionInputProps {
  question: Question
  value: string
  onChange: (value: string) => void
}

function QuestionInput({ question, value, onChange }: QuestionInputProps) {
  const { question_type, options, prompt, id } = question

  const isChoiceType =
    question_type === 'mcq_3' ||
    question_type === 'mcq_4'

  if (isChoiceType) {
    return (
      <div className="question-block">
        <p className="question-prompt">{prompt}</p>
        {options?.map((opt, i) => (
          <label key={i} className="option-label">
            <input
              type="radio"
              name={id}
              value={opt}
              checked={value === opt}
              onChange={(e) => onChange(e.target.value)}
            />
            {opt}
          </label>
        ))}
      </div>
    )
  }

  if (question_type === 'writing_task') {
    return (
      <div className="question-block">
        <p className="question-prompt">{prompt}</p>
        <textarea
          className="exam-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={10}
        />
      </div>
    )
  }

  return (
    <div className="question-block">
      <p className="question-prompt">{prompt}</p>
      <input
        type="text"
        className="exam-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export default QuestionInput