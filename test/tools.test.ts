/**
 * Integration tests over the full MCP surface, no live Oblio credentials:
 * a real Client talks to the real server over an in-memory transport pair,
 * so tool registration, input schemas, zod validation and annotations are
 * exercised exactly as an MCP client would. Network-bound handlers are only
 * invoked with INVALID input (validation rejects before any HTTP happens).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import type { OblioConfig } from "../src/config.js";
import {
  clientSchema,
  productSchema,
  collectSchema,
  documentDataSchema,
  webhookTopicSchema,
  createWebhookShape,
  deleteWebhookShape,
  listDocumentsShape,
  docTypeSchema,
  collectTypeSchema,
} from "../src/schemas.js";

const cfg: OblioConfig = {
  email: "a@b.ro",
  secret: "s3cret",
  cif: "RO123",
  tokenFile: undefined,
  baseUrl: undefined,
};

/** All tools the server must expose, with their expected annotation posture. */
const EXPECTED_TOOLS: Record<
  string,
  { readOnly: boolean; destructive: boolean; idempotent: boolean }
> = {
  create_document: { readOnly: false, destructive: false, idempotent: false },
  get_document: { readOnly: true, destructive: false, idempotent: true },
  list_documents: { readOnly: true, destructive: false, idempotent: true },
  cancel_document: { readOnly: false, destructive: true, idempotent: true },
  restore_document: { readOnly: false, destructive: false, idempotent: true },
  delete_document: { readOnly: false, destructive: true, idempotent: false },
  collect_payment: { readOnly: false, destructive: false, idempotent: false },
  get_nomenclatures: { readOnly: true, destructive: false, idempotent: true },
  create_einvoice: { readOnly: false, destructive: false, idempotent: false },
  get_einvoice: { readOnly: true, destructive: false, idempotent: true },
  set_cif: { readOnly: false, destructive: false, idempotent: true },
  get_cif: { readOnly: true, destructive: false, idempotent: true },
  create_webhook: { readOnly: false, destructive: false, idempotent: false },
  list_webhooks: { readOnly: true, destructive: false, idempotent: true },
  delete_webhook: { readOnly: false, destructive: true, idempotent: true },
};

let client: Client;
let listed: Awaited<ReturnType<Client["listTools"]>>;

before(async () => {
  const server = createServer(cfg);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  listed = await client.listTools();
});

// ── tool inventory ─────────────────────────────────────────────────────────

test("server exposes exactly the expected tools", () => {
  const names = listed.tools.map((t) => t.name).sort();
  assert.deepEqual(names, Object.keys(EXPECTED_TOOLS).sort());
});

test("every tool carries the expected MCP annotations", () => {
  for (const tool of listed.tools) {
    const want = EXPECTED_TOOLS[tool.name];
    assert.ok(tool.annotations, `${tool.name} has no annotations`);
    assert.equal(tool.annotations.readOnlyHint, want.readOnly, `${tool.name} readOnlyHint`);
    assert.equal(
      tool.annotations.destructiveHint,
      want.destructive,
      `${tool.name} destructiveHint`
    );
    assert.equal(
      tool.annotations.idempotentHint,
      want.idempotent,
      `${tool.name} idempotentHint`
    );
    assert.equal(tool.annotations.openWorldHint, true, `${tool.name} openWorldHint`);
  }
});

test("every tool ships a title, description and JSON Schema input", () => {
  for (const tool of listed.tools) {
    assert.ok(tool.title, `${tool.name} has no title`);
    assert.ok(
      tool.description && tool.description.length > 20,
      `${tool.name} has no meaningful description`
    );
    assert.equal(tool.inputSchema.type, "object", `${tool.name} inputSchema not an object`);
  }
});

test("tool input schemas surface per-field descriptions to the client", () => {
  const byName = new Map(listed.tools.map((t) => [t.name, t]));
  const createDoc = byName.get("create_document")!;
  const props = createDoc.inputSchema.properties as Record<string, { description?: string }>;
  assert.ok(props.type.description, "create_document.type lost its description");
  assert.ok(props.data.description, "create_document.data lost its description");
  const createWebhook = byName.get("create_webhook")!;
  const whProps = createWebhook.inputSchema.properties as Record<
    string,
    { description?: string }
  >;
  assert.match(whProps.endpoint.description ?? "", /X-Oblio-Request-Id/);
});

// ── zod validation via real MCP calls (no network: rejected pre-handler) ───

/** The SDK reports input-validation failures as an isError tool result
 *  (MCP error -32602 text), not a protocol-level rejection. */
async function expectInvalid(
  name: string,
  args: Record<string, unknown>,
  pattern: RegExp
): Promise<void> {
  const res = (await client.callTool({ name, arguments: args })) as {
    content: { type: string; text: string }[];
    isError?: boolean;
  };
  assert.equal(res.isError, true, `${name} accepted invalid input`);
  assert.match(res.content[0].text, /Input validation error/i);
  assert.match(res.content[0].text, pattern);
}

test("create_webhook rejects an unknown topic through the MCP layer", async () => {
  await expectInvalid(
    "create_webhook",
    { topic: "not-a-topic", endpoint: "https://example.com/hook" },
    /invalid_enum_value|Invalid enum/i
  );
});

