/**
 * Thin wrapper around Oblio's official SDK (@obliosoftware/oblioapi).
 *
 * Responsibilities:
 *   - construct/cache a single OblioApi client from config
 *   - persist the OAuth token to disk when OBLIO_TOKEN_FILE is set
 *   - expose the SDK's low-level HTTP client for endpoints the typed SDK
 *     does not cover (e-Factura / SPV)
 *   - provide a small client-side idempotency cache so an accidental repeat
 *     of a create call within one process returns the first result instead
 *     of issuing a second fiscal document (Oblio has no draft state).
 */
import OblioApi, {
  AccessTokenHandlerFileStorage,
  OblioApiException,
} from "@obliosoftware/oblioapi";
import type { OblioConfig } from "./config.js";

export type OblioResult = Record<string, unknown>;

let client: OblioApi | null = null;

/** Build (once) and return the shared Oblio client. */
export function getClient(cfg: OblioConfig): OblioApi {
  if (!client) {
    const handler = cfg.tokenFile
      ? new AccessTokenHandlerFileStorage(cfg.tokenFile)
      : undefined;
    client = new OblioApi(cfg.email, cfg.secret, handler as never);
    if (cfg.cif) client.setCif(cfg.cif);
  }
  return client;
}

/** Reset the cached client — used by tests. */
export function _resetClient(): void {
  client = null;
}

/**
 * Call an Oblio REST endpoint the typed SDK does not expose (e-Factura).
 * Reuses the SDK's authenticated HTTP client so token + CIF handling stay
 * in one place.
 */
export async function rawRequest(
  cfg: OblioConfig,
  method: "get" | "post" | "put" | "delete",
  endpoint: string,
  data: Record<string, unknown>
): Promise<OblioResult> {
  const api = getClient(cfg);
  const request = await api.buildRequest();
  const response = await request[method](endpoint, data);
  if (response.status < 200 || response.status >= 300) {
    throw new OblioApiException(
      `Oblio API returned HTTP ${response.status}`,
      response.status
    );
  }
  return response.data as OblioResult;
}

// ── client-side idempotency ────────────────────────────────────────────────
const idempotencyCache = new Map<string, OblioResult>();

/**
 * Run `fn` unless `key` was already used in this process, in which case the
 * remembered result is returned. Prevents accidental double-issue of a
 * document from a retried tool call. Scope is the process lifetime only.
 */
export async function withIdempotency(
  key: string | undefined,
  fn: () => Promise<OblioResult>
): Promise<OblioResult> {
  if (!key) return fn();
  const hit = idempotencyCache.get(key);
  if (hit) return { ...hit, _idempotent_replay: true };
  const result = await fn();
  idempotencyCache.set(key, result);
  return result;
}

export function _clearIdempotency(): void {
  idempotencyCache.clear();
}

export { OblioApiException };
