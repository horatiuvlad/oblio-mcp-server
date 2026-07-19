/**
 * Assembles the MCP server and registers every tool group. Each group lives
 * in its own module under ./tools and exposes a register* function taking the
 * shared server and the loaded config.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OblioConfig } from "./config.js";
import { registerDocumentTools } from "./tools/documents.js";
import { registerPaymentTools } from "./tools/payments.js";
import { registerNomenclatureTools } from "./tools/nomenclatures.js";
import { registerEinvoiceTools } from "./tools/einvoice.js";
import { registerCompanyTools } from "./tools/company.js";
import { registerWebhookTools } from "./tools/webhooks.js";

export function createServer(cfg: OblioConfig): McpServer {
  const server = new McpServer({
    name: "oblio-mcp-server",
    version: "1.1.0",
  });

  registerDocumentTools(server, cfg);
  registerPaymentTools(server, cfg);
  registerNomenclatureTools(server, cfg);
  registerEinvoiceTools(server, cfg);
  registerCompanyTools(server, cfg);
  registerWebhookTools(server, cfg);

  return server;
}
