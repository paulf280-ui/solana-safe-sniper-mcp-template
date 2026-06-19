# Cabal-Hunter local stdio MCP server.
# Used by Glama (and any MCP host) to build + run the server for automated
# tool discovery and quality checks. Requires no secrets — the free tier works
# out of the box; paid scans use x402 at call time.
FROM node:20-slim

WORKDIR /app

# Install deps first for layer caching.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy the server.
COPY server ./server

# MCP servers speak JSON-RPC over stdio.
ENTRYPOINT ["node", "server/index.mjs"]
