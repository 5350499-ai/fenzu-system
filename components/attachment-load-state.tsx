"use client";

export type AttachmentLoadState = "loading" | "success" | "error";

export function AttachmentLoadStateNotice({
  state,
  error,
  onRetry,
  emptyLabel,
  hasFiles
}: {
  state: AttachmentLoadState;
  error: string;
  onRetry: () => void;
  emptyLabel: string;
  hasFiles: boolean;
}) {
  if (state === "loading") return <span className="muted">正在加载附件…</span>;
  if (state === "error") {
    return (
      <div className="notice warning">
        <span>附件加载失败，请点击重试。</span>
        <button className="btn" type="button" onClick={onRetry}>重试加载</button>
      </div>
    );
  }
  if (!hasFiles) return <span className="muted">{emptyLabel}</span>;
  return null;
}
