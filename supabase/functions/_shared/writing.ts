import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Helpers shared by the Writing edge functions.

export function findWritingStage(manifest: any) {
  const stages = manifest?.exam?.stages ?? []
  const writingStage = stages.find((s: any) => s.presentation === 'writing')
  const question = writingStage?.questions?.[0]
  // The case notes document can be on the `writing` stage itself, or only
  // on the preceding `writing_reading` stage -- ManifestExamRunner checks
  // both, so this does too.
  const caseNotesDoc =
    writingStage?.documents?.[0] ?? stages.find((s: any) => s.id === 'writing_reading')?.documents?.[0]
  return { question, caseNotesDoc }
}

export async function fetchCaseNotesBase64(
  admin: ReturnType<typeof createClient>,
  testId: string,
  fileRef: string | undefined
): Promise<string | null> {
  if (!fileRef) return null
  const path = `${testId}/${fileRef}`
  const { data, error } = await admin.storage.from('exam-documents').download(path)
  if (error || !data) {
    console.error('Could not download case notes PDF:', error)
    return null
  }
  const bytes = new Uint8Array(await data.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

