# Solana Safe Sniper — MCP Template

> Stop your AI trading agents getting rugged by coordinated wallet cabals.
> Drop-in template for Claude Code, Cursor, and ElizaOS.

---

## The Problem

Your autonomous trading agent is reading rug.check scores, liquidity locks, and contract audits.

**None of that catches a cabal.**

A cabal is 15 fresh wallets — all funded from the same master wallet, all buying in the first 90 seconds of launch — quietly accumulating 25-40% of supply before your bot sees the first candle. Contract clean. LP burned. Everything green.

Then they dump. Simultaneously. Into your liquidity.

This template integrates **[Cabal-Hunter](https://api.cabal-hunter.com)** — a live on-chain funding tracer — as a pre-trade safety check so your agent catches coordinated launches before it signs a swap.

---

## What Cabal-Hunter Does — Five Detection Layers

```
Token mint address
      ↓
1. FUNDING TRACE — top holders walked back to launch: who was funded
   by the same source wallet? (classic cabal signature). Every cluster
   carries evidence_txs[] — the actual funding transactions on Solscan.
      ↓
2. SAME-BLOCK BUNDLE DETECTION — holders whose token accounts were
   created in the EXACT same slot bought in one Jito bundle. Catches
   stealth launches that route funding through intermediaries to
   evade layer 1. Returned as `time_sync: true`.
      ↓
3. COORDINATED DUMP DETECTION — ≥2 holders that SOLD a meaningful chunk
   (≥25% of their bag each) in the EXACT same block — a cabal exiting in
   real time. `coordinated_exit: true`, with sold_pct = % of supply
   dumped and the sell transactions linked. Same-slot + meaningful-size +
   distinct wallets = near-zero false positives.
      ↓
4. DEPLOYER TRACK RECORD — the creator wallet is resolved on-chain
   (bonding curve pre-graduation, pump-amm pool after — works on any
   age token), their full launch history pulled, and every previous
   token checked: alive or dead?
      ↓
5. CEX-NOISE FILTER — holders funded from a shared exchange or
   high-volume infra wallet are NOT a cabal. They're excluded from the
   score and surfaced transparently in filtered_clusters[], so you never
   get a false positive from people who just withdrew from Binance.
      ↓
Returns: Cabal Score (0-100) + cluster map + deployer verdict
         + on-chain receipts + hard verdict
```

The deployer layer is the one cabals can't dodge: **wallets rotate, deployers leave a paper trail.** A response of `"deployer": {"verdict": "SERIAL_RUGGER", "tokens_launched": 14, "dead": 13}` tells you everything before the first candle.

**Receipts, not magic.** Every cluster and red flag links to the underlying Solscan transaction (`evidence_txs[]`, `holders[].funding_tx`) — verify the trail yourself instead of trusting a score.

**Response in <100ms** on pre-indexed tokens — every pump.fun graduation is scanned and cached automatically as it happens.

**Free tier: 100 queries/month per IP.** Then $0.05 USDC per query, paid natively on Solana. No account. No API key. No subscription.

---

## Quick Start

### 1. Claude Code / Claude Desktop

Add to your MCP config (`~/.claude/mcp.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "cabal-hunter": {
      "url": "https://api.cabal-hunter.com/mcp"
    }
  }
}
```

That's it. Claude will now call `check_cabal_risk` automatically when you ask it to analyse a Solana token.

**Example prompt:**
> "Before we buy into this token, check if there are any coordinated wallets: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`"

Claude calls the tool, pays $0.05 USDC from your connected wallet, and returns the full analysis.

---

### 2. Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "cabal-hunter": {
      "url": "https://api.cabal-hunter.com/mcp"
    }
  }
}
```

---

### 3. ElizaOS (with automatic x402 payment)

If you're using ElizaOS with `@hugen/plugin-x402-solana`, payment is handled automatically. Add to your agent config:

```json
{
  "plugins": ["@hugen/plugin-x402-solana"],
  "mcpServers": {
    "cabal-hunter": {
      "url": "https://api.cabal-hunter.com/mcp"
    }
  }
}
```

Your agent will call `check_cabal_risk(mintAddress)` before any swap and abort if `cabalScore >= 35` or `isControlled === true`.

---

### 4. Direct REST API

For headless scripts, custom bots, or any language:

**Step 1 — Request analysis (get payment instructions):**
```bash
curl -X POST https://api.cabal-hunter.com/api/scan-cabal \
  -H "Content-Type: application/json" \
  -d '{"mintAddress": "YOUR_MINT_ADDRESS"}'
```

Response (HTTP 402):
```json
{
  "error": "payment_required",
  "payment": {
    "recipient": "ATYjZ1kWoHWhj74umGJ8wFqUeW1yeSGBbLi1UQpahPxt",
    "amount_usdc": 0.05,
    "memo_required": "ch-xxxx-xxxx-xxxx",
    "instructions": "Send 0.05 USDC with this memo, then resubmit with X-Payment-Signature header"
  }
}
```

**Step 2 — Pay & resubmit:**
```bash
curl -X POST https://api.cabal-hunter.com/api/scan-cabal \
  -H "Content-Type: application/json" \
  -H "X-Payment-Signature: YOUR_TX_SIGNATURE" \
  -d '{"mintAddress": "YOUR_MINT_ADDRESS"}'
