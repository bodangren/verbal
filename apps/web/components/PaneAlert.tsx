export type PaneAlertAction = {
  label: string;
  onClick: () => void;
};

export type PaneAlertProps = {
  message: string;
  /** The raw failure, shown as a tooltip so the pane stays quiet. */
  detail?: string;
  action?: PaneAlertAction;
  onDismiss: () => void;
};

/**
 * An inline error in the pane that owns the action.
 *
 * The message carries the next step; Dismiss is always available, and an
 * optional action repeats the step that failed.
 */
export function PaneAlert({ message, detail, action, onDismiss }: PaneAlertProps) {
  return (
    <div className="pane-alert" role="alert">
      <p className="pane-alert__message">{message}</p>
      {detail !== undefined && detail !== "" && (
        <p className="pane-alert__detail" title={detail}>
          {detail}
        </p>
      )}
      <div className="toolbar">
        {action !== undefined && (
          <button type="button" className="button button--ghost" onClick={action.onClick}>
            {action.label}
          </button>
        )}
        <button type="button" className="button button--ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
