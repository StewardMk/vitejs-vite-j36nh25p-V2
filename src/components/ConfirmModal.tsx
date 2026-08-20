interface ConfirmModalProps {
  open: boolean
  variant: 'sterner' | 'plain' | 'notice'
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel?: () => void
}


/**
 * Three variants, matching real OET behavior:
 * - "sterner": shown when time remains / questions are unanswered — clock icon,
 *   warns the candidate they still have time and can't come back.
 * - "plain": shown when there's nothing left to lose (time's up / all answered) —
 *   simple "are you sure?" with a question-mark icon.
 * - "notice": a one-button, non-dismissible heads-up (e.g. "time's up") —
 *   clock icon, no cancel button; omit cancelLabel/onCancel to use it.
 */
function ConfirmModal({
  open,
  variant,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`modal-header ${variant}`}>
          <h3 id="confirm-modal-title">{title}</h3>
        </div>

        <div className="modal-body">
          <span className={`modal-icon ${variant}`} aria-hidden="true">
            {variant === 'sterner' || variant === 'notice' ? '⏰' : '?'}
          </span>
          <p>{message}</p>
        </div>

        <div className="modal-actions">
          <button className="btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
          {onCancel && cancelLabel && (
            <button className="btn-secondary" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal