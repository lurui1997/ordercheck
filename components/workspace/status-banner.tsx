export function StatusBanner({
  tone,
  message,
  code,
  onDismiss,
}: {
  tone: "error" | "info";
  message: string;
  code?: string;
  onDismiss: () => void;
}) {
  const error = tone === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      className={`flex items-start justify-between gap-3 border-b px-4 py-2 text-[13px] leading-5 ${
        error ? "border-red-200 bg-danger-soft text-danger" : "border-line bg-white text-ink"
      }`}
    >
      <p>
        {code ? <span className="mr-2 font-mono text-[11px] font-semibold">{code}</span> : null}
        {message}
      </p>
      <button
        type="button"
        className="shrink-0 rounded px-1.5 py-0.5 text-[12px] font-semibold hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        onClick={onDismiss}
      >
        关闭
      </button>
    </div>
  );
}
