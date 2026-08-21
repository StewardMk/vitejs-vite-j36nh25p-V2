// OET Standard Grading & Conversion, per OET_Standard_Grading_Guide.pdf.
// Listening/Reading: 42 objective questions each, piecewise linear raw-to-scaled formula.
// Writing: 38-point rubric (6 criteria, two independent assessors), linear formula.
// Both round to the nearest 10-point increment on a shared 0-500 scale, and share
// one grade table (A/B/C+/C/D/E).

export function roundToTen(n: number): number {
    return Math.round(n / 10) * 10
  }
  
  export function listeningReadingScaledScore(raw: number): number {
    const s = raw < 30 ? 11.67 * raw : 350 + 12.5 * (raw - 30)
    return Math.max(0, Math.min(500, roundToTen(s)))
  }
  
  export const WRITING_MAX_RAW = 38
  
  export function writingScaledScore(raw: number): number {
    const s = 13.16 * raw
    return Math.max(0, Math.min(500, roundToTen(s)))
  }
  
  export function gradeForScaledScore(score: number): string {
    if (score >= 450) return 'A'
    if (score >= 350) return 'B'
    if (score >= 300) return 'C+'
    if (score >= 200) return 'C'
    if (score >= 100) return 'D'
    return 'E'
  }
  
  /**
   * Formats a Listening/Reading result as "raw/scorable · scaled · grade".
   * Only converts when scorable is exactly 42 (the formula's basis) -- otherwise
   * falls back to just the raw fraction, since the formula wouldn't be valid.
   */
  export function formatListeningReading(raw: number | null, scorable: number | null): string {
    if (raw === null || scorable === null) return '—'
    if (scorable !== 42) return `${raw} / ${scorable}`
    const scaled = listeningReadingScaledScore(raw)
    return `${raw}/${scorable} · ${scaled} · ${gradeForScaledScore(scaled)}`
  }
  
  export function formatWriting(raw: number | null): string {
    if (raw === null) return 'Awaiting assessment'
    const scaled = writingScaledScore(raw)
    return `${raw}/${WRITING_MAX_RAW} · ${scaled} · ${gradeForScaledScore(scaled)}`
  }
  