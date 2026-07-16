/**
 * Uniform MCP tool result envelope. Every tool returns text content; errors
 * are surfaced with isError:true and a readable message rather than throwing
 * across the transport.
 */
import { OblioApiException } from "./oblio.js";

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

export function ok(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function fail(action: string, error: unknown): ToolResult {
  let message: string;
  if (error instanceof OblioApiException) {
    message = `Oblio API error (code ${error.code}): ${error.message}`;
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = String(error);
  }
  return {
    content: [{ type: "text", text: `Error ${action}: ${message}` }],
    isError: true,
  };
}
