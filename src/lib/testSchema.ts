import { z } from 'zod'

const questionTypes = [
  'gap_fill',
  'short_answer',
  'sentence_completion',
  'matching',
  'mcq_3',
  'mcq_4',
  'writing_task',
] as const

const questionSchema = z.object({
  question_type: z.enum(questionTypes),
  prompt: z.string(),
  options: z.array(z.string()).optional(),
  correct_answer: z.string().optional(),
  order_index: z.number(),
})

const stimulusSchema = z.object({
  type: z.enum(['text', 'audio']),
  content: z.string().optional(),
  file_ref: z.string().optional(),
  order_index: z.number(),
  questions: z.array(questionSchema).min(1),
})

const partSchema = z.object({
  label: z.string(),
  time_limit_sec: z.number(),
  instructions: z.string().optional(),
  stimuli: z.array(stimulusSchema).min(1),
})

const subtestSchema = z.object({
  type: z.enum(['listening', 'reading', 'writing']),
  parts: z.array(partSchema).min(1),
})

export const testJsonSchema = z.object({
  test: z.object({
    title: z.string(),
    profession: z.string().optional(),
  }),
  subtests: z.array(subtestSchema).min(1),
})

export type TestJson = z.infer<typeof testJsonSchema>