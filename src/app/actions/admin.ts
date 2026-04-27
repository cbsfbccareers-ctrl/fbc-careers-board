"use server";

/**
 * Returns whether the given password matches the server-only `ADMIN_PASSWORD`.
 * The secret is never exposed to the client.
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (expected == null || expected.length === 0) {
    return false;
  }
  return password === expected;
}
