import { supabase } from './supabase'
import type { TestJson } from './testSchema'

export async function uploadTest(test: TestJson, audioFiles: FileList | null) {
  const audioMap = new Map<string, File>()
  if (audioFiles) {
    for (const file of Array.from(audioFiles)) {
      audioMap.set(file.name, file)
    }
  }

  const { data: testRow, error: testError } = await supabase
    .from('tests')
    .insert({ title: test.test.title, profession: test.test.profession ?? null })
    .select()
    .single()
  if (testError || !testRow) {
    throw new Error(`Failed to create test: ${testError?.message}`)
  }

  try {
    let questionCount = 0

    for (const subtest of test.subtests) {
      const { data: subtestRow, error: subtestError } = await supabase
        .from('subtests')
        .insert({ test_id: testRow.id, type: subtest.type })
        .select()
        .single()
      if (subtestError || !subtestRow) {
        throw new Error(`Failed to create subtest "${subtest.type}": ${subtestError?.message}`)
      }

      for (const part of subtest.parts) {
        const { data: partRow, error: partError } = await supabase
          .from('parts')
          .insert({
            subtest_id: subtestRow.id,
            label: part.label,
            time_limit_sec: part.time_limit_sec,
            instructions: part.instructions ?? null,
          })
          .select()
          .single()
        if (partError || !partRow) {
          throw new Error(`Failed to create part "${part.label}": ${partError?.message}`)
        }

        for (const stimulus of part.stimuli) {
          let storagePath: string | null = null

          if (stimulus.type === 'audio') {
            if (!stimulus.file_ref) {
              throw new Error(`Audio stimulus in "${part.label}" is missing a file_ref.`)
            }
            const file = audioMap.get(stimulus.file_ref)
            if (!file) {
              throw new Error(
                `No selected audio file matches "${stimulus.file_ref}" — check your file selection and naming.`
              )
            }

            const path = `${crypto.randomUUID()}-${file.name}`
            const { error: uploadError } = await supabase.storage
              .from('listening-audio')
              .upload(path, file)
            if (uploadError) {
              throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`)
            }

            storagePath = path
          }

          const { data: stimulusRow, error: stimulusError } = await supabase
            .from('stimuli')
            .insert({
              part_id: partRow.id,
              type: stimulus.type,
              content: stimulus.content ?? null,
              file_url: storagePath,
              order_index: stimulus.order_index,
            })
            .select()
            .single()
          if (stimulusError || !stimulusRow) {
            throw new Error(`Failed to create a stimulus in "${part.label}": ${stimulusError?.message}`)
          }

          for (const question of stimulus.questions) {
            const { error: questionError } = await supabase.from('questions').insert({
              part_id: partRow.id,
              stimulus_id: stimulusRow.id,
              question_type: question.question_type,
              prompt: question.prompt,
              options: question.options ?? null,
              correct_answer: question.correct_answer ?? null,
              order_index: question.order_index,
            })
            if (questionError) {
              throw new Error(`Failed to create a question in "${part.label}": ${questionError.message}`)
            }
            questionCount++
          }
        }
      }
    }

    return { testId: testRow.id, questionCount }
  } catch (err) {
    // Something failed partway through — clean up the partial test rather
    // than leaving orphaned rows behind. Cascading deletes handle every
    // dependent subtest/part/stimulus/question automatically.
    await supabase.from('tests').delete().eq('id', testRow.id)
    throw err
  }
}