test("create_webhook rejects a non-URL endpoint through the MCP layer", async () => {
  await expectInvalid(
    "create_webhook",
    { topic: "stock", endpoint: "not a url" },
    /invalid_string|url/i
  );
});

test("create_document rejects an empty products array", async () => {
  await expectInvalid(
    "create_document",
    {
      type: "invoice",
      data: { client: { name: "ACME" }, seriesName: "FCT", products: [] },
    },
    /at least 1|too_small/i
  );
});

test("list_documents rejects limitPerPage above 100", async () => {
  await expectInvalid(
    "list_documents",
    { type: "invoice", limitPerPage: 500 },
    /less than or equal to 100|too_big/i
  );
});

test("get_document rejects a missing seriesName", async () => {
  await expectInvalid(
    "get_document",
    { type: "invoice", number: 1 },
    /seriesName/
  );
});

// ── offline tools work end-to-end over the transport ───────────────────────

test("set_cif / get_cif round-trip over the MCP transport", async () => {
  const set = (await client.callTool({
    name: "set_cif",
    arguments: { cif: "RO999" },
  })) as { content: { type: string; text: string }[]; isError?: boolean };
  assert.notEqual(set.isError, true);
  const got = (await client.callTool({ name: "get_cif", arguments: {} })) as {
    content: { type: string; text: string }[];
  };
  assert.deepEqual(JSON.parse(got.content[0].text), { cif: "RO999" });
});

// ── schema unit tests (direct zod, no transport) ───────────────────────────

test("docTypeSchema accepts exactly invoice/proforma/notice", () => {
  for (const v of ["invoice", "proforma", "notice"]) {
    assert.equal(docTypeSchema.parse(v), v);
  }
  assert.throws(() => docTypeSchema.parse("receipt"));
});

test("collectTypeSchema covers all Oblio payment methods", () => {
  assert.equal(collectTypeSchema.options.length, 11);
  assert.ok(collectTypeSchema.options.includes("Chitanta"));
  assert.ok(collectTypeSchema.options.includes("Ordin de plata"));
  assert.throws(() => collectTypeSchema.parse("Bitcoin"));
});

test("clientSchema requires only name; flags must be 0/1", () => {
  assert.ok(clientSchema.parse({ name: "ACME SRL" }));
  assert.throws(() => clientSchema.parse({}));
  assert.ok(clientSchema.parse({ name: "ACME", vatPayer: 1, save: 0 }));
  assert.throws(() => clientSchema.parse({ name: "ACME", vatPayer: 2 }));
  assert.throws(() => clientSchema.parse({ name: "ACME", save: true }));
});

test("productSchema requires name and numeric price", () => {
  assert.ok(productSchema.parse({ name: "Consultanta", price: 100 }));
  assert.throws(() => productSchema.parse({ name: "Consultanta" }));
  assert.throws(() => productSchema.parse({ name: "X", price: "100" }));
  assert.throws(() =>
    productSchema.parse({ name: "X", price: 1, productType: "Altceva" })
  );
});

test("collectSchema requires a valid payment type", () => {
  assert.ok(collectSchema.parse({ type: "Card", value: 10 }));
  assert.throws(() => collectSchema.parse({ value: 10 }));
});

test("documentDataSchema enforces required client/series/products", () => {
  const valid = {
    client: { name: "ACME" },
    seriesName: "FCT",
    products: [{ name: "Serviciu", price: 1 }],
  };
  assert.ok(documentDataSchema.parse(valid));
  assert.throws(() => documentDataSchema.parse({ ...valid, seriesName: undefined }));
  assert.throws(() => documentDataSchema.parse({ ...valid, products: [] }));
  assert.throws(() => documentDataSchema.parse({ ...valid, client: undefined }));
});

test("listDocumentsShape ternary flags accept -1/0/1 only", () => {
  const draft = listDocumentsShape.draft;
  assert.equal(draft.parse(-1), -1);
  assert.equal(draft.parse(0), 0);
  assert.equal(draft.parse(1), 1);
  assert.throws(() => draft.parse(2));
});

test("webhookTopicSchema lists all 13 documented topics", () => {
  assert.equal(webhookTopicSchema.options.length, 13);
  for (const t of ["stock", "Invoice/SaveDraft", "TaxReceipt/Cancel", "Collect/Inserted"]) {
    assert.equal(webhookTopicSchema.parse(t), t);
  }
  assert.throws(() => webhookTopicSchema.parse("Invoice/Delete"));
  // TaxReceipt has no Update topic in the docs — must stay rejected.
  assert.throws(() => webhookTopicSchema.parse("TaxReceipt/Update"));
});

test("createWebhookShape validates endpoint as URL and cif as optional", () => {
  const shape = z.object(createWebhookShape);
  assert.ok(shape.parse({ topic: "stock", endpoint: "https://x.ro/h" }));
  assert.ok(shape.parse({ topic: "stock", endpoint: "https://x.ro/h", cif: "RO1" }));
  assert.throws(() => shape.parse({ topic: "stock", endpoint: "nope" }));
});

test("deleteWebhookShape accepts string or number ids", () => {
  const shape = z.object(deleteWebhookShape);
  assert.deepEqual(shape.parse({ id: "123" }), { id: "123" });
  assert.deepEqual(shape.parse({ id: 123 }), { id: 123 });
  assert.throws(() => shape.parse({}));
});
