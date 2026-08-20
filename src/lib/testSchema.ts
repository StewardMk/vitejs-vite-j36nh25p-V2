import { z } from 'zod'

const optionSchema = z.object({
  id: z.string(),
  text: z.string(),
}).passthrough()

const questionSchema = z.object({
  id: z.string(),
  order_index: z.number(),
  question_type: z.string(),
  prompt: z.string().optional(),
  question: z.string().optional(),
  label: z.string().optional(),
  passage: z.string().optional(),
  options: z.array(optionSchema).optional(),
  correct_answer: z.string().nullable().optional(),
  audio: z.object({ file_ref: z.string() }).optional(),
}).passthrough()

const documentSchema = z.object({
  id: z.string().optional(),
  order_index: z.number().optional(),
  title: z.string().optional(),
  file_ref: z.string(),
  page_start: z.number().nullable().optional(),
  page_end: z.number().nullable().optional(),
}).passthrough()

const extractSchema = z.object({
  id: z.string(),
  order_index: z.number(),
  file_ref: z.string(),
  questions: z.array(questionSchema).optional(),
}).passthrough()

const stageSchema = z.object({
  id: z.string(),
  section: z.string(),
  part: z.string().optional(),
  label: z.string(),
  presentation: z.enum(['introduction', 'audio', 'pdf', 'question_page', 'writing']),
  duration_seconds: z.number().nullable().optional(),
  section_group: z.string().optional(),
  optional: z.boolean().optional(),
  instructions: z.string().optional(),
  audio: z.object({ file_ref: z.string() }).optional(),
  documents: z.array(documentSchema).optional(),
  extracts: z.array(extractSchema).optional(),
  questions: z.array(questionSchema).optional(),
}).passthrough()

export const testJsonSchema = z.object({
  schema_version: z.string(),
  exam: z.object({
    id: z.string(),
    title: z.string(),
    profession: z.string(),
    language: z.string().optional(),
    stages: z.array(stageSchema).min(1),
    asset_handling: z.record(z.string(), z.unknown()).optional(),
  }).passthrough(),
}).passthrough()

export type TestJson = z.infer<typeof testJsonSchema>
