"use client";

import { useState } from "react";

const JSON_CONTENT = '{ "hello": "world" }';
const FILE_NAME = "same-input.json";
const MIME_TYPE = "application/json";

function downloadWithBlobAnchor() {
  const blob = new Blob([JSON_CONTENT], { type: MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = FILE_NAME;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DownloadTestPage() {
  const [status, setStatus] = useState("");

  function downloadJson() {
    setStatus("已触发 Blob + a.download");
    downloadWithBlobAnchor();
  }

  async function shareJson() {
    if (typeof navigator.share !== "function") {
      setStatus("当前浏览器不支持 Web Share");
      return;
    }
    const file = new File([JSON_CONTENT], FILE_NAME, { type: MIME_TYPE });
    try {
      await navigator.share({ files: [file] });
      setStatus("Web Share 已完成");
    } catch (error) {
      setStatus(error instanceof DOMException && error.name === "AbortError" ? "Web Share 已取消" : "Web Share 失败");
    }
  }

  return (
    <main style={{ minHeight: "100dvh", padding: "32px 20px", background: "#f6f7f9", color: "#111827" }}>
      <section style={{ width: "min(100%, 480px)", margin: "0 auto", padding: 24, border: "1px solid #e5e7eb", borderRadius: 16, background: "#fff", boxShadow: "0 16px 36px rgba(15, 23, 42, 0.08)" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>下载机制对照测试</h1>
        <p style={{ margin: "0 0 24px", color: "#6b7280", lineHeight: 1.5 }}>两个按钮使用完全相同的 JSON 内容、文件名和 MIME 类型。</p>
        <div style={{ display: "grid", gap: 12 }}>
          <button type="button" onClick={downloadJson} style={buttonStyle}>A：Blob + a.download</button>
          <button type="button" onClick={() => void shareJson()} style={buttonStyle}>B：navigator.share(File)</button>
        </div>
        <p role="status" aria-live="polite" style={{ minHeight: 24, margin: "20px 0 0", color: "#2563eb" }}>{status}</p>
      </section>
    </main>
  );
}

const buttonStyle = {
  minHeight: 48,
  padding: "12px 16px",
  border: "1px solid #d1d5db",
  borderRadius: 12,
  background: "#111827",
  color: "#fff",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};