```

**Response (HTTP 200):**
```json
{
  "mint": "YOUR_MINT",
  "token_name": "EXAMPLE",
  "risk": "HIGH",
  "cabal_score": 72.4,
  "is_controlled": true,
  "time_sync": true,
  "verdict": "AVOID — 4 wallets bought in the EXACT same block (bundled launch), controlling 34.1% of supply. DEPLOYER ALERT: this creator has launched 14 tokens, 13 of 13 checked are dead (100%).",
  "coordinated_clusters": [
    {
      "type": "funding",
      "master_full": "FvbEKF...9RUg",
      "master_short": "FvbEKF…9RUg",
      "wallet_count": 4,
      "combined_pct": 34.1,
      "risk": "HIGH",
      "evidence_txs": ["4Y8auc5G...", "2XQx9LFv...", "AAbJ7rej..."]
    }
  ],
  "filtered_clusters": [
    {
      "funder_label": "high-volume wallet",
      "master_short": "43ViqZ…Z6iy",
      "wallet_count": 2,
      "combined_pct": 4.4
    }
  ],
  "deployer": {
    "creator": "5TbRN6...full address...",
    "creator_short": "5TbRN6…2TGC",
    "tokens_launched": 14,
    "dead": 13,
    "sampled": 13,
    "dead_pct": 100.0,
    "verdict": "SERIAL_RUGGER"
  },
  "holders": [
    { "rank": 1, "address": "...", "pct": 12.4, "cluster_id": 0, "funding_tx": "4Y8auc5G..." }
  ],
  "wallets_checked": 12,
  "analysis_time_ms": 487,
  "source": "real_time"
}
```

---

## Integrate into Your Trading Logic

```python
import requests

def is_safe_to_buy(mint_address: str, payment_sig: str) -> bool:
    """Returns True if token passes cabal check."""
    resp = requests.post(
        "https://api.cabal-hunter.com/api/scan-cabal",
        json={"mintAddress": mint_address},
        headers={"X-Payment-Signature": payment_sig}
    )
    if resp.status_code != 200:
        return False  # fail-safe: don't buy on error
    data = resp.json()
    # Block on: coordinated control, high score, bundled launch,
    # or a deployer with a history of dead tokens
    deployer_verdict = (data.get("deployer") or {}).get("verdict", "UNKNOWN")
    return (
        not data.get("is_controlled")
        and data.get("cabal_score", 100) < 35
        and not data.get("time_sync")
        and deployer_verdict not in ("SERIAL_RUGGER", "POOR_TRACK_RECORD")
    )

# In your bot's buy logic:
if is_safe_to_buy(token_mint, my_payment_sig):
    execute_swap(token_mint, sol_amount)
else:
    print(f"Cabal detected — skipping {token_mint}")
```

---

## Visual Bubble Map (Free)

See exactly what the analysis found — coloured clusters, funding connections, holder distribution:

```
https://api.cabal-hunter.com/map?mint=ANY_SOLANA_MINT
```

Free to view. Share this URL when you catch a rug. Every holder bubble is clickable and links to Solscan for deep-dive research.

---

## Pricing

| Queries | Cost |
|---------|------|
| First 100 / month | **Free** (per IP, no signup) |
| Per query | $0.05 USDC |
| 100 queries | $5.00 USDC |
| 1,000 queries | $50.00 USDC |
| 10,000 queries | $500.00 USDC |

One avoided rug typically saves 10–100× the cost of a month's queries.

Payment is native on Solana — no credit card, no account, no subscription.

---

## API Reference

| Endpoint | Description | Auth |
|----------|-------------|------|
| `POST /api/scan-cabal` | Full cabal analysis | $0.05 USDC |
| `GET /api/scan-cabal?mintAddress=` | GET version | $0.05 USDC |
| `GET /map?mint=` | Visual bubble map | Free |
| `GET /api/cex-funding?mint=` | Per-exchange funding breakdown (which CEXes funded holders, % each) | Free |
| `GET /api/trade-analysis?mint=` | Cohort PnL (Team/Snipers/Insiders) + wash-trading score + exit-liquidity price impact, one call | Free |
| `POST /api/watch` | Register an emergency dump webhook for a mint (push on dump/rug start) | Free |
| `GET /api/info` | Pricing, endpoints | Free |

### Emergency dump webhook (auto-exit)

Instead of polling, let your bot subscribe to a token it holds — we push the moment a coordinated dump or liquidity drain starts:

```bash
curl -X POST https://api.cabal-hunter.com/api/watch \
  -H "Content-Type: application/json" \
  -d '{"mint":"YOUR_MINT","webhook_url":"https://your-bot.com/dump-alert"}'
```

Your endpoint receives:
```json
{ "event":"dump_detected", "mint":"...", "reason":"price −34% since last check",
  "coordinated": true, "price_usd": 0.0001, "liquidity_usd": 4200,
  "action":"consider_immediate_exit", "ts": 1781370000 }
```
| `GET /health` | Uptime check | Free |
| `POST /mcp` | MCP tool endpoint | $0.05 USDC per call |

---

## Infrastructure

- **RPC**: Dedicated Helius node (Frankfurt) — fastest Solana data available
- **Hosting**: AWS EC2 Frankfurt — low latency for EU/global
- **Analysis**: Real on-chain data — no scrapers, no caches of cached caches
- **Uptime**: 99.9% target — monitored, auto-restart via systemd

---

## License

MIT — fork it, build on it, integrate it. If you build something with this, share it.

---

*Built by [PF Capital](https://api.cabal-hunter.com) · Powered by Helius · Contact: api.cabal-hunter.com/api/info*
