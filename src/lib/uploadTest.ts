import { supabase } from './supabase'
import type { TestJson } from './testSchema'

const AUDIO_BUCKET = 'listening-audio'
const DOCUMENT_BUCKET = 'exam-documents'

type Uploadable = { fileRef: string; bucket: string }

function collectAssets(test: TestJson): Uploadable[] {
  const assets: Uploadable[] = []
  const seen = new Set<string>()

  const add = (fileRef: string | undefined, bucket: string) => {
    if (!fileRef) return
    const key = `${bucket}:${fileRef}`
    if (seen.has(key)) return
    seen.add(key)
    assets.push({ fileRef, bucket })
  }

  for (const stage of test.exam.stages) {
    if (stage.audio?.file_ref) add(stage.audio.file_ref, AUDIO_BUCKET)
    for (const doc of stage.documents ?? []) add(doc.file_ref, DOCUMENT_BUCKET)

    for (const extract of stage.extracts ?? []) {
      add(extract.file_ref, AUDIO_BUCKET)
      for (const q of extract.questions ?? []) {
        if (q.audio?.file_ref) add(q.audio.file_ref, AUDIO_BUCKET)
      }
    }

    for (const q of stage.questions ?? []) {
      if (q.audio?.file_ref) add(q.audio.file_ref, AUDIO_BUCKET)
    }
  }

  return assets
}

function contentType(file: File, bucket: string) {
  if (file.type) return file.type
  if (bucket === DOCUMENT_BUCKET) return 'application/pdf'
  return 'audio/mpeg'
}

export async function uploadTest(test: TestJson, files: File[]) {
  const fileMap = new Map<string, File>()
  for (const file of files) fileMap.set(file.name, file)

  const assets = collectAssets(test)
  const missing = assets.filter((asset) => !fileMap.has(asset.fileRef))
  if (missing.length) {
    throw new Error(`Missing required asset(s): ${missing.map((x) => x.fileRef).join(', ')}`)
  }

  const { data: testRow, error } = await supabase
    .from('tests')
    .insert({
      title: test.exam.title,
      profession: test.exam.profession,
      manifest: test,
    })
    .select('id, title')
    .single()

  if (error || !testRow) {
    throw new Error(`Failed to create test: ${error?.message ?? 'unknown error'}`)
  }

  const uploaded: { bucket: string; path: string }[] = []

  try {
    for (const asset of assets) {
      const file = fileMap.get(asset.fileRef)!
      const path = `${testRow.id}/${asset.fileRef}`

      const { error: uploadError } = await supabase.storage
        .from(asset.bucket)
        .upload(path, file, {
          upsert: true,
          contentType: contentType(file, asset.bucket),
          cacheControl: '3600',
        })

      if (uploadError) {
        throw new Error(`Failed to upload ${asset.fileRef}: ${uploadError.message}`)
      }

      uploaded.push({ bucket: asset.bucket, path })
    }

    return {
      testId: testRow.id,
      questionCount: countQuestions(test),
      assetCount: assets.length,
    }
  } catch (err) {
    await supabase.from('tests').delete().eq('id', testRow.id)
    for (const item of uploaded) {
      await supabase.storage.from(item.bucket).remove([item.path])
    }
    throw err
  }
}

export function countQuestions(test: TestJson) {
  let count = 0
  for (const stage of test.exam.stages) {
    count += stage.questions?.length ?? 0
    for (const extract of stage.extracts ?? []) {
      count += extract.questions?.length ?? 0
    }
  }
  return count
}
