"""
Example: Integrate Cabal-Hunter into a Solana trading bot.
Checks for coordinated wallet clusters before executing any swap.
Cost: $0.05 USDC per check. Pays for itself the first time it blocks a rug.
"""

import requests

CABAL_HUNTER_URL = "https://api.cabal-hunter.com/api/scan-cabal"
MAX_CABAL_SCORE  = 35    # block if score >= 35 (controlled token)


def get_payment_instructions(mint: str) -> dict:
    """Step 1: Get payment instructions from the API."""
    resp = requests.post(CABAL_HUNTER_URL, json={"mintAddress": mint})
    if resp.status_code == 402:
        return resp.json()["payment"]
    raise ValueError(f"Unexpected response: {resp.status_code}")


def check_cabal(mint: str, payment_tx_sig: str) -> dict:
    """Step 2: Submit analysis with payment proof."""
    resp = requests.post(
        CABAL_HUNTER_URL,
        json={"mintAddress": mint},
        headers={"X-Payment-Signature": payment_tx_sig},
    )
    if resp.status_code == 200:
        return resp.json()
    raise ValueError(f"Analysis failed: {resp.status_code} {resp.text}")


def is_safe_to_buy(mint: str, payment_tx_sig: str) -> tuple[bool, str]:
    """
    Returns (safe, reason).
    safe=True means proceed with the trade.
    safe=False means the token has detected cabal risk — skip.
    """
    try:
        result = check_cabal(mint, payment_tx_sig)
        score  = result.get("cabal_score", 0)
        risk   = result.get("risk", "CLEAN")

        if result.get("is_controlled") or score >= MAX_CABAL_SCORE:
            clusters = result.get("coordinated_clusters", [])
            c = clusters[0] if clusters else {}
            reason = (
                f"CABAL DETECTED — Score {score}/100 — "
                f"{c.get('wallet_count','?')} coordinated wallets holding "
                f"{c.get('combined_pct','?')}% of supply"
            )
            return False, reason

        return True, f"CLEAN — Score {score}/100 — {result.get('wallets_checked','?')} wallets traced"

    except Exception as e:
        # Fail safe: skip trade on any error
        return False, f"Cabal check failed ({e}) — skipping trade as precaution"


# ── Example usage ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    token_mint = "PASTE_TOKEN_MINT_HERE"

    # Step 1: Get payment instructions
    print(f"Checking {token_mint[:8]}…")
    payment = get_payment_instructions(token_mint)
    print(f"  → Send {payment['amount_usdc']} USDC to {payment['recipient']}")
    print(f"  → Memo: {payment['memo_required']}")

    # Step 2: You send the USDC (via your wallet SDK), get the tx sig
    payment_sig = input("Paste your transaction signature: ").strip()

    # Step 3: Check result
    safe, reason = is_safe_to_buy(token_mint, payment_sig)
    print(f"\n{'✅ SAFE' if safe else '🚫 BLOCKED'}: {reason}")

    if safe:
        print("Proceeding with swap…")
        # execute_swap(token_mint, sol_amount)
    else:
        print("Trade cancelled — protecting your capital.")
