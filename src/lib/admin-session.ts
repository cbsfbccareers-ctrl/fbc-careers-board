import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Server-side admin session.
 *
 * After a correct password, the server sets an httpOnly cookie holding
 * `<expiresAtMs>.<hmac>`. The browser can't read or forge it, and every admin
 * server action / API route verifies it with `isAdminRequest()` or
 * `requireAdmin()`.
 *
 * Signing key: ADMIN_SESSION_SECRET if set, otherwise derived from
 * ADMIN_PASSWORD (so changing the password also logs everyone out).
 */

export const ADMIN_COOKIE = "fbc_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function signingKey(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) return null;
  return createHmac("sha256", "fbc-admin-session-v1").update(secret).digest("hex");
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Constant-time check of a submitted password against ADMIN_PASSWORD. */
export function passwordMatches(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  // Compare HMACs so lengths always match and timing leaks nothing.
  const key = "fbc-admin-password-check";
  return safeEqual(
    createHmac("sha256", key).update(password).digest("hex"),
    createHmac("sha256", key).update(expected).digest("hex"),
  );
}

function verifyToken(token: string | undefined): boolean {
  const key = signingKey();
  if (!key || !token) return false;
  const [exp, mac] = token.split(".");
  if (!exp || !mac || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now()) return false;
  return safeEqual(mac, sign(exp, key));
}

export async function startAdminSession(): Promise<void> {
  const key = signingKey();
  if (!key) throw new Error("ADMIN_PASSWORD is not configured");
  const exp = String(Date.now() + SESSION_TTL_MS);
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, `${exp}.${sign(exp, key)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function endAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}

export async function isAdminRequest(): Promise<boolean> {
  const jar = await cookies();
  return verifyToken(jar.get(ADMIN_COOKIE)?.value);
}

export class AdminAuthError extends Error {
  constructor() {
    super("Admin session required. Please log in again.");
    this.name = "AdminAuthError";
  }
}

/** Throws AdminAuthError unless the request carries a valid admin session. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdminRequest())) throw new AdminAuthError();
}
