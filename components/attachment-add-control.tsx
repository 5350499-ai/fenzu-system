"use client";

import { MAX_ATTACHMENT_FILE_SIZE, MAX_ATTACHMENT_FILE_SIZE_LABEL, isAllowedAttachmentType } from "@/lib/attachment-file-limits";
import { formatFileSize } from "@/lib/storage-files";
import { FileUp, X } from "lucide-react";
import { useRef, useState } from "react";

export function AttachmentAddControl({ label, onAdd, disabled = false }: {
  label: string;
  onAdd: (file: File) => Promise<void>;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  function chooseFiles(selection: FileList | null) {
    if (!selection) return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    Array.from(selection).forEach((next) => {
      if (!isAllowedAttachmentType(next.type)) {
        rejected.push(`${next.name}：只支持 PDF、JPG、PNG 文件`);
      } else if (next.size > MAX_ATTACHMENT_FILE_SIZE) {
        rejected.push(`${next.name}：超过 ${MAX_ATTACHMENT_FILE_SIZE_LABEL}`);
      } else {
        accepted.push(next);
      }
    });
    setFiles(accepted);
    if (rejected.length) window.alert(`以下文件未加入上传队列：\n${rejected.join("\n")}`);
  }

  async function add() {
    if (!files.length || adding || disabled) return;
    setAdding(true);
    setProgress({ current: 0, total: files.length });
    let successCount = 0;
    const failed: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setProgress({ current: index + 1, total: files.length });
        try {
          await onAdd(file);
          successCount += 1;
        } catch (error: any) {
          failed.push(`${file.name}：${error?.message || "上传失败"}`);
        }
      }
      const summary = [`成功上传 ${successCount} 个${label}`];
      if (failed.length) summary.push(`失败 ${failed.length} 个：\n${failed.join("\n")}`);
      window.alert(summary.join("\n"));
    } finally {
      setFiles([]);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
      setAdding(false);
    }
  }

  return (
    <div className="attachment-panel">
      <div className="top-actions">
        <label className="btn file-action-button">
          <FileUp size={15} /> 选择文件
          <input ref={inputRef} accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" multiple type="file" onChange={(event) => chooseFiles(event.target.files)} />
        </label>
        <button className="btn primary" disabled={!files.length || adding || disabled} type="button" onClick={add}>
          {adding ? `上传中 ${progress?.current || 0}/${progress?.total || files.length}` : `添加${label}`}
        </button>
      </div>
      {files.length ? <div className="attachment-preview"><FileUp size={16} /><span>已选择 {files.length} 个文件：{files.map((file) => `${file.name} · ${formatFileSize(file.size)}`).join("；")}</span><button className="btn danger" type="button" disabled={adding} onClick={() => { setFiles([]); if (inputRef.current) inputRef.current.value = ""; }}><X size={15} /> 移除</button></div> : null}
      <p className="muted">支持 PDF、JPG、PNG，单个文件不超过 {MAX_ATTACHMENT_FILE_SIZE_LABEL}，保留原始文件。选择文件后点击“添加”才会按顺序上传。</p>
    </div>
  );
}
