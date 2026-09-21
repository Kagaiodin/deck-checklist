import type { ReactNode } from "react";

interface EmptyStateAction {
  label: ReactNode;
  onClick: () => void;
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  body: ReactNode;
  primary?: EmptyStateAction;
  secondary?: EmptyStateAction;
  className?: string;
}

export function EmptyState({ icon, title, body, primary, secondary, className }: EmptyStateProps) {
  return (
    <div className={className ? `empty-card ${className}` : "empty-card"}>
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h2 className="empty-title">{title}</h2>
      <p className="empty-body">{body}</p>
      {(primary || secondary) && (
        <div className="empty-actions">
          {primary && (
            <button className="btn btn-primary" onClick={primary.onClick}>{primary.label}</button>
          )}
          {secondary && (
            <button className="btn btn-secondary" onClick={secondary.onClick}>{secondary.label}</button>
          )}
        </div>
      )}
    </div>
  );
}
