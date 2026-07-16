/**
 * Document lifecycle tools: create, fetch, list, cancel, restore and delete
 * fiscal documents (invoices / proformas / delivery notices) via the Oblio
 * SDK. Registered on the shared MCP server by registerDocumentTools.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OblioConfig } from "../config.js";
import { getClient, withIdempotency } from "../oblio.js";
import { ok, fail } from "../result.js";
import {
  createDocumentShape,
  getDocumentShape,
  listDocumentsShape,
  cancelDocumentShape,
  restoreDocumentShape,
  deleteDocumentShape,
} from "../schemas.js";

export function registerDocumentTools(server: McpServer, cfg: OblioConfig): void {
  // ── create_document ────────────────────────────────────────────────────
  server.registerTool(
    "create_document",
    {
      title: "Create document",
      description:
        "Issue a new fiscal document in Oblio: an invoice (factura), a " +
        "proforma, or a delivery notice (aviz). Provide the document body " +
        "(client, series, line items, dates). NOTE: Oblio has no draft " +
        "state — the document is issued immediately. Pass an idempotencyKey " +
        "to guard against accidental double-issue on retries.",
      inputSchema: { ...createDocumentShape },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const api = getClient(cfg);
        // Fall back to the client's configured company CIF when not given.
        const data = { ...args.data };
        if (!data.cif) data.cif = api.getCif();
        return ok(
          await withIdempotency(args.idempotencyKey, () =>
            api.createDoc(args.type, data)
          )
        );
      } catch (err) {
        return fail("creating document", err);
      }
    }
  );

  // ── get_document ───────────────────────────────────────────────────────
  server.registerTool(
    "get_document",
    {
      title: "Get document",
      description:
        "Fetch a single document (invoice/proforma/notice) by its series " +
        "name and number, including totals, status and a link.",
      inputSchema: { ...getDocumentShape },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const api = getClient(cfg);
        return ok(await api.get(args.type, args.seriesName, args.number));
      } catch (err) {
        return fail("getting document", err);
      }
    }
  );

  // ── list_documents ─────────────────────────────────────────────────────
  server.registerTool(
    "list_documents",
    {
      title: "List documents",
      description:
        "List documents of a given type, with optional filters: series, " +
        "number, client, issue-date range, draft/cancelled flags, sorting " +
        "and pagination.",
      inputSchema: { ...listDocumentsShape },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const api = getClient(cfg);
        // Everything except `type` is an API-side filter; drop undefined keys.
        const { type, ...rest } = args;
        const filters: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rest)) {
          if (value !== undefined) filters[key] = value;
        }
        return ok(await api.list(type, filters));
      } catch (err) {
        return fail("listing documents", err);
      }
    }
  );

  // ── cancel_document ────────────────────────────────────────────────────
  server.registerTool(
    "cancel_document",
    {
      title: "Cancel document",
      description:
        "Cancel (annul) a document. The document stays in Oblio marked as " +
        "cancelled and can later be restored with restore_document.",
      inputSchema: { ...cancelDocumentShape },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const api = getClient(cfg);
        return ok(await api.cancel(args.type, args.seriesName, args.number, true));
      } catch (err) {
        return fail("cancelling document", err);
      }
    }
  );

  // ── restore_document ───────────────────────────────────────────────────
  server.registerTool(
    "restore_document",
    {
      title: "Restore document",
      description:
        "Restore a previously cancelled document back to its active state.",
      inputSchema: { ...restoreDocumentShape },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const api = getClient(cfg);
        return ok(await api.cancel(args.type, args.seriesName, args.number, false));
      } catch (err) {
        return fail("restoring document", err);
      }
    }
  );

  // ── delete_document ────────────────────────────────────────────────────
  server.registerTool(
    "delete_document",
    {
      title: "Delete document",
      description:
        "Permanently delete a document. Oblio only allows deleting the last " +
        "document in a series; prefer cancel_document for anything else.",
      inputSchema: { ...deleteDocumentShape },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const api = getClient(cfg);
        return ok(await api.delete(args.type, args.seriesName, args.number));
      } catch (err) {
        return fail("deleting document", err);
      }
    }
  );
}
