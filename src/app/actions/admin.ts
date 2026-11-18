"use server";

import {
  endAdminSession,
  isAdminRequest,
  passwordMatches,
  startAdminSession,
} from "@/lib/admin-session";

/**
 * Checks the password against the server-only `ADMIN_PASSWORD` and, on
 * success, sets the signed httpOnly admin session cookie.
 * The secret is never exposed to the client.
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  if (!passwordMatches(password)) return false;
  await startAdminSession();
  return true;
}

export async function logoutAdmin(): Promise<void> {
  await endAdminSession();
}

/** Lets the client restore admin mode on reload from the server cookie. */
export async function getAdminStatus(): Promise<boolean> {
  return isAdminRequest();
}
