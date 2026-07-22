"use client";

import { useEffect, useState } from "react";

type UploadProgressDetail = { state: "uploading" | "complete" | "failed"; loaded?: number; total?: number };

export function AttachmentUploadProgress() {
  const [detail, setDetail] = useState<UploadProgressDetail | null>(null);

  useEffect(() => {
    const onProgress = (event: Event) => setDetail((event as CustomEvent<UploadProgressDetail>).detail);
    window.addEventListener("attachment-upload-progress", onProgress);
    return () => window.removeEventListener("attachment-upload-progress", onProgress);
  }, []);

  if (!detail) return null;
  const percent = detail.total ? Math.min(100, Math.round(((detail.loaded || 0) / detail.total) * 100)) : 0;
  const text = detail.state === "failed" ? "附件上传失败" : detail.state === "complete" ? "正在保存附件索引…" : `正在上传附件 ${percent}%`;
  return <div className="attachment-upload-progress" role="status" aria-live="polite">{text}</div>;
}
