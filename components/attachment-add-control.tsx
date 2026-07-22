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
  const [file, setFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);

  function chooseFile(next?: File) {
    if (!next) return;
    if (!isAllowedAttachmentType(next.type)) {
      window.alert("只支持 PDF、JPG、PNG 文件。");
      return;
    }
    if (next.size > MAX_ATTACHMENT_FILE_SIZE) {
      window.alert(`${label}不能超过 ${MAX_ATTACHMENT_FILE_SIZE_LABEL}。`);
      return;
    }
    setFile(next);
  }

  async function add() {
    if (!file || adding || disabled) return;
    setAdding(true);
    try {
      await onAdd(file);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (error: any) {
      window.alert(error?.message || `添加${label}失败，请稍后重试。`);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="attachment-panel">
      <div className="top-actions">
        <label className="btn file-action-button">
          <FileUp size={15} /> 选择文件
          <input ref={inputRef} accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" type="file" onChange={(event) => chooseFile(event.target.files?.[0])} />
        </label>
        <button className="btn primary" disabled={!file || adding || disabled} type="button" onClick={add}>
          {adding ? "上传中…" : `添加${label}`}
        </button>
      </div>
      {file ? <div className="attachment-preview"><FileUp size={16} /><span>{file.name} · {formatFileSize(file.size)}</span><button className="btn danger" type="button" disabled={adding} onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }}><X size={15} /> 移除</button></div> : null}
      <p className="muted">支持 PDF、JPG、PNG，单个文件不超过 {MAX_ATTACHMENT_FILE_SIZE_LABEL}。选择文件后点击“添加”才会上传。</p>
    </div>
  );
}
