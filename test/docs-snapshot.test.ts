/**
 * Tests for the docs-drift parser (scripts/oblio-docs-snapshot.mjs) against a
 * committed fixture of https://www.oblio.eu/api. No network needed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// @ts-expect-error plain .mjs module without type declarations
import {
  parseDocs,
  snapshotFromHtml,
  diffLines,
  renderSnapshot,
} from "../scripts/oblio-docs-snapshot.mjs";
import { webhookTopicSchema } from "../src/schemas.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(join(here, "fixtures", "oblio-api.sample.html"), "utf8");
const committedSnapshot = readFileSync(
  join(here, "..", "docs", "oblio-api.snapshot.md"),
  "utf8"
);

test("parseDocs finds every contract section with endpoints", () => {
  const sections = parseDocs(fixtureHtml);
  const byId = new Map(sections.map((s: { id: string }) => [s.id, s]));
  for (const id of [
    "authorize",
    "nomenclature",
    "docs_issue",
    "docs_collect",
    "docs_view",
    "docs_cancel",
    "docs_restore",
    "docs_delete",
    "docs_list",
    "docs_einvoice",
    "webhooks",
  ]) {
    const section = byId.get(id) as { items: { kind: string }[] } | undefined;
    assert.ok(section, `missing section #${id}`);
    assert.ok(
      section.items.some((i) => i.kind === "endpoint"),
      `section #${id} has no endpoints`
    );
  }
});

test("snapshot generation is deterministic", () => {
  assert.equal(snapshotFromHtml(fixtureHtml), snapshotFromHtml(fixtureHtml));
});

test("committed snapshot matches the committed fixture", () => {
  // If this fails after editing the parser, regenerate with:
  //   node scripts/oblio-docs-snapshot.mjs --update --from-file test/fixtures/oblio-api.sample.html
  assert.equal(snapshotFromHtml(fixtureHtml), committedSnapshot);
});

test("snapshot marks required parameters and includes webhook endpoints", () => {
  const snap = snapshotFromHtml(fixtureHtml);
  assert.match(snap, /\| cif \* \|/);
  assert.match(snap, /https:\/\/www\.oblio\.eu\/api\/webhooks - POST/);
  assert.match(snap, /https:\/\/www\.oblio\.eu\/api\/webhooks - GET/);
  assert.match(snap, /https:\/\/www\.oblio\.eu\/api\/webhooks\/\{id\} - DELETE/);
});

test("snapshotFromHtml flags a redesigned page as a parse failure", () => {
  assert.throws(
    () => snapshotFromHtml("<html><body><h1>New docs portal</h1></body></html>"),
    (err: Error & { parseFailure?: boolean }) => err.parseFailure === true
  );
});

test("diffLines reports added and removed lines", () => {
  const diff = diffLines("a\nb\nc", "a\nx\nc");
  assert.match(diff, /^- b$/m);
  assert.match(diff, /^\+ x$/m);
});

test("diffLines is empty for identical inputs", () => {
  assert.equal(diffLines("a\nb", "a\nb"), "");
});

// ── synthetic-markup units for each token kind ─────────────────────────────

const syntheticSection = `
  <h2 class="mb-4" id="demo">Demo &amp; Co</h2>
  <h4>Create thing</h4>
  <div class="url">https://www.oblio.eu/api/demo - <span class="post">POST</span></div>
  <h6>Raspuns</h6>
  <code>{<br /><span style="x">"a":</span> "b &quot;q&quot;"<br />}</code>
  <table class="table">
    <thead><tr><th>Parametru</th><th>Explicatie</th></tr></thead>
    <tbody>
      <tr><td>cif <span class="required">*</span></td><td>CIF | firma</td></tr>
      <tr><td>optional_field</td><td>desc</td></tr>
    </tbody>
  </table>
  </section>`;

test("parseDocs keeps document order and parses every token kind", () => {
  const [section] = parseDocs(syntheticSection) as [
    { id: string; title: string; items: { kind: string }[] }
  ];
  assert.equal(section.id, "demo");
  assert.equal(section.title, "Demo & Co"); // entity decoded
  assert.deepEqual(
    section.items.map((i) => i.kind),
    ["subsection", "endpoint", "response", "table"]
  );
});

test("parseDocs marks required params and strips markup from cells", () => {
  const [section] = parseDocs(syntheticSection) as [
    { items: ({ kind: string } & Record<string, unknown>)[] }
  ];
  const table = section.items.find((i) => i.kind === "table") as {
    header: string[];
    rows: string[][];
  };
  assert.deepEqual(table.header, ["Parametru", "Explicatie"]);
  assert.deepEqual(table.rows[0], ["cif *", "CIF | firma"]);
  assert.deepEqual(table.rows[1], ["optional_field", "desc"]);
});

test("parseDocs normalizes response samples to clean lines", () => {
  const [section] = parseDocs(syntheticSection) as [
    { items: ({ kind: string } & Record<string, unknown>)[] }
  ];
  const response = section.items.find((i) => i.kind === "response") as { body: string };
  assert.equal(response.body, '{\n"a": "b "q""\n}');
});

test("renderSnapshot escapes pipes so tables stay valid markdown", () => {
  const md = renderSnapshot(parseDocs(syntheticSection));
  assert.match(md, /\| cif \* \| CIF \\\| firma \|/);
  assert.match(md, /## Demo & Co `#demo`/);
  assert.match(md, /- `https:\/\/www\.oblio\.eu\/api\/demo - POST`/);
});

test("webhook topics in schemas.ts match the docs snapshot", () => {
  // The docs list valid topics inline in the create-webhook table; every enum
  // value we accept must still appear there.
  for (const topic of webhookTopicSchema.options) {
    assert.ok(
      committedSnapshot.includes(`"${topic}"`),
      `topic "${topic}" no longer documented at oblio.eu/api`
    );
  }
});
