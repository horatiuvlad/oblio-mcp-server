/**
 * Webhook subscription tools. Oblio's pub/sub webhooks notify an external
 * endpoint on account events (stock changes, document drafts / updates /
 * cancellations, recorded payments). Like e-Factura, these endpoints are not
 * covered by the typed SDK, so all three tools go through rawRequest.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OblioConfig } from "../config.js";
import { getClient, rawRequest } from "../oblio.js";
import { ok, fail } from "../result.js";
import { createWebhookShape, deleteWebhookShape } from "../schemas.js";

export function registerWebhookTools(server: McpServer, cfg: OblioConfig): void {
  server.registerTool(
    "create_webhook",
    {
      title: "Create webhook",
      description:
        "Subscribe an external endpoint to an Oblio event (stock changes, " +
        "document drafts/updates/cancellations, recorded payments). The " +
        "endpoint must respond with HTTP 200 and echo the base64-encoded " +
        'value of the "X-Oblio-Request-Id" request header, otherwise Oblio ' +
        "rejects the subscription.",
      inputSchema: { ...createWebhookShape },
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
        return ok(
          await rawRequest(cfg, "post", "/api/webhooks", {
            cif: args.cif ?? api.getCif(),
            topic: args.topic,
            endpoint: args.endpoint,
          })
        );
      } catch (err) {
        return fail("creating webhook", err);
      }
    }
  );

  server.registerTool(
    "list_webhooks",
    {
      title: "List webhooks",
      description:
        "List all webhook subscriptions on the account, with their topic, " +
        "endpoint URL and id.",
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
        return ok(await rawRequest(cfg, "get", "/api/webhooks", {}));
      } catch (err) {
        return fail("listing webhooks", err);
      }
    }
  );

  server.registerTool(
    "delete_webhook",
    {
      title: "Delete webhook",
      description:
        "Delete a webhook subscription by its id (see list_webhooks). Oblio " +
        "stops sending notifications for that topic/endpoint.",
      inputSchema: { ...deleteWebhookShape },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        return ok(
          await rawRequest(
            cfg,
            "delete",
            `/api/webhooks/${encodeURIComponent(String(args.id))}`,
            {}
          )
        );
      } catch (err) {
        return fail("deleting webhook", err);
      }
    }
  );
}
