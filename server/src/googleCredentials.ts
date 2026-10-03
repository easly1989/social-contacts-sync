/*
  Google OAuth client credentials entered in the desktop setup wizard, either
  as the downloaded client_secret_*.json or as pasted values.
*/

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

export type CredentialsError = "invalid_json" | "wrong_client_type" | "missing_fields" | "invalid_client_id";

const clientIdPattern = /^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/;

function fromFields(clientId: unknown, clientSecret: unknown): GoogleCredentials | { error: CredentialsError } {
  if (typeof clientId !== "string" || typeof clientSecret !== "string" || !clientId.trim() || !clientSecret.trim())
    return { error: "missing_fields" };
  const credentials = { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
  if (!clientIdPattern.test(credentials.clientId)) return { error: "invalid_client_id" };
  return credentials;
}

export function parseGoogleCredentials(input: unknown): GoogleCredentials | { error: CredentialsError } {
  const body = (input ?? {}) as Record<string, unknown>;
  if (typeof body.json === "string") {
    let file: Record<string, any>;
    try {
      file = JSON.parse(body.json);
    } catch {
      return { error: "invalid_json" };
    }
    // Desktop clients are "installed"; "web" clients need registered redirect
    // URIs and can't use the app's random loopback port.
    if (file?.web) return { error: "wrong_client_type" };
    if (!file?.installed) return { error: "invalid_json" };
    return fromFields(file.installed.client_id, file.installed.client_secret);
  }
  return fromFields(body.clientId, body.clientSecret);
}

export type Verification = "valid" | "invalid" | "unreachable";

const tokenEndpoint = () => process.env.SCS_GOOGLE_TOKEN_ENDPOINT || "https://oauth2.googleapis.com/token";

/**
 * Checks the credentials with Google without signing in: exchanging a made-up
 * code fails with `invalid_grant` when Google accepts the client and with
 * `invalid_client` when the ID or secret is wrong.
 */
export async function verifyGoogleCredentials(
  credentials: GoogleCredentials,
  fetchImpl: typeof fetch = fetch
): Promise<Verification> {
  let response: Response;
  try {
    response = await fetchImpl(tokenEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: "social-contacts-sync-credentials-check",
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        redirect_uri: "http://127.0.0.1",
        grant_type: "authorization_code",
      }),
    });
  } catch {
    return "unreachable";
  }
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (body.error === "invalid_client" || body.error === "unauthorized_client") return "invalid";
  if (body.error === "invalid_grant") return "valid";
  return response.status >= 500 ? "unreachable" : "invalid";
}
