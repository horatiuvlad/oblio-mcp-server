# oblio-mcp-server

[![CI](https://github.com/horatiuvlad/oblio-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/horatiuvlad/oblio-mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A [Model Context Protocol](https://modelcontextprotocol.io) server for [Oblio.eu](https://www.oblio.eu). It lets Claude Desktop or any other MCP client issue invoices, proformas and delivery notices, collect payments, submit e-Factura to Romania's SPV, and look up your account's reference data in plain language.

> **A newer server exists.** The [Oblio server in foreverworks/mcps](https://github.com/foreverworks/mcps/tree/main/servers/oblio) is this project's successor. It is on npm, has your client ask you before anything that makes or changes a fiscal document, and is where new features go. This one gets no new features. It still covers delivery notices, webhooks and e-Factura submission, which the successor does not have, so stay here if you need those.

> Unofficial community project. Not affiliated with or endorsed by Oblio Software; it builds on their public API and official Node SDK.

## Features

- **Built on Oblio's official SDK** ([`@obliosoftware/oblioapi`](https://www.npmjs.com/package/@obliosoftware/oblioapi)): no hand-rolled HTTP layer for the core API
- **Full document lifecycle**: create, fetch, list, cancel, restore and delete invoices, proformas and delivery notices (avize)
- **Payments**: record collections (incasari) against invoices, with all Oblio payment methods
- **e-Factura / SPV**: submit invoices to ANAF's SPV and poll their processing status
- **Nomenclatures**: discover valid series names, VAT rates, saved clients, products, languages and management units before issuing documents
- **Webhooks**: subscribe external endpoints to Oblio events (stock changes, document drafts/updates/cancellations, recorded payments)
- **Multi-company**: switch the active company CIF at runtime via `set_cif`
- **Client-side idempotency guard**: pass an `idempotencyKey` to `create_document` and a retry within the same server process won't issue a second document
- **Zod-validated inputs**: every tool input is schema-checked with descriptive field docs
- **MCP tool annotations**: read-only / destructive / idempotent hints on every tool, so clients can gate confirmations appropriately

## Prerequisites

- Node.js >= 20
- An Oblio.eu account with API access

## Getting API credentials

In Oblio, go to **Setari > Date Cont**. You need:

- the **account email** (acts as the OAuth client id)
- the **API secret** (acts as the OAuth client secret)
- your **company CIF** (e.g. `RO12345678`), optional at startup; it can also be set at runtime with the `set_cif` tool

## Installation

### Check that it starts

Before you wire up a client, run the server once with dummy values. No Oblio account is needed for this, and nothing is sent to Oblio:

```bash
OBLIO_API_EMAIL=you@example.com OBLIO_API_SECRET=dummy npx -y github:horatiuvlad/oblio-mcp-server
```

npx downloads and builds the server on first run. It then prints this on stderr and waits for an MCP client on stdin (press Ctrl+C to stop):

```
[oblio-mcp-server] ready (stdio)
```

Once a client is connected, its tool list shows 15 tools.

### Claude Desktop and other MCP clients, via npx

Add the server to your MCP client configuration. In Claude Desktop that is `claude_desktop_config.json` (Settings > Developer > Edit Config opens it):

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Restart the client after you save the file; it reads the configuration only at start-up. This version runs straight from GitHub:

```json
{
  "mcpServers": {
    "oblio": {
      "command": "npx",
      "args": ["-y", "github:horatiuvlad/oblio-mcp-server"],
      "env": {
        "OBLIO_API_EMAIL": "you@example.com",
        "OBLIO_API_SECRET": "your-api-secret",
        "OBLIO_CIF": "RO12345678"
      }
    }
  }
}
```

The package is not on npm yet, so `npx -y oblio-mcp-server` does not work today. Once it is published, `"args": ["-y", "oblio-mcp-server"]` will work as well.

### From a local build

```bash
git clone https://github.com/horatiuvlad/oblio-mcp-server.git
cd oblio-mcp-server
npm install
npm run build
```

```json
{
  "mcpServers": {
    "oblio": {
      "command": "node",
      "args": ["/path/to/oblio-mcp-server/dist/index.js"],
      "env": {
        "OBLIO_API_EMAIL": "you@example.com",
        "OBLIO_API_SECRET": "your-api-secret",
        "OBLIO_CIF": "RO12345678"
      }
    }
  }
}
```

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `OBLIO_API_EMAIL` | yes | Oblio account email (Setari > Date Cont) |
| `OBLIO_API_SECRET` | yes | Oblio API secret (Setari > Date Cont) |
| `OBLIO_CIF` | no | Default company CIF; can be changed at runtime with `set_cif` |
| `OBLIO_TOKEN_FILE` | no | Path where the OAuth access token is persisted so it survives restarts (defaults to in-memory only) |
| `OBLIO_BASE_URL` | no | API origin, default `https://www.oblio.eu`. Point it at a mock or sandbox for tests and evals |

## Tools

### Documents

| Tool | Description |
| --- | --- |
| `create_document` | Issue an invoice, proforma or delivery notice (aviz); supports an optional `idempotencyKey` to guard against double-issue on retries |
| `get_document` | Fetch a single document by series name and number, with totals, status and a link |
| `list_documents` | List documents with filters: series, number, client (cif/email/phone/code), issue-date range, draft/cancelled/collected flags, optional line items / payments / SPV status, sorting and pagination |
| `cancel_document` | Cancel (annul) a document; it stays in Oblio and can be restored later |
| `restore_document` | Restore a previously cancelled document to its active state |
| `delete_document` | Permanently delete a document (Oblio only allows deleting the last one in a series) |

### Payments

| Tool | Description |
| --- | --- |
| `collect_payment` | Record a payment (incasare) against an existing invoice; defaults to the full remaining amount when no value is given |

### Nomenclatures

| Tool | Description |
| --- | --- |
| `get_nomenclatures` | Fetch reference data: companies, saved clients, products, VAT rates, document series, languages, or management units (gestiuni) |

### e-Factura

| Tool | Description |
| --- | --- |
| `create_einvoice` | Submit an issued invoice to Romania's SPV (e-Factura / ANAF) |
| `get_einvoice` | Fetch the SPV status and archive for a submitted invoice (0 = processing, 1 = success, 2 = errors, -1 = not sent) |

### Webhooks

| Tool | Description |
| --- | --- |
| `create_webhook` | Subscribe an endpoint to an Oblio event: `stock`, `<Doc>/SaveDraft`, `<Doc>/Update`, `<Doc>/Cancel` (Doc = Invoice/Proforma/Notice/TaxReceipt) or `Collect/Inserted`. The endpoint must answer 200 and echo the base64 of the `X-Oblio-Request-Id` header |
| `list_webhooks` | List all webhook subscriptions with topic, endpoint and id |
| `delete_webhook` | Delete a webhook subscription by id |

### Company

| Tool | Description |
| --- | --- |
| `set_cif` | Set the active company CIF used for subsequent requests (switch between companies on one account) |
| `get_cif` | Return the company CIF currently in effect |

## Why another Oblio MCP?

- It sits on Oblio's **official SDK**
- It ships with a **test suite** and strict typechecking
- `create_document` has a **client-side idempotency guard**, so a retry does not silently issue a duplicate invoice
- **Full e-Factura / SPV coverage**: submit and track invoices with ANAF, not just issue them locally

## When something goes wrong

- `[oblio-mcp-server] OBLIO_API_EMAIL and OBLIO_API_SECRET environment variables must be set (get them from Oblio → Setari > Date Cont).` followed by exit code 1: one of the two is missing or empty. Set both in the `env` block of your MCP client configuration.
- `[oblio-mcp-server] ready (stdio)` on stderr is the normal start-up line; the server then waits for an MCP client on stdin.
- Questions and bug reports: [GitHub issues](https://github.com/horatiuvlad/oblio-mcp-server/issues).

## Development

```bash
npm run build      # compile to dist/
npm test           # run the test suite
npm run typecheck  # tsc --noEmit
```

### Keeping up with the Oblio API (docs drift)

Oblio publishes no machine-readable API spec. Its HTML docs at
[oblio.eu/api](https://www.oblio.eu/api) are the contract that
`src/schemas.ts` encodes by hand. Three layers guard against silent drift:

1. **Docs snapshot**: `scripts/oblio-docs-snapshot.mjs` extracts the
   contract-bearing parts of the docs page (endpoints, parameter tables,
   response samples) into `docs/oblio-api.snapshot.md`. The
   [`oblio-docs-drift` workflow](.github/workflows/oblio-docs-drift.yml)
   re-fetches weekly and, on any change, opens a PR with the refreshed
   snapshot and the diff.
2. **Claude Code draft**: when the `ANTHROPIC_API_KEY` repository secret is
   set, the same workflow runs Claude Code on the drift PR branch. It turns the
   docs diff into changes to `src/schemas.ts` and the tool modules (including
   `.describe()` text), checks them with typecheck and tests, and pushes them
   as a commit on the PR. A person still reviews and merges. Without the
   secret the PR carries a manual checklist instead.
3. **SDK tripwire**: [Renovate](renovate.json) flags releases of
   `@obliosoftware/oblioapi`, which usually accompany API changes.

```bash
node scripts/oblio-docs-snapshot.mjs --check    # exit 3 + diff on drift
node scripts/oblio-docs-snapshot.mjs --update   # refresh the snapshot
```

## License

[MIT](LICENSE)
