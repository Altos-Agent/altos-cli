# Stuck / Dropped Transaction Runbook

## Symptoms

- Telegram/webhook alert: `wallet_quarantined` or `stuck_tx_detected`
- Wallet shows status `QUARANTINED` in Recovery UI
- Active lock shows old txHash with high age

## Diagnosis

1. Open Recovery UI: `/admin/recovery`
2. Find the affected wallet
3. Check RPC status of submitted transaction:
   - **NOT_FOUND** on RPC → transaction was dropped by the mempool
   - **CONFIRMED but reverted** → transaction executed but failed on-chain
   - **CONFIRMED and success** → transaction succeeded but finality not detected

## Recovery Options

### Option 1: Keep Wallet Paused

If you want to investigate further before acting:
1. Select the wallet
2. Click "Keep Paused"
3. Enter operator ID and notes
4. Investigate off-chain before returning

### Option 2: Force Release Lock (After Investigating)

If the original transaction is definitely dropped/failed and you want to allow the wallet to submit again:

1. Select the wallet
2. Verify the txHash is dropped on Basescan (search the tx hash)
3. Click "Force Release Lock"
4. **IMPORTANT**: Type the full wallet address to confirm
5. Enter operator ID and notes
6. The lock is released but wallet status remains as-is (operator must set back to ACTIVE)

### Option 3: Prepare Cancel Transaction Draft

If the original transaction is stuck in the mempool (not dropped, but not confirming):

1. Click "Prepare Cancel Tx Draft"
2. Review the draft transaction:
   - Same nonce as the stuck transaction
   - `to` = wallet's own address
   - `value` = 0
   - `data` = 0x (empty)
3. **MANUALLY** sign and send this cancel transaction from your wallet
4. After the cancel confirms, the original tx's nonce is consumed
5. You may now force-release the lock and resume the wallet

## Common Scenarios

### Scenario: Transaction Dropped by Memppool

**Symptoms**: RPC returns NOT_FOUND for the tx hash. The transaction never made it into a block.

**Recovery**:
1. Force release the lock (nonce was never actually used on-chain)
2. Set wallet back to ACTIVE
3. Retry the operation

### Scenario: Transaction Stuck Pending

**Symptoms**: Transaction is visible on Basescan but has 0 confirmations for many blocks.

**Recovery**:
1. Prepare cancel tx draft
2. Manually send cancel transaction
3. Wait for cancel to confirm
4. Force release the lock

### Scenario: Transaction Reverted On-Chain

**Symptoms**: Transaction confirmed but status = reverted.

**Recovery**:
1. The nonce was consumed (another tx cannot use the same nonce)
2. Force release the lock
3. Set wallet to ACTIVE if appropriate
4. Investigate why the transaction reverted

## Prevention

- Monitor the `wallet_quarantined` and `stuck_tx_detected` alerts
- Review stuck transactions promptly
- Keep gas settings adequate to avoid产后 tx due to low gas price