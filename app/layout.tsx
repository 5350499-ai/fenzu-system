import type { Metadata } from "next";
import { PwaRegister } from "./pwa-register";
import { AccountAccessProvider } from "@/components/account-access";
import { ClientErrorReporter } from "@/components/client-error-reporter";
import { AttachmentUploadProgress } from "@/components/attachment-upload-progress";
import { CacheRuntime } from "@/components/cache-runtime";
import "./globals.css";

export const metadata: Metadata = {
  title: "分租管理",
  description: "面向西班牙小房东和分租经营者的管理系统",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "分租管理"
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/icon-1024.png", sizes: "1024x1024", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": "分租管理",
    "apple-mobile-web-app-status-bar-style": "default",
    "theme-color": "#111827"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: `(()=>{try{const s=localStorage.getItem("theme");const t=s==="dark"||s==="light"?s:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t}catch{}})()` }} />
        <PwaRegister />
        <ClientErrorReporter />
        <AttachmentUploadProgress />
        <AccountAccessProvider><CacheRuntime />{children}</AccountAccessProvider>
      </body>
    </html>
  );
}
