"use client";

import { useState } from "react";

const jsonContent = '{ "hello": "world" }';

function downloadWithAnchor(content: BlobPart, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DownloadTestPage() {
  const [status, setStatus] = useState("");

  function downloadJson() {
    setStatus("已触发 JSON 下载");
    downloadWithAnchor(jsonContent, "test-download.json", "application/json");
  }

  async function shareJson() {
    const file = new File([jsonContent], "test-share.json", { type: "application/json" });
    if (typeof navigator.share !== "function") {
      setStatus("当前浏览器不支持 Web Share");
      return;
    }

    try {
      await navigator.share({ files: [file] });
      setStatus("Web Share 已完成");
    } catch (error) {
      setStatus(error instanceof DOMException && error.name === "AbortError" ? "Web Share 已取消" : "Web Share 失败");
    }
  }

  function downloadText() {
    setStatus("已触发文本下载");
    downloadWithAnchor("hello", "hello.txt", "text/plain");
  }

  return (
    <main style={{ minHeight: "100dvh", padding: "32px 20px", background: "#f6f7f9", color: "#111827" }}>
      <section style={{ width: "min(100%, 480px)", margin: "0 auto", padding: 24, border: "1px solid #e5e7eb", borderRadius: 16, background: "#fff", boxShadow: "0 16px 36px rgba(15, 23, 42, 0.08)" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>下载测试</h1>
        <p style={{ margin: "0 0 24px", color: "#6b7280", lineHeight: 1.5 }}>独立浏览器下载行为测试，不连接业务数据。</p>
        <div style={{ display: "grid", gap: 12 }}>
          <button type="button" onClick={downloadJson} style={buttonStyle}>下载 JSON（Blob + a.download）</button>
          <button type="button" onClick={() => void shareJson()} style={buttonStyle}>Web Share JSON</button>
          <button type="button" onClick={downloadText} style={buttonStyle}>Blob 文本</button>
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
