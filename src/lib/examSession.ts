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