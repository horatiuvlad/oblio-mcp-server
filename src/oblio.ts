/**
 * Thin wrapper around Oblio's official SDK (@obliosoftware/oblioapi).
 *
 * Responsibilities:
 *   - construct/cache a single OblioApi client from config
 *   - default to an in-process token cache (the SDK's own default would write
 *     the OAuth token inside node_modules — wrong for npx / read-only
 *     installs); persist to disk only when OBLIO_TOKEN_FILE is set
 *   - expose the SDK's low-level HTTP client for endpoints the typed SDK
 *     does not cover (e-Factura / SPV), with per-verb payload wrapping that
 *     matches the SDK's HttpClient exactly (GET reads `data.params`,
 *     DELETE reads `data.data`, POST/PUT send the body verbatim)
 *   - provide a small client-side idempotency cache so an accidental repeat
 *     of a create call within one process returns the first result instead
 *     of issuing a second fiscal document (Oblio has no draft state).
 */
import OblioApi, {
  AccessToken,
  AccessTokenHandlerFileStorage,
  OblioApiException,
} from "@obliosoftware/oblioapi";
import type { OblioConfig } from "./config.js";

export type OblioResult = Record<string, unknown>;

/**
 * Process-lifetime OAuth token cache. Mirrors AccessTokenHandlerInterface.
 * The SDK itself checks expiry (request_time + expires_in) on read via the
 * file handler, so we replicate that check here for parity.
 */
export class InMemoryTokenHandler {
  private token: AccessToken | null = null;

  get(): AccessToken | null {
    if (this.token === null) return null;
    const expiresAt =
      Number(this.token.request_time) + Number(this.token.expires_in);
    const nowSeconds = Math.floor(Date.now() / 1000);
    return expiresAt > nowSeconds ? this.token : null;
  }

  set(accessToken: AccessToken): void {
    this.token = accessToken;
  }
}

let client: OblioApi | null = null;

/** Build (once) and return the shared Oblio client. */
export function getClient(cfg: OblioConfig): OblioApi {
  if (!client) {
    const handler = cfg.tokenFile
      ? new AccessTokenHandlerFileStorage(cfg.tokenFile)
      : new InMemoryTokenHandler();
    // The SDK's AccessTokenHandlerInterface declares get(): AccessToken but
    // its own file handler returns null on a cache miss and the API class
    // handles that; the interface type is simply too narrow.
    client = new OblioApi(
      cfg.email,
      cfg.secret,
      handler as unknown as AccessTokenHandlerFileStorage
    );
    if (cfg.baseUrl) client._baseURL = cfg.baseUrl;
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
 * Reuses the SDK's authenticated HTTP client so token + CIF handling stay in
 * one place, and wraps `data` per verb to match HttpClient's conventions:
 *   GET    → sent as query string (HttpClient reads `data.params`)
 *   DELETE → sent as request body (HttpClient reads `data.data`)
 *   POST/PUT → sent as the JSON body verbatim
 * Error handling mirrors the SDK's _checkErrorResponse: non-2xx raises an
 * OblioApiException carrying the API's statusMessage when present.
 */
export async function rawRequest(
  cfg: OblioConfig,
  method: "get" | "post" | "put" | "delete",
  endpoint: string,
  data: Record<string, unknown>
): Promise<OblioResult> {
  const api = getClient(cfg);
  const request = await api.buildRequest();

  const payload =
    method === "get"
      ? { params: data }
      : method === "delete"
        ? { data }
        : data;

  const response = await request[method](endpoint, payload);
  if (response.status < 200 || response.status >= 300) {
    const body = response.data as Record<string, unknown> | undefined;
    const message =
      body && typeof body.statusMessage === "string"
        ? body.statusMessage
        : `Oblio API returned HTTP ${response.status}`;
    throw new OblioApiException(message, response.status);
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
