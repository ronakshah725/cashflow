interface Props {
  status: string;
  onReset: () => void;
}

export function TopBar({ status, onReset }: Props) {
  return (
    <div className="topbar">
      <span aria-live="polite">{status}</span>
      <span className="topbar-actions">
        <button type="button" className="link-btn" onClick={onReset}>
          Reset
        </button>
        <a href="/auth/logout">Log out</a>
      </span>
    </div>
  );
}
