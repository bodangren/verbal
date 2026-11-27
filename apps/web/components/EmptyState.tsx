export type EmptyStateAction = {
  label: string;
  onClick: () => void;
};

export type EmptyStateProps = {
  title: string;
  body: string;
  action?: EmptyStateAction;
};

/** Shows a titled empty slot with one optional action. */
export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      <p className="empty__body">{body}</p>
      {action !== undefined && (
        <button type="button" className="button button--primary" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
