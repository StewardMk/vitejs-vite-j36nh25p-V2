// ============================================================
// Exam session persistence.
//
// Previously `test` and `studentName` lived only in ExamFlow's React
// state, with nothing backing them up. A hard reload -- including the
// app's own "Reload Exam" button, which calls window.location.reload()
// -- wipes React state entirely, so ExamFlow re-mounted with `test`
// back to null and sent the student to the login screen mid-exam.
//
// ManifestExamRunner's own localStorage-based progress (page, answers,
// timer starts) was never the problem; it just had no way to be reached
// again after a reload, because the login gate came first. Mirroring
// the session to sessionStorage (cleared when the tab/browser closes --
// this is meant to survive a reload, not persist forever) closes that
// gap: ExamFlow can rehydrate straight into the exam, which then finds
// its saved progress waiting for it, same as before.
// ============================================================
export type ExamSession = { test: any; studentName: string }

const SESSION_KEY = 'oet-exam-session'

export function loadExamSession(): ExamSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !parsed.test || !parsed.studentName) return null
    return parsed as ExamSession
  } catch {
    return null
  }
}

export function saveExamSession(session: ExamSession) {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // sessionStorage unavailable (private browsing, storage full, etc.) --
    // the exam still runs fine, it just won't survive a hard reload.
  }
}

export function clearExamSession() {
  try {
    window.sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}

// ============================================================
// Saved exam progress (localStorage) -- shared with ManifestExamRunner.
//
// The runner mirrors page position, answers and section-timer start times
// here so an exam survives a reload or crash. The key is per test + student
// name, so starting the same test again under the same name used to find the
// old attempt and silently restore it. ExamFlow now asks first (see
// findUnfinishedAttempt below) and calls clearSavedProgress if the student
// chooses to start over.
// ============================================================
export function progressStorageKey(testId: string, studentName: string) {
  return `oet-manifest-progress:${testId}:${studentName}`
}

export function clearSavedProgress(testId: string, studentName: string) {
  try {
    window.localStorage.removeItem(progressStorageKey(testId, studentName))
  } catch {
    // ignore
  }
}

export type UnfinishedAttempt = {
  /** When progress was last written (ms since epoch); null for progress saved before this was recorded. */
  savedAt: number | null
}

/**
 * Returns details of an unfinished attempt for this test + student, or null.
 * Progress only counts if there is something to lose: the student has moved
 * past the first page or typed/selected at least one answer. A bare "opened
 * the intro page and left" is not worth interrupting anyone for.
 */
export function findUnfinishedAttempt(testId: string, studentName: string): UnfinishedAttempt | null {
  try {
    const raw = window.localStorage.getItem(progressStorageKey(testId, studentName))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null

    const pastFirstPage = typeof parsed.pageIndex === 'number' && parsed.pageIndex > 0
    const answers = parsed.answers && typeof parsed.answers === 'object' ? parsed.answers : {}
    const hasAnswer = Object.values(answers).some((v) => typeof v === 'string' && v.trim() !== '')
    if (!pastFirstPage && !hasAnswer) return null

    return { savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : null }
  } catch {
    return null
  }
}

// ============================================================
// Reload intent.
//
// The exam's own "Reload Exam" button tells the student their progress will
// be restored exactly where they are, so that one reload must resume without
// asking. Any other way of arriving back at an unfinished attempt (a new
// access code, starting from the catalog, a manual refresh, a returning
// tab) gets the "continue previous test?" prompt instead. The button leaves
// a short-lived marker in sessionStorage right before reloading; ExamFlow
// reads it once on load. The timestamp keeps a stale marker from skipping
// the prompt later.
// ============================================================
const RELOAD_INTENT_KEY = 'oet-exam-reload-intent'
const RELOAD_INTENT_TTL_MS = 30_000

export function markReloadIntent() {
  try {
    window.sessionStorage.setItem(RELOAD_INTENT_KEY, String(Date.now()))
  } catch {
    // ignore -- worst case the student sees the prompt after the reload
  }
}

export function hasReloadIntent(): boolean {
  try {
    const raw = window.sessionStorage.getItem(RELOAD_INTENT_KEY)
    if (!raw) return false
    const at = Number(raw)
    return Number.isFinite(at) && Date.now() - at >= 0 && Date.now() - at < RELOAD_INTENT_TTL_MS
  } catch {
    return false
  }
}

export function clearReloadIntent() {
  try {
    window.sessionStorage.removeItem(RELOAD_INTENT_KEY)
  } catch {
    // ignore
  }
}
