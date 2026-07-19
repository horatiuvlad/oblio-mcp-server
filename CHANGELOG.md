# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-07-19

### Added

- **Webhook tools** (closes the last coverage gap vs the documented API):
  `create_webhook`, `list_webhooks`, `delete_webhook` — subscribe external
  endpoints to Oblio events (`stock`, `<Doc>/SaveDraft`, `<Doc>/Update`,
  `<Doc>/Cancel`, `Collect/Inserted`), via `rawRequest` (not covered by the
  typed SDK). 15 tools total.
- **Docs-drift automation.** Oblio has no machine-readable spec, so
  `scripts/oblio-docs-snapshot.mjs` snapshots the contract-bearing parts of
  https://www.oblio.eu/api (endpoints, parameter tables, response samples)
  into `docs/oblio-api.snapshot.md`; the weekly `oblio-docs-drift` workflow
  re-fetches, opens a PR on drift, and — when the `ANTHROPIC_API_KEY` secret
  is set — has Claude Code draft the matching `schemas.ts`/tool changes as a
  commit on that PR (human reviews and merges).
- **Renovate config** flagging `@obliosoftware/oblioapi` releases as a
  likely-API-change tripwire.
- **Test suite expansion** (23 → 51 tests): full-surface MCP integration
  tests over an in-memory client↔server transport (tool inventory,
  annotations, schema descriptions, zod validation through the MCP layer),
  schema unit tests, docs-parser tests against a committed fixture, and a
  guard that every accepted webhook topic is still documented upstream.

### Fixed

- `McpServer` version string now tracks the package version (was stuck at
  0.1.0).

## [1.0.0] - 2026-07-16

Initial release.

### Added

- **12 MCP tools** over the Oblio.eu API, built on the official
  [`@obliosoftware/oblioapi`](https://www.npmjs.com/package/@obliosoftware/oblioapi) SDK:
  - Documents: `create_document`, `get_document`, `list_documents`,
    `cancel_document`, `restore_document`, `delete_document`
  - Payments: `collect_payment`
  - Nomenclatures: `get_nomenclatures`
  - e-Factura / SPV: `create_einvoice`, `get_einvoice`
  - Company: `set_cif`, `get_cif`
- **Client-side idempotency guard** — an optional `idempotencyKey` on
  `create_document` prevents accidental double-issue on retries (Oblio has no
  draft state, so a create always mints a real numbered document).
- **Zod-validated inputs** with descriptive field docs, and **MCP tool
  annotations** (read-only / destructive / idempotent hints) on every tool.
- **Configurable OAuth token cache** — in-memory by default; set
  `OBLIO_TOKEN_FILE` to persist across restarts.
- Full document list filter set, including `client[...]` bracket filters,
  date ranges, and pagination.
- CI (Node 20 & 22: typecheck, tests, build) and tag-triggered npm publish with
  provenance.

[1.1.0]: https://github.com/horatiuvlad/oblio-mcp-server/releases/tag/v1.1.0
[1.0.0]: https://github.com/horatiuvlad/oblio-mcp-server/releases/tag/v1.0.0
