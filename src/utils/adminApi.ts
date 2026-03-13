import { getApiEndpoint } from "./api";

export type VerifyToolPasswordResponse = {
  ok: boolean;
  error?: string;
};

export async function verifyToolPassword(password: string): Promise<VerifyToolPasswordResponse> {
  const res = await fetch(getApiEndpoint("/api/admin/tool-password"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
    credentials: "include",
  });

  let payload: any = {};
  try {
    payload = await res.json();
  } catch {
    // ignore JSON parse errors; we'll fall back to generic messages below
  }

  if (!res.ok) {
    return {
      ok: false,
      error:
        (payload && typeof payload.error === "string" && payload.error) ||
        `Password validation failed (${res.status})`,
    };
  }

  return {
    ok: Boolean(payload.ok),
    error: payload.error,
  };
}

