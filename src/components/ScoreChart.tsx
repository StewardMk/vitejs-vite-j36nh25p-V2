import { CHART_SUBTESTS, type ScoreSummary } from '../lib/scoreChart'

const BANDS: { grade: string; from: number; to: number }[] = [
  { grade: 'A', from: 450, to: 500 },
  { grade: 'B', from: 350, to: 450 },
  { grade: 'C+', from: 300, to: 350 },
  { grade: 'C', from: 200, to: 300 },
  { grade: 'D', from: 100, to: 200 },
  { grade: 'E', from: 0, to: 100 },
]

export const BAND_EXPLANATIONS: { grade: string; range: string; ielts: string; text: string }[] = [
  { grade: 'A', range: '450–500', ielts: '8.0–9.0', text: 'Can communicate very effectively in a healthcare setting with only occasional errors. Shows a high level of accuracy, fluency and understanding of the English language.' },
  { grade: 'B', range: '350–440', ielts: '7.0–7.5', text: 'Can communicate effectively in a healthcare setting. Minor errors or lapses in accuracy may occur but communication is not affected.' },
  { grade: 'C+', range: '300–340', ielts: '6.5', text: 'Can communicate adequately in a healthcare setting, though some errors, lapses or misunderstandings may occur and affect communication at times.' },
  { grade: 'C', range: '200–290', ielts: '5.5–6.0', text: 'Can communicate in a healthcare setting with some effort. Errors and misunderstandings are frequent and can affect the clarity of communication.' },
  { grade: 'D', range: '100–190', ielts: '4.0–5.0', text: 'Has limited ability to communicate in a healthcare setting. Frequent errors and breakdowns in communication are likely.' },
  { grade: 'E', range: '0–90', ielts: 'Below 4.0', text: 'Has very limited ability to communicate in English. Frequent breakdowns in communication are likely.' },
]

export default function ScoreChart({ summary }: { summary: ScoreSummary }) {
  const W = 640, H = 340, L = 56, R = 70, T = 16, B = 40
  const y = (v: number) => T + (1 - v / 500) * (H - T - B)
  const colW = (W - L - R) / CHART_SUBTESTS.length
  const cx = (i: number) => L + colW * i + colW / 2
  return (
    <div>
      <svg className="trend-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Latest and best scores per subtest on the 0 to 500 scale">
        {BANDS.map((b) => (
          <text key={b.grade} x={W - R + 12} y={(y(b.from) + y(b.to)) / 2 + 4} fontSize="13" fontWeight="700" fill="#475569">{b.grade}</text>
        ))}
        {[0, 100, 200, 300, 350, 450, 500].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#cbd5e1" strokeDasharray={v === 0 || v === 500 ? undefined : '4 4'} />
            <text x={L - 8} y={y(v) + 4} fontSize="11" textAnchor="end" fill="#64748b">{v}</text>
          </g>
        ))}
        {CHART_SUBTESTS.map((s, i) => {
          const d = summary[s.key]
          const barW = 54
          return (
            <g key={s.key}>
              <text x={cx(i)} y={H - 16} fontSize="13" fontWeight="600" textAnchor="middle" fill="#0f172a">{s.label}</text>
              {d.latest ? (
                <>
                  <rect x={cx(i) - barW / 2} y={y(d.latest.scaled)} width={barW} height={Math.max(2, y(0) - y(d.latest.scaled))} fill="#1e5aa8" rx="3" />
                  <text x={cx(i)} y={y(d.latest.scaled) - 6} fontSize="13" fontWeight="700" textAnchor="middle" fill="#0f172a">{d.latest.scaled}</text>
                </>
              ) : (
                <text x={cx(i)} y={y(0) - 8} fontSize="11" textAnchor="middle" fill="#94a3b8">No result yet</text>
              )}
              {d.best && (
                <g>
                  <line x1={cx(i) - barW / 2 - 8} x2={cx(i) + barW / 2 + 8} y1={y(d.best.scaled)} y2={y(d.best.scaled)} stroke="#d97706" strokeWidth="3" />
                  {d.latest && d.best.scaled !== d.latest.scaled && (
                    <text x={cx(i) + barW / 2 + 12} y={y(d.best.scaled) + 4} fontSize="11" fontWeight="700" fill="#b45309">{d.best.scaled}</text>
                  )}
                </g>
              )}
            </g>
          )
        })}
      </svg>
      <div className="legend">
        <span><i style={{ background: '#1e5aa8', borderRadius: 2 }} />Latest result</span>
        <span><i style={{ background: '#d97706', borderRadius: 0, height: 3, width: 14, verticalAlign: 'middle' }} />Highest result</span>
      </div>
      <div className="tutor-table-wrap" style={{ marginTop: 14 }}>
        <table className="tutor-table">
          <thead><tr><th>Subtest</th><th>Latest</th><th>Highest</th></tr></thead>
          <tbody>
            {CHART_SUBTESTS.map((s) => {
              const d = summary[s.key]
              const fmt = (c: typeof d.latest) => (c ? `${c.scaled} · grade ${c.grade}` : '—')
              return <tr key={s.key}><td>{s.label}</td><td>{fmt(d.latest)}</td><td>{fmt(d.best)}</td></tr>
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function BandExplanations() {
  return (
    <div className="tutor-table-wrap" style={{ marginTop: 0 }}>
      <table className="tutor-table">
        <thead><tr><th>Grade</th><th>Score</th><th>IELTS equivalent</th><th>What it means</th></tr></thead>
        <tbody>
          {BAND_EXPLANATIONS.map((b) => (
            <tr key={b.grade}><td><strong>{b.grade}</strong></td><td>{b.range}</td><td>{b.ielts}</td><td>{b.text}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
