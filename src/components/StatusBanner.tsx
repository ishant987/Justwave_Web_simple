export function StatusBanner({
  tone,
  message,
}: {
  tone: 'success' | 'warning' | 'danger' | 'info';
  message: string;
}) {
  return <div className={`status-banner ${tone}`}>{message}</div>;
}
