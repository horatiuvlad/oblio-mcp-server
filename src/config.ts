/**
 * Environment-driven configuration for the Oblio MCP server.
 *
 * Credentials come from Oblio → Setari > Date Cont:
 *   - OBLIO_API_EMAIL   the account email (acts as OAuth client_id)
 *   - OBLIO_API_SECRET  the API secret   (acts as OAuth client_secret)
 *   - OBLIO_CIF         optional default company CIF (e.g. RO45079498);
 *                       can also be set at runtime via the set_cif tool
 *   - OBLIO_TOKEN_FILE  optional path; when set the OAuth access token is
 *                       persisted here so it survives process restarts
 *                       (defaults to in-memory only).
 *   - OBLIO_BASE_URL    optional API origin (default https://www.oblio.eu);
 *                       point it at a mock or sandbox for tests and evals.
 */
export interface OblioConfig {
  email: string;
  secret: string;
  cif: string;
  tokenFile: string | undefined;
  baseUrl: string | undefined;
}

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OblioConfig {
  const email = (env.OBLIO_API_EMAIL ?? "").trim();
  const secret = (env.OBLIO_API_SECRET ?? "").trim();
  if (!email || !secret) {
    throw new ConfigError(
      "OBLIO_API_EMAIL and OBLIO_API_SECRET environment variables must be set " +
        "(get them from Oblio → Setari > Date Cont)."
    );
  }
  return {
    email,
    secret,
    cif: (env.OBLIO_CIF ?? "").trim(),
    tokenFile: env.OBLIO_TOKEN_FILE?.trim() || undefined,
    baseUrl: env.OBLIO_BASE_URL?.trim().replace(/\/+$/, "") || undefined,
  };
}
