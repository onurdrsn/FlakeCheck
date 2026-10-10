import type { Translations } from '../i18n';

export function QuarantineModal({
  testName,
  reason,
  labels,
  onReasonChange,
  onClose,
  onConfirm,
}: {
  testName?: string;
  reason: string;
  labels: Translations;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <span className="eyebrow">{labels.quarantineAction}</span>
        <h2>{labels.quarantineConfirmTitle}</h2>
        <p>{testName}</p>
        <textarea
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder={labels.quarantineReasonPlaceholder}
        />
        <div className="modal-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>
            {labels.cancel}
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={!reason.trim()}
            onClick={onConfirm}
          >
            {labels.quarantineTest}
          </button>
        </div>
      </div>
    </div>
  );
}
