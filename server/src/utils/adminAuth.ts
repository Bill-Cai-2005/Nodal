import crypto from "node:crypto";

export type AdminAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export function authorizeAdminPassword(password: unknown): AdminAuthResult {
  const configured = process.env.TOOL_PASSWORD;
  if (!configured) {
    return {
      ok: false,
      status: 500,
      error: "TOOL_PASSWORD is not configured on the server",
    };
  }

  if (typeof password !== "string") {
    return { ok: false, status: 401, error: "Admin authorization is required" };
  }

  const supplied = Buffer.from(password);
  const expected = Buffer.from(configured);
  const matches =
    supplied.length === expected.length &&
    crypto.timingSafeEqual(supplied, expected);

  return matches
    ? { ok: true }
    : { ok: false, status: 401, error: "Invalid admin authorization" };
}
