#!/usr/bin/env node
/**
 * Cabal-Hunter — local stdio MCP server.
 *
 * A thin Model Context Protocol server that exposes one tool, `check_cabal_risk`,
 * and proxies to the hosted Cabal-Hunter API (https://api.cabal-hunter.com).
 * Drop it into any MCP client (Claude Desktop, Cursor, ElizaOS) to give an agent
 * a pre-trade safety check that catches coordinated wallet cabals, same-block
 * Jito bundles, serial-rug deployers and live coordinated dumps on any Solana
 * mint before it signs a swap.
 *
 * Free tier: 100 scans/month. Beyond that, scans are $0.02 USDC via x402 on
 * Solana — when a scan needs payment the API returns HTTP 402 with the payment
 * instructions, which this tool surfaces to the caller.
 *
 * Uses the low-level Server API + JSON-Schema tool definitions for maximum
 * compatibility across @modelcontextprotocol/sdk versions.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_BASE = process.env.CABAL_HUNTER_API || "https://api.cabal-hunter.com";
const SCAN_URL = `${API_BASE}/api/scan-cabal`;

const server = new Server(
  { name: "cabal-hunter", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const CHECK_CABAL_RISK = {
  name: "check_cabal_risk",
  description:
    "Scan a Solana token mint for coordinated wallet cabals, same-block Jito " +
    "bundle buys, serial-rug deployers and live coordinated dumps. Returns an " +
    "Exit-Liquidity Risk verdict (cabal_score 0-100, risk level, is_controlled, " +
    "coordinated wallet clusters) so a trading agent can decide whether it is " +
    "about to become exit liquidity BEFORE it signs a swap. Works on pump.fun, " +
    "PumpSwap and Raydium tokens.",
  inputSchema: {
    type: "object",
    properties: {
      mintAddress: {
        type: "string",
        description: "The Solana token mint address (base58) to scan.",
      },
    },
    required: ["mintAddress"],
  },
};

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [CHECK_CABAL_RISK],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "check_cabal_risk") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }
  const mintAddress = request.params.arguments?.mintAddress;
  if (!mintAddress || typeof mintAddress !== "string") {
    return {
      isError: true,
      content: [{ type: "text", text: "mintAddress is required (base58 mint string)." }],
    };
  }

  try {
    const resp = await fetch(SCAN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mintAddress }),
    });

    // x402: payment required — surface the instructions rather than failing.
    if (resp.status === 402) {
      const body = await resp.json().catch(() => ({}));
      return {
        content: [
          {
            type: "text",
            text:
              "Payment required (x402). Free tier exhausted — this scan costs " +
              "$0.02 USDC on Solana.\n\n" +
              JSON.stringify(body.payment || body, null, 2),
          },
        ],
      };
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return {
        isError: true,
        content: [{ type: "text", text: `Scan failed: HTTP ${resp.status} ${text}` }],
      };
    }

    const data = await resp.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `Scan error: ${err?.message || String(err)}` }],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio transport keeps the process alive; log to stderr so stdout stays clean.
  console.error("cabal-hunter MCP server running on stdio");
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
