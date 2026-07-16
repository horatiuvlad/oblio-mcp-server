# oblio-mcp-server

A [Model Context Protocol](https://modelcontextprotocol.io) server for [Oblio.eu](https://www.oblio.eu) — issue invoices, proformas and delivery notices, collect payments, submit e-Factura to Romania's SPV, and query your account's reference data through natural language, from Claude Desktop or any MCP client.

> Unofficial community project. Not affiliated with or endorsed by Oblio Software; it builds on their public API and official Node SDK.

## Features

- **Built on Oblio's official SDK** ([`@obliosoftware/oblioapi`](https://www.npmjs.com/package/@obliosoftware/oblioapi)) — no hand-rolled HTTP layer for the core API
- **Full document lifecycle** — create, fetch, list, cancel, restore and delete invoices, proformas and delivery notices (avize)
- **Payments** — record collections (incasari) against invoices, with all Oblio payment methods
- **e-Factura / SPV** — submit invoices to ANAF's SPV and poll their processing status
- **Nomenclatures** — discover valid series names, VAT rates, saved clients, products, languages and management units before issuing documents
- **Multi-company** — switch the active company CIF at runtime via `set_cif`
- **Client-side idempotency guard** — pass an `idempotencyKey` to `create_document` and retries won't double-issue a document
- **Zod-validated inputs** — every tool input is schema-checked with descriptive field docs
- **MCP tool annotations** — read-only / destructive / idempotent hints on every tool, so clients can gate confirmations appropriately

## Prerequisites

- Node.js >= 20
- An Oblio.eu account with API access

## Getting API credentials

In Oblio, go to **Setari > Date Cont**. You need:

- the **account email** (acts as the OAuth client id)
- the **API secret** (acts as the OAuth client secret)
- your **company CIF** (e.g. `RO12345678`) — optional at startup; it can also be set at runtime with the `set_cif` tool

## Installation

### Claude Desktop / MCP clients — via npx

Add to your MCP client configuration (e.g. `claude_desktop_config.json`). Straight from GitHub (npx builds it on first run):

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

Once the package is published to npm, `"args": ["-y", "oblio-mcp-server"]` will work as well.

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

### Company

| Tool | Description |
| --- | --- |
| `set_cif` | Set the active company CIF used for subsequent requests (switch between companies on one account) |
| `get_cif` | Return the company CIF currently in effect |

## Why another Oblio MCP?

- It sits on Oblio's **official SDK** rather than reimplementing the API surface
- It ships with a **test suite** and strict typechecking
- `create_document` has a **client-side idempotency guard**, so agent retries don't silently issue duplicate invoices
- **Full e-Factura / SPV coverage** — submit and track invoices with ANAF, not just issue them locally

## Development

```bash
npm run build      # compile to dist/
npm test           # run the test suite
npm run typecheck  # tsc --noEmit
```

## License

[MIT](LICENSE)
