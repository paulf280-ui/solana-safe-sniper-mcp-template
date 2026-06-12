"""
Cabal-Hunter API demo — Python
Checks a Solana token for coordinated wallet clusters before buying.

First 100 queries/month are FREE — no payment required.
After that: $0.05 USDC per query via X-Payment-Signature header.

Run:  python demo/python_demo.py
"""

import requests
import json

API = "https://api.cabal-hunter.com/api/scan-cabal"

# Demo token — known cabal detected
DEMO_MINT = "Axpzs7FEMYzpcfqVcDjDMQb2rsgMYVJADNpUZe7bpump"


def check_token(mint: str) -> dict:
    """
    Query Cabal-Hunter for a token.
    Free for first 100 queries/month. After that, pass X-Payment-Signature.
    """
    resp = requests.post(API, json={"mintAddress": mint}, timeout=30)

    if resp.status_code == 200:
        return resp.json()

    if resp.status_code == 402:
        data = resp.json()
        print("\n💳 Free quota exhausted. Payment required:")
        print(f"   Send {data['payment']['amount_usdc']} USDC to {data['payment']['recipient']}")
        print(f"   Memo: {data['payment']['memo_required']}")
        print(f"   Then re-submit with: X-Payment-Signature: <your_tx_sig>")
        return {}

    raise RuntimeError(f"Unexpected {resp.status_code}: {resp.text}")


def is_safe(report: dict) -> bool:
    """Returns True if the token passes the cabal check."""
    if not report:
        return False  # fail-safe: treat no-response as unsafe
    return not report.get("is_controlled") and report.get("cabal_score", 100) < 35


if __name__ == "__main__":
    print(f"Checking {DEMO_MINT[:8]}…\n")

    report = check_token(DEMO_MINT)
    if not report:
        exit(1)

    free_left = report.get("free_queries_remaining")
    if free_left is not None:
        print(f"✅ Free tier — {free_left} free queries remaining this month\n")

    print(f"Token:       {report.get('token_name', '?')}")
    print(f"Risk:        {report.get('risk')}")
    print(f"Cabal Score: {report.get('cabal_score')}/100")
    print(f"Verdict:     {report.get('verdict')}")
    print(f"Analysis:    {report.get('analysis_time_ms')}ms  ({report.get('source')})")

    clusters = report.get("coordinated_clusters", [])
    if clusters:
        print(f"\n⚠️  {len(clusters)} cluster(s) detected:")
        for c in clusters:
            print(f"   {c['wallet_count']} wallets from {c['master_short']} — {c['combined_pct']}% supply [{c['risk']}]")

    print(f"\n{'🚫 SKIP — cabal detected' if not is_safe(report) else '✅ SAFE — no cabal detected'}")
    print(f"\nVisual map: https://api.cabal-hunter.com/map?mint={DEMO_MINT}")
