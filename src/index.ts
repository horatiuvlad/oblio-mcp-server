#!/usr/bin/env node
/**
 * Entry point: load config, build the server, speak MCP over stdio.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, ConfigError } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[oblio-mcp-server] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const server = createServer(cfg);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[oblio-mcp-server] ready (stdio)");
}

main().catch((err) => {
  console.error("[oblio-mcp-server] fatal:", err);
  process.exit(1);
});
