import type { ValidationProgress } from "../utils/validator";

interface Props {
  progress: ValidationProgress;
  label?: string;
}

export function ProgressTracker({ progress, label = "Validating cards…" }: Props) {
  const pct = progress.total === 0 ? 0 : Math.round((progress.validated / progress.total) * 100);

  return (
    <div className="progress-tracker">
      <p className="progress-label">{label}</p>
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="progress-count">
        {progress.validated} / {progress.total} ({pct}%)
      </p>
    </div>
  );
}
