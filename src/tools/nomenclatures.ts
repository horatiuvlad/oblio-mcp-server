/**
 * Nomenclature (reference data) tool. Exposes Oblio's nomenclature endpoint,
 * which serves the account's reference lists: companies, clients, products,
 * VAT rates, document series, languages, and management units (gestiuni).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OblioConfig } from "../config.js";
import { nomenclatureShape } from "../schemas.js";
import { getClient } from "../oblio.js";
import { ok, fail } from "../result.js";

export function registerNomenclatureTools(server: McpServer, cfg: OblioConfig): void {
  server.registerTool(
    "get_nomenclatures",
    {
      title: "Get nomenclatures",
      description:
        "Fetch Oblio reference data: companies on the account, saved clients, " +
        "products, VAT rates, document series, languages, or management units " +
        "(gestiuni). Use this to discover valid values (e.g. series names, VAT " +
        "rate names) before creating documents. Supports an optional name " +
        "filter and extra query filters such as pagination offset.",
      inputSchema: { ...nomenclatureShape },
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
        return ok(await api.nomenclature(args.type, args.name, args.filters));
      } catch (err) {
        return fail("fetching nomenclature", err);
      }
    }
  );
}
