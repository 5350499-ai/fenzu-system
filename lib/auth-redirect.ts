const PRODUCTION_ORIGIN = "https://fenzu-system.vercel.app";

function validOrigin(value: string | undefined, allowLocal: boolean) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const isLocal = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !(allowLocal && isLocal)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/" && url.pathname !== "") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isAllowedPublicOrigin(value: string | undefined, allowLocal = false) {
  const origin = validOrigin(value, allowLocal);
  if (!origin) return false;
  const url = new URL(origin);
  return url.hostname === "fenzu-system.vercel.app"
    || (url.hostname.endsWith(".vercel.app") && url.hostname.startsWith("fenzu-system-"))
    || (allowLocal && (url.hostname === "localhost" || url.hostname === "127.0.0.1"));
}

export function recoveryRedirectUrl(request: Request) {
  const vercelEnvironment = process.env.VERCEL_ENV || "";
  const configuredOrigin = process.env.AUTH_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;

  if (vercelEnvironment === "production") {
    const origin = isAllowedPublicOrigin(configuredOrigin) ? validOrigin(configuredOrigin, false) : PRODUCTION_ORIGIN;
    return `${origin || PRODUCTION_ORIGIN}/reset-password`;
  }

  const vercelOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/\/$/, "")}` : undefined;
  if (vercelEnvironment === "preview" && isAllowedPublicOrigin(vercelOrigin)) {
    return `${validOrigin(vercelOrigin, false)}/reset-password`;
  }

  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || requestUrl.protocol.replace(":", "");
  const requestOrigin = `${forwardedProto}://${forwardedHost || requestUrl.host}`;
  if (isAllowedPublicOrigin(requestOrigin, true)) {
    return `${validOrigin(requestOrigin, true)}/reset-password`;
  }

  if (isAllowedPublicOrigin(configuredOrigin, true)) {
    return `${validOrigin(configuredOrigin, true)}/reset-password`;
  }

  return `${PRODUCTION_ORIGIN}/reset-password`;
}
