import { supabase } from './supabase'

interface QuestionForScoring {
  id: string
  question_type: string
}

export async function submitAttempt(
  testId: string,
  subtestType: string,
  questions: QuestionForScoring[],
  answers: Record<string, string>,
  studentName: string,
  sessionGroupId: string
) {
  const { data, error } = await supabase.functions.invoke('Score-Attempt', {
    body: {
      testId,
      subtestType,
      questionIds: questions.map((q) => q.id),
      answers,
      studentName,
      sessionGroupId,
    },
  })

  if (error) {
    throw new Error(`Submission failed: ${error.message}`)
  }

  return data as { attemptId: string; correctCount: number; scorableCount: number }
}