# Tiny Manual Live Test Runbook

## Before You Start

- All 23 readiness gates must pass (state = TINY_MANUAL_LIVE_READY_FOR_OPERATOR_REVIEW)
- Live scheduler is and will remain disabled
- This is a TINY test — operator-reviewed, single trade

## Steps

1. **Import dedicated tiny wallet**
   - Go to Live Readiness Center → Wallet Health section
   - Click "Provision Tiny Wallet"
   - Note the address

2. **Fund with ~0.001 BASE only**
   - Send exactly 0.001 BASE from your own wallet
   - Do NOT fund more — this is a tiny test wallet

3. **Verify token/router/spender on Basescan**
   - Check each address: token contract, router contract, spender
   - Confirm addresses match registry

4. **Run read-only 0x quote**
   - Use the quote interface in dry-run mode
   - Verify quote returns a valid response

5. **Upload artifacts**
   - After completing drill validations, upload artifacts via `POST /api/readiness/artifacts`
   - Include the `expiresAt` field to set an expiration (leave null for no expiration)
   - Artifacts can expire — monitor their `expiresAt` and refresh before expiration to avoid check failures

6. **Execute exact approval**
   - Navigate to the tiny wallet's approval panel
   - Set exact amount (not unlimited)
   - Submit approval transaction

7. **Execute once**
   - With tiny wallet selected and vault unlocked
   - Use the tiny manual live button (enabled only when all gates pass)
   - Confirm with MFA

8. **Wait for finality**
   - Monitor Basescan for the transaction
   - Wait ~15 seconds for Base finality

9. **Revoke approval**
   - Use the revoke flow immediately after finality

10. **Lock vault**

11. **Return to dry-run mode**

12. **Record tx hash + Basescan verification**
    - Save the tx hash
    - Take Basescan screenshot
    - Complete the Tiny Live Operator Checklist artifact