/**
 * Company (CIF) tools. Oblio scopes every request to a company identified by
 * its CIF; these tools let the caller switch the active company at runtime
 * and inspect which one is currently in effect.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OblioConfig } from "../config.js";
import { getClient } from "../oblio.js";
import { ok, fail } from "../result.js";
import { setCifShape } from "../schemas.js";

export function registerCompanyTools(server: McpServer, cfg: OblioConfig): void {
  server.registerTool(
    "set_cif",
    {
      title: "Set active company CIF",
      description:
        "Set the active company CIF used for all subsequent Oblio requests. " +
        "Use this to switch between companies on the same Oblio account.",
      inputSchema: { ...setCifShape },
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
        api.setCif(args.cif);
        return ok({ cif: api.getCif() });
      } catch (err) {
        return fail("setting company CIF", err);
      }
    }
  );

  server.registerTool(
    "get_cif",
    {
      title: "Get active company CIF",
      description: "Return the company CIF currently used for Oblio requests.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        return ok({ cif: getClient(cfg).getCif() });
      } catch (err) {
        return fail("getting company CIF", err);
      }
    }
  );
}
