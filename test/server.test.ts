/**
 * Unit tests that need no live Oblio credentials.
 * Run with: npm test (node --import tsx --test test/*.test.ts)
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { loadConfig, ConfigError, type OblioConfig } from "../src/config.js";
import { ok, fail } from "../src/result.js";
import {
  withIdempotency,
  _clearIdempotency,
  InMemoryTokenHandler,
} from "../src/oblio.js";
import { createServer } from "../src/server.js";
import { buildListFilters } from "../src/tools/documents.js";
import { AccessToken } from "@obliosoftware/oblioapi";

// ── loadConfig ─────────────────────────────────────────────────────────────

test("loadConfig throws ConfigError when email is missing", () => {
  assert.throws(
    () => loadConfig({ OBLIO_API_SECRET: "s3cret" } as NodeJS.ProcessEnv),
    ConfigError
  );
});

test("loadConfig throws ConfigError when secret is missing", () => {
  assert.throws(
    () => loadConfig({ OBLIO_API_EMAIL: "a@b.ro" } as NodeJS.ProcessEnv),
    ConfigError
  );
});

test("loadConfig throws ConfigError when both are empty/blank", () => {
  assert.throws(
    () =>
      loadConfig({
        OBLIO_API_EMAIL: "   ",
        OBLIO_API_SECRET: "",
      } as NodeJS.ProcessEnv),
    ConfigError
  );
});

test("loadConfig returns a config object when both are present", () => {
  const cfg = loadConfig({
    OBLIO_API_EMAIL: " a@b.ro ",
    OBLIO_API_SECRET: "s3cret",
    OBLIO_CIF: "RO123",
    OBLIO_TOKEN_FILE: "/tmp/tok.json",
  } as NodeJS.ProcessEnv);
  assert.equal(cfg.email, "a@b.ro");
  assert.equal(cfg.secret, "s3cret");
  assert.equal(cfg.cif, "RO123");
  assert.equal(cfg.tokenFile, "/tmp/tok.json");
});

test("loadConfig defaults cif to empty and tokenFile to undefined", () => {
  const cfg = loadConfig({
    OBLIO_API_EMAIL: "a@b.ro",
    OBLIO_API_SECRET: "s3cret",
  } as NodeJS.ProcessEnv);
  assert.equal(cfg.cif, "");
  assert.equal(cfg.tokenFile, undefined);
});

// ── result helpers ─────────────────────────────────────────────────────────

test("ok() wraps data as JSON text content without isError", () => {
  const data = { hello: "world", n: 42 };
  const res = ok(data);
  assert.equal(res.content.length, 1);
  assert.equal(res.content[0].type, "text");
  assert.deepEqual(JSON.parse(res.content[0].text), data);
  assert.equal(res.isError, undefined);
});

test("fail() flags isError and includes action and cause message", () => {
  const res = fail("doing x", new Error("boom"));
  assert.equal(res.isError, true);
  assert.equal(res.content.length, 1);
  assert.equal(res.content[0].type, "text");
  assert.match(res.content[0].text, /boom/);
  assert.match(res.content[0].text, /doing x/);
});

test("fail() stringifies non-Error values", () => {
  const res = fail("doing y", "plain string failure");
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /plain string failure/);
});

// ── withIdempotency ────────────────────────────────────────────────────────

beforeEach(() => {
  _clearIdempotency();
});

test("withIdempotency runs fn once and returns its value on first call", async () => {
  let calls = 0;
  const result = await withIdempotency("key-1", async () => {
    calls += 1;
    return { number: 7 };
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { number: 7 });
});

test("withIdempotency replays the cached result for the same key", async () => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    return { number: 7 };
  };
  const first = await withIdempotency("key-2", fn);
  const second = await withIdempotency("key-2", fn);
  assert.equal(calls, 1);
  assert.equal(first._idempotent_replay, undefined);
  assert.equal(second._idempotent_replay, true);
  assert.equal(second.number, 7);
});

test("withIdempotency without a key always runs fn", async () => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    return { calls };
  };
  const a = await withIdempotency(undefined, fn);
  const b = await withIdempotency(undefined, fn);
  assert.equal(calls, 2);
  assert.deepEqual(a, { calls: 1 });
  assert.deepEqual(b, { calls: 2 });
  assert.equal(b._idempotent_replay, undefined);
});

test("withIdempotency keeps distinct keys separate", async () => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    return { calls };
  };
  const a = await withIdempotency("key-a", fn);
  const b = await withIdempotency("key-b", fn);
  assert.equal(calls, 2);
  assert.deepEqual(a, { calls: 1 });
  assert.deepEqual(b, { calls: 2 });
});

// ── buildListFilters ───────────────────────────────────────────────────────

test("buildListFilters drops type and undefined values", () => {
  const filters = buildListFilters({
    type: "invoice",
    seriesName: "FCT",
    number: undefined,
    draft: 0,
  });
  assert.deepEqual(filters, { seriesName: "FCT", draft: 0 });
});

test("buildListFilters flattens the client filter to bracket keys", () => {
  const filters = buildListFilters({
    type: "invoice",
    client: { cif: "RO123", email: undefined, code: "C7" },
    limitPerPage: 10,
  });
  assert.deepEqual(filters, {
    "client[cif]": "RO123",
    "client[code]": "C7",
    limitPerPage: 10,
  });
});

test("buildListFilters passes an empty client object through as nothing", () => {
  const filters = buildListFilters({ type: "proforma", client: {} });
  assert.deepEqual(filters, {});
});

// ── InMemoryTokenHandler ───────────────────────────────────────────────────

test("InMemoryTokenHandler returns null when empty", () => {
  const handler = new InMemoryTokenHandler();
  assert.equal(handler.get(), null);
});

test("InMemoryTokenHandler round-trips an unexpired token", () => {
  const handler = new InMemoryTokenHandler();
  const token = new AccessToken({
    request_time: Math.floor(Date.now() / 1000),
    expires_in: 3600,
    token_type: "Bearer",
    access_token: "tok",
  });
  handler.set(token);
  assert.equal(handler.get(), token);
});

test("InMemoryTokenHandler treats an expired token as a miss", () => {
  const handler = new InMemoryTokenHandler();
  const token = new AccessToken({
    request_time: Math.floor(Date.now() / 1000) - 7200,
    expires_in: 3600,
    token_type: "Bearer",
    access_token: "tok",
  });
  handler.set(token);
  assert.equal(handler.get(), null);
});

// ── createServer ───────────────────────────────────────────────────────────

test("createServer builds without throwing for a minimal valid cfg", () => {
  const cfg: OblioConfig = {
    email: "a@b.ro",
    secret: "s3cret",
    cif: "",
    tokenFile: undefined,
  };
  const server = createServer(cfg);
  assert.ok(server);
});
