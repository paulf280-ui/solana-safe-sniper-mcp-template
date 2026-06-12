/**
 * Cabal-Hunter API demo — TypeScript/Node.js
 * Checks a Solana token for coordinated wallet clusters before buying.
 *
 * First 100 queries/month are FREE — no payment required.
 * After that: $0.05 USDC per query via X-Payment-Signature header.
 *
 * Run:  npx tsx demo/typescript_demo.ts
 */

const API = "https://api.cabal-hunter.com/api/scan-cabal"

// Demo token — known cabal detected
const DEMO_MINT = "Axpzs7FEMYzpcfqVcDjDMQb2rsgMYVJADNpUZe7bpump"

interface CabalReport {
  token_name: string
  risk: "HIGH" | "MEDIUM" | "CLEAN"
  cabal_score: number
  is_controlled: boolean
  verdict: string
  coordinated_clusters: Array<{
    master_short: string
    wallet_count: number
    combined_pct: number
    risk: string
  }>
  wallets_checked: number
  analysis_time_ms: number
  source: string
  free_queries_remaining?: number
}

async function checkToken(mint: string, paymentSig?: string): Promise<CabalReport | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (paymentSig) headers["X-Payment-Signature"] = paymentSig

  const resp = await fetch(API, {
    method: "POST",
    headers,
    body: JSON.stringify({ mintAddress: mint }),
  })

  if (resp.status === 200) return resp.json() as Promise<CabalReport>

  if (resp.status === 402) {
    const data = await resp.json() as { payment: { amount_usdc: number; recipient: string; memo_required: string } }
    console.log("\n💳 Free quota exhausted. Payment required:")
    console.log(`   Send ${data.payment.amount_usdc} USDC to ${data.payment.recipient}`)
    console.log(`   Memo: ${data.payment.memo_required}`)
    console.log(`   Then re-submit with: X-Payment-Signature: <your_tx_sig>`)
    return null
  }

  throw new Error(`Unexpected ${resp.status}: ${await resp.text()}`)
}

function isSafe(report: CabalReport): boolean {
  return !report.is_controlled && report.cabal_score < 35
}

async function main() {
  console.log(`Checking ${DEMO_MINT.slice(0, 8)}…\n`)

  const report = await checkToken(DEMO_MINT)
  if (!report) process.exit(1)

  if (report.free_queries_remaining !== undefined) {
    console.log(`✅ Free tier — ${report.free_queries_remaining} free queries remaining this month\n`)
  }

  console.log(`Token:       ${report.token_name}`)
  console.log(`Risk:        ${report.risk}`)
  console.log(`Cabal Score: ${report.cabal_score}/100`)
  console.log(`Verdict:     ${report.verdict}`)
  console.log(`Analysis:    ${report.analysis_time_ms}ms  (${report.source})`)

  if (report.coordinated_clusters.length > 0) {
    console.log(`\n⚠️  ${report.coordinated_clusters.length} cluster(s) detected:`)
    for (const c of report.coordinated_clusters) {
      console.log(`   ${c.wallet_count} wallets from ${c.master_short} — ${c.combined_pct}% supply [${c.risk}]`)
    }
  }

  console.log(`\n${isSafe(report) ? "✅ SAFE — no cabal detected" : "🚫 SKIP — cabal detected"}`)
  console.log(`\nVisual map: https://api.cabal-hunter.com/map?mint=${DEMO_MINT}`)
}

main().catch(console.error)
