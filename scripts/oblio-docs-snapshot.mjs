#!/usr/bin/env node
/**
 * Oblio API docs drift detector.
 *
 * Oblio publishes no machine-readable spec (no OpenAPI/JSON Schema anywhere in
 * github.com/OblioSoftware); https://www.oblio.eu/api — human-readable HTML —
 * is the de-facto contract that src/schemas.ts hand-encodes. This script
 * extracts the stable, contract-bearing parts of that page (endpoint URLs +
 * verbs, parameter tables with required markers, response samples) into a
 * deterministic markdown snapshot, so CI can detect when the contract moves.
 *
 * Modes:
 *   --check   (default) fetch + parse + compare against the committed
 *             snapshot. Exit 0 = no drift, 3 = drift (diff on stdout),
 *             2 = parse failure (page redesign — the parser needs attention).
 *   --update  fetch + parse + overwrite the committed snapshot.
 *   --from-file <path>  parse a local HTML file instead of fetching
 *             (offline tests / debugging).
 *
 * Deliberately dependency-free (plain Node >= 20): regex over the page's
 * constrained markup. If Oblio redesigns the page the sanity checks below
 * fail loudly (exit 2) rather than emitting a garbage snapshot.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DOCS_URL = "https://www.oblio.eu/api";
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_PATH = join(repoRoot, "docs", "oblio-api.snapshot.md");

/** Section ids that must exist with at least one endpoint each — the core
 *  contract surface schemas.ts encodes. A miss means parse failure. */
const REQUIRED_SECTIONS = [
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
];

// ── html helpers ───────────────────────────────────────────────────────────

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Strip tags, decode entities, collapse whitespace. */
function text(html) {
  return decodeEntities(
    html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Like text() but keeps line structure for <code> response samples. */
function codeText(html) {
  return decodeEntities(
    html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

// ── parsing ────────────────────────────────────────────────────────────────

/**
 * Parse the docs page into an ordered list of sections, each holding the
 * document-ordered contract tokens found inside it.
 * @returns {{ id: string, title: string, items: Array<
 *   | { kind: "subsection", title: string }
 *   | { kind: "endpoint", url: string }
 *   | { kind: "table", header: string[], rows: string[][] }
 *   | { kind: "response", body: string }
 * > }[]}
 */
export function parseDocs(html) {
  const h2 = /<h2[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g;
  const heads = [];
  let m;
  while ((m = h2.exec(html)) !== null) {
    heads.push({ id: m[1], title: text(m[2]), start: m.index, end: h2.lastIndex });
  }

  const sections = [];
  for (let i = 0; i < heads.length; i++) {
    const bodyStart = heads[i].end;
    // A section runs to the next h2-with-id, or (for the last one) to the
    // close of its enclosing <section>.
    let bodyEnd =
      i + 1 < heads.length ? heads[i + 1].start : html.indexOf("</section>", bodyStart);
    if (bodyEnd === -1) bodyEnd = html.length;
    const body = html.slice(bodyStart, bodyEnd);

    const items = [];
    // One combined scan keeps document order between the token kinds.
    const token =
      /<h4[^>]*>([\s\S]*?)<\/h4>|<div class="url">([\s\S]*?)<\/div>|<table[\s\S]*?<\/table>|<h6[^>]*>\s*Raspuns\s*<\/h6>\s*<code>([\s\S]*?)<\/code>/g;
    let t;
    while ((t = token.exec(body)) !== null) {
      if (t[1] !== undefined) {
        items.push({ kind: "subsection", title: text(t[1]) });
      } else if (t[2] !== undefined) {
        items.push({ kind: "endpoint", url: text(t[2]) });
      } else if (t[3] !== undefined) {
        items.push({ kind: "response", body: codeText(t[3]) });
      } else {
        items.push(parseTable(t[0]));
      }
    }
    sections.push({ id: heads[i].id, title: heads[i].title, items });
  }
  return sections;
}

function parseTable(tableHtml) {
  const rows = [];
  let header = [];
  const tr = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let r;
  while ((r = tr.exec(tableHtml)) !== null) {
    const cells = [];
    const cell = /<(th|td)[^>]*>([\s\S]*?)<\/\1>/g;
    let c;
    while ((c = cell.exec(r[1])) !== null) {
      // Preserve the required-marker before tags are stripped.
      const required = /class="required"/.test(c[2]);
      let v = text(c[2]);
      if (required && !v.endsWith("*")) v = v.replace(/\s*\*?$/, "") + " *";
      cells.push(v);
    }
    if (cells.length === 0) continue;
    if (/<th[\s>]/.test(r[1]) && header.length === 0) header = cells;
    else rows.push(cells);
  }
  return { kind: "table", header, rows };
}

// ── rendering ──────────────────────────────────────────────────────────────

const esc = (s) => s.replace(/\|/g, "\\|");

export function renderSnapshot(sections) {
  const out = [
    "# Oblio API docs snapshot",
    "",
    "Generated by `scripts/oblio-docs-snapshot.mjs` from https://www.oblio.eu/api —",
    "do not edit by hand; run `node scripts/oblio-docs-snapshot.mjs --update`.",
    "A `*` suffix marks parameters the docs flag as required.",
    "",
  ];
  for (const s of sections) {
    out.push(`## ${s.title} \`#${s.id}\``, "");
    for (const item of s.items) {
      if (item.kind === "subsection") {
        out.push(`### ${item.title}`, "");
      } else if (item.kind === "endpoint") {
        out.push(`- \`${item.url}\``, "");
      } else if (item.kind === "response") {
        out.push("Response sample:", "", "```", item.body, "```", "");
      } else {
        if (item.header.length > 0) {
          out.push(
            `| ${item.header.map(esc).join(" | ")} |`,
            `| ${item.header.map(() => "---").join(" | ")} |`
          );
        }
        for (const row of item.rows) out.push(`| ${row.map(esc).join(" | ")} |`);
        out.push("");
      }
    }
  }
  return out.join("\n") + "\n";
}

/** Parse + sanity-check + render. Throws on parse failure. */
export function snapshotFromHtml(html) {
  const sections = parseDocs(html);
  const byId = new Map(sections.map((s) => [s.id, s]));
  const problems = [];
  for (const id of REQUIRED_SECTIONS) {
    const s = byId.get(id);
    if (!s) problems.push(`missing section #${id}`);
    else if (!s.items.some((i) => i.kind === "endpoint"))
      problems.push(`section #${id} has no endpoint URLs`);
  }
  const tables = sections.flatMap((s) => s.items.filter((i) => i.kind === "table"));
  if (tables.length < 5) problems.push(`only ${tables.length} parameter tables found`);
  if (problems.length > 0) {
    const err = new Error(
      "Docs page no longer matches the expected structure (redesign?):\n  - " +
        problems.join("\n  - ")
    );
    err.parseFailure = true;
    throw err;
  }
  return renderSnapshot(sections);
}

// ── tiny line diff (LCS) for readable drift output ─────────────────────────

export function diffLines(a, b) {
  const A = a.split("\n");
  const B = b.split("\n");
  const n = A.length;
  const m = B.length;
  // LCS table on prefixes (sizes here are a few hundred lines — fine).
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(`- ${A[i++]}`);
    else out.push(`+ ${B[j++]}`);
  }
  while (i < n) out.push(`- ${A[i++]}`);
  while (j < m) out.push(`+ ${B[j++]}`);
  return out.join("\n");
}

// ── cli ────────────────────────────────────────────────────────────────────

async function loadHtml(args) {
  const fileIdx = args.indexOf("--from-file");
  if (fileIdx !== -1) return readFileSync(args[fileIdx + 1], "utf8");
  const res = await fetch(DOCS_URL, {
    headers: { "User-Agent": "oblio-mcp-server docs-drift check" },
  });
  if (!res.ok) throw new Error(`GET ${DOCS_URL} returned HTTP ${res.status}`);
  return await res.text();
}

async function main() {
  const args = process.argv.slice(2);
  const update = args.includes("--update");

  let snapshot;
  try {
    snapshot = snapshotFromHtml(await loadHtml(args));
  } catch (err) {
    console.error(`[docs-snapshot] ${err.message}`);
    process.exit(2);
  }

  if (update) {
    mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
    writeFileSync(SNAPSHOT_PATH, snapshot);
    console.log(`[docs-snapshot] wrote ${SNAPSHOT_PATH}`);
    return;
  }

  let committed;
  try {
    committed = readFileSync(SNAPSHOT_PATH, "utf8");
  } catch {
    console.error(
      `[docs-snapshot] no committed snapshot at ${SNAPSHOT_PATH}; run with --update first`
    );
    process.exit(2);
  }

  if (committed === snapshot) {
    console.log("[docs-snapshot] no drift — docs match the committed snapshot");
    return;
  }
  console.log("[docs-snapshot] DRIFT DETECTED — oblio.eu/api differs from the snapshot:\n");
  console.log(diffLines(committed, snapshot));
  process.exit(3);
}

// Only run the CLI when executed directly (the test suite imports us).
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
