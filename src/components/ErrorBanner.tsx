export interface ErrorBannerProps {
  message: string;
  onRetry: () => void;
  onReload: () => void;
}

export function ErrorBanner({ message, onRetry, onReload }: ErrorBannerProps): JSX.Element {
  return (
    <div className="card" role="alert" aria-live="assertive">
      <p className="card-body">{message}</p>
      <div className="u-stack" style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Retry
        </button>
        <button type="button" className="btn btn-secondary" onClick={onReload}>
          Reload
        </button>
      </div>
    </div>
  );
}
