import { useRef } from 'react'

export interface ExamNavTab {
  /** Stable key, e.g. a stage id or `${stageId}-${subIndex}` */
  key: string
  /** Number shown on the tab */
  number: number
  answered?: boolean
  /** Which stage this page belongs to -- used to restrict nav to the active stage */
  stageId?: string
}

export interface ExamNavGroup {
  /** Short label shown above its tabs, e.g. "Listening", "Reading" */
  label: string
  tabs: ExamNavTab[]
}

interface ExamChromeProps {
  pageNumber: number
  sectionLabel: string
  testTitle: string
  candidateName: string
  timerLabel: string
  timerValue: string | null
  timerUrgent?: boolean
  finishLabel: string
  onFinishClick: () => void
  navGroups: ExamNavTab[] | ExamNavGroup[]
  activeNavKey: string
  onNavSelect: (key: string) => void
  onBack?: () => void
  onNext?: () => void
  backDisabled?: boolean
  nextLabel: string
  nextDisabled?: boolean
  /** When set (e.g. a pinned PDF panel is docked on the left), shifts the
   *  whole exam chrome's left edge over by this many px so it doesn't sit
   *  underneath the panel. */
  leftInset?: number
  children: React.ReactNode
}

function isGrouped(nav: ExamNavTab[] | ExamNavGroup[]): nav is ExamNavGroup[] {
  return nav.length > 0 && 'tabs' in nav[0]
}

/**
 * Foundational shell matching the real OET computer-based test's chrome.
 * Pure layout/presentation — owns no exam state. The rebuilt exam runner
 * decides what page is "current" and passes it in; this just renders the
 * frame around it.
 */
function ExamChrome({
  pageNumber,
  sectionLabel,
  testTitle,
  candidateName,
  timerLabel,
  timerValue,
  timerUrgent,
  finishLabel,
  onFinishClick,
  navGroups,
  activeNavKey,
  onNavSelect,
  onBack,
  onNext,
  backDisabled,
  nextLabel,
  nextDisabled,
  leftInset,
  children,
}: ExamChromeProps) {
  const sidebarRef = useRef<HTMLDivElement>(null)

  function scrollSidebar(direction: 1 | -1) {
    sidebarRef.current?.scrollBy({ top: direction * 160, behavior: 'smooth' })
  }

  const groups: ExamNavGroup[] = isGrouped(navGroups)
    ? navGroups
    : [{ label: '', tabs: navGroups }]

  return (
    <div className="oet-exam" style={leftInset ? { left: leftInset } : undefined}>
      <div className="oet-exam-topbar">
        <div className="oet-exam-topbar-left">
          <span>Page: {pageNumber}</span>
          <span>Section: {sectionLabel}</span>
        </div>
        <div className="oet-exam-timer">
          {timerValue !== null && (
            <>
              <span className="oet-exam-timer-icon" aria-hidden="true">
                🕐
              </span>
              <span>
                {timerLabel}: <strong className={timerUrgent ? 'urgent' : ''}>{timerValue}</strong>
              </span>
            </>
          )}
        </div>
        <button className="oet-exam-finish-btn" onClick={onFinishClick}>
          {finishLabel}
        </button>
      </div>

      <div className="oet-exam-subbar">
        <span>Test: {testTitle}</span>
        <span>Candidate: {candidateName}</span>
      </div>

      <div className="oet-exam-body">
        <div className="oet-exam-sidebar">
          <button
            className="oet-exam-sidebar-chevron"
            onClick={() => scrollSidebar(-1)}
            aria-label="Scroll navigation up"
          >
            ⌃
          </button>
          <div className="oet-exam-sidebar-tabs" ref={sidebarRef}>
            {groups.map((group) => (
              <div className="oet-exam-sidebar-group" key={group.label || 'default'}>
                {group.label && <span className="oet-exam-sidebar-label">{group.label}</span>}
                {group.tabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={`oet-exam-nav-tab ${activeNavKey === tab.key ? 'active' : ''} ${
                      tab.answered ? 'answered' : ''
                    }`}
                    onClick={() => onNavSelect(tab.key)}
                  >
                    {tab.number}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <button
            className="oet-exam-sidebar-chevron"
            onClick={() => scrollSidebar(1)}
            aria-label="Scroll navigation down"
          >
            ⌄
          </button>
        </div>

        <div className="oet-exam-content">{children}</div>
      </div>

      <div className="oet-exam-bottombar">
        {onBack && (
          <button className="oet-exam-nav-btn" onClick={onBack} disabled={backDisabled}>
            ‹ Back
          </button>
        )}
        {onNext && (
          <button className="oet-exam-nav-btn primary" onClick={onNext} disabled={nextDisabled}>
            {nextLabel} ›
          </button>
        )}
      </div>
    </div>
  )
}

export default ExamChrome