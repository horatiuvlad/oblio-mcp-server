# Contributing

Thanks for your interest in improving `oblio-mcp-server`.

## Development setup

```bash
git clone https://github.com/horatiuvlad/oblio-mcp-server.git
cd oblio-mcp-server
npm install
```

## Checks

All of these run in CI (Node 20 and 22) and should pass before you open a PR:

```bash
npm run typecheck   # tsc --noEmit, strict
npm test            # node:test unit suite — no live credentials needed
npm run build       # compile to dist/
```

The unit tests deliberately avoid hitting the live Oblio API. If you add a tool,
add a matching unit test for any pure logic (schema shaping, filter building)
and keep network calls behind the SDK so they stay mockable.

## Manual end-to-end check

To exercise the server against a real Oblio account, point an MCP client (or a
small stdio script) at `dist/index.js` with `OBLIO_API_EMAIL`,
`OBLIO_API_SECRET` and `OBLIO_CIF` set. Prefer read-only tools
(`get_nomenclatures`, `list_documents`, `get_document`) — remember that
`create_document` issues a real, numbered fiscal document.

## Conventions

- TypeScript, ESM, `NodeNext` module resolution — relative imports end in `.js`.
- Each tool group lives in `src/tools/` and exports a `register*` function.
- Shared Zod schemas live in `src/schemas.ts`; the SDK wrapper and helpers in
  `src/oblio.ts`; the uniform result envelope in `src/result.ts`.
- Tool handlers wrap their body in try/catch and return `ok(...)` / `fail(...)`.

## Releases

Maintainers cut a release by bumping the version in `package.json` (and
`server.json`), updating `CHANGELOG.md`, then pushing a matching `vX.Y.Z` tag.
The release workflow publishes to npm with provenance and creates the GitHub
Release.

## License

By contributing you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
