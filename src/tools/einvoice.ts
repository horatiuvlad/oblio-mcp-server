/**
 * e-Factura (SPV) tools. These endpoints are not covered by the typed Oblio
 * SDK, so both tools go through rawRequest, which reuses the SDK's
 * authenticated HTTP client.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OblioConfig } from "../config.js";
import { getClient, rawRequest } from "../oblio.js";
import { ok, fail } from "../result.js";
import { createEinvoiceShape, getEinvoiceShape } from "../schemas.js";

export function registerEinvoiceTools(server: McpServer, cfg: OblioConfig): void {
  server.registerTool(
    "create_einvoice",
    {
      title: "Submit e-invoice to SPV",
      description:
        "Submit an existing Oblio invoice to Romania's SPV (e-Factura). " +
        "The invoice must already be issued in Oblio; this sends its XML to " +
        "ANAF. The response includes an einvoice status: 0 = processing, " +
        "1 = success, 2 = errors, -1 = not sent.",
      inputSchema: { ...createEinvoiceShape },
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
        const cif = api.getCif();
        return ok(
          await rawRequest(cfg, "post", "/api/docs/einvoice", {
            cif,
            seriesName: args.seriesName,
            number: args.number,
          })
        );
      } catch (err) {
        return fail("submitting e-invoice to SPV", err);
      }
    }
  );

  server.registerTool(
    "get_einvoice",
    {
      title: "Get e-invoice SPV status",
      description:
        "Fetch the SPV (e-Factura) status and archive for an invoice " +
        "previously submitted with create_einvoice. Status codes: " +
        "0 = processing, 1 = success, 2 = errors, -1 = not sent.",
      inputSchema: { ...getEinvoiceShape },
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
        const cif = api.getCif();
        return ok(
          await rawRequest(cfg, "get", "/api/docs/einvoice", {
            cif,
            seriesName: args.seriesName,
            number: args.number,
          })
        );
      } catch (err) {
        return fail("fetching e-invoice SPV status", err);
      }
    }
  );
}
