/**
 * Payment tools: record collections (incasari) against existing invoices.
 * Oblio only supports collecting on invoices, so unlike the document tools
 * there is no `type` argument here.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OblioConfig } from "../config.js";
import { getClient } from "../oblio.js";
import { ok, fail } from "../result.js";
import { collectPaymentShape } from "../schemas.js";

export function registerPaymentTools(server: McpServer, cfg: OblioConfig): void {
  server.registerTool(
    "collect_payment",
    {
      title: "Collect payment",
      description:
        "Record a payment (incasare) against an existing invoice, identified by " +
        "series name and number. The collect object specifies the payment method " +
        "(Chitanta, Ordin de plata, Card, etc.) and optionally the amount and date; " +
        "when no value is given the full remaining invoice amount is collected. " +
        "Applies to invoices only.",
      inputSchema: { ...collectPaymentShape },
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
        return ok(await api.collect(args.seriesName, args.number, args.collect));
      } catch (err) {
        return fail("collecting payment", err);
      }
    }
  );
}
