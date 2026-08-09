import { createHmac, timingSafeEqual } from "crypto";

export const PENDING_VERIFICATION_COOKIE = "fenzu_pending_verification";
const TICKET_TTL_SECONDS = 24 * 60 * 60;

type VerificationTicket = {
  userId: string;
  email: string;
  expiresAt: number;
};

function signingSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function sign(value: string) {
  const secret = signingSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createVerificationTicket(userId: string, email: string) {
  const payload: VerificationTicket = {
    userId,
    email: email.trim().toLowerCase(),
    expiresAt: Math.floor(Date.now() / 1000) + TICKET_TTL_SECONDS
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(encoded);
  return signature ? `${encoded}.${signature}` : null;
}

export function verifyVerificationTicket(value: string | undefined) {
  if (!value) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  if (!expected) return null;
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<VerificationTicket>;
    if (typeof payload.userId !== "string" || typeof payload.email !== "string" || typeof payload.expiresAt !== "number") return null;
    if (payload.expiresAt < Math.floor(Date.now() / 1000)) return null;
    return { userId: payload.userId, email: payload.email.trim().toLowerCase(), expiresAt: payload.expiresAt };
  } catch {
    return null;
  }
}

export const verificationTicketMaxAge = TICKET_TTL_SECONDS;
