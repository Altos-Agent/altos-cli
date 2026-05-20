# UI Redesign Plan — Raycast-style Dark Mode Modernization

## Status: COMPLETE

## Changed UI Files

### Foundation
- `apps/web/tailwind.config.ts` — Full Raycast token palette: canvas, surface ladder (#07080a → #0d0d0d → #101111 → #121212), hairline (#242728), ink/body/muted/ash, accent colors, rounded scale (xs/sm/md/lg/xl), Inter font with ss03
- `apps/web/app/globals.css` — Body background #07080a, Inter font with `font-feature-settings: "calt", "kern", "liga", "ss03"`, dark-only mode

### UI Component Library
- `apps/web/components/ui.tsx` — Card (hairline border + surface bg, no shadow), PageHeader (ink/body tokens), StatusBadge (accent-red/green/yellow semantic palette), EmptyState, ErrorState, PrimaryButton (white pill #ffffff bg), SecondaryButton (surface-elevated + hairline border)

### App Shell
- `apps/web/components/app-shell.tsx` — bg-canvas, border-hairline header, ink/body/muted text, emergency/live-mode warning banners preserved

### Components Updated (all tokens replaced: slate → ink/body/muted/hairline, blue-500 → primary white, rose/amber/emerald → accent-*)
- `apps/web/components/allowances-panel.tsx`
- `apps/web/components/action-toggle.tsx`
- `apps/web/components/confirmation-modal.tsx`
- `apps/web/components/copy-button.tsx`
- `apps/web/components/demo-basescan-badge.tsx`
- `apps/web/components/dry-run-trade-card.tsx`
- `apps/web/components/emergency-pause-button.tsx`
- `apps/web/components/error-card.tsx`
- `apps/web/components/execute-once-card.tsx`
- `apps/web/components/global-emergency-pause-button.tsx`
- `apps/web/components/loading-card.tsx`
- `apps/web/components/logout-button.tsx`
- `apps/web/components/pairs-management.tsx`
- `apps/web/components/refresh-transaction-button.tsx`
- `apps/web/components/router-management.tsx`
- `apps/web/components/scheduler-controls.tsx`
- `apps/web/components/sidebar-nav.tsx`
- `apps/web/components/telegram-settings-form.tsx`
- `apps/web/components/toggle-row.tsx`
- `apps/web/components/tokens-management.tsx`
- `apps/web/components/transactions-table.tsx`
- `apps/web/components/vault-controls.tsx`
- `apps/web/components/wallet-import-card.tsx`
- `apps/web/components/wallet-pair-rules.tsx`
- `apps/web/components/wallet-schedule-settings.tsx`
- `apps/web/components/wallet-status-actions.tsx`
- `apps/web/components/wallets-table.tsx`

### Pages
- `apps/web/app/(app)/dashboard/page.tsx` — Design token alignment

## Files NOT Modified
- `apps/web/lib/api.ts` — API client untouched
- `apps/web/lib/types.ts` — Types untouched
- `apps/web/lib/nav.ts` — Nav untouched
- `apps/web/lib/format.ts` — Formatting untouched
- `apps/api/` — All backend files untouched
- All database schema, migrations, blockchain, scheduler, vault, transaction, auth, Telegram backend logic — untouched

## Design Tokens Applied
| Token | Value | Usage |
|---|---|---|
| canvas | #07080a | Page background |
| surface | #0d0d0d | Card background |
| surface-elevated | #101111 | Inputs, elevated panels |
| surface-card | #121212 | Keycap, command-palette hover |
| hairline | #242728 | 1px card borders |
| ink | #f4f4f6 | Headlines |
| body | #cdcdcd | Default text |
| muted | #9c9c9d | Secondary text |
| primary | #ffffff | White CTA pill |
| accent-red | #ff6161 | Error/danger |
| accent-green | #59d499 | Success |
| accent-yellow | #ffc533 | Warning |
| accent-blue | #57c1ff | Info |

## Validation
- [x] `pnpm --filter web typecheck` — 0 errors
- [x] `pnpm --filter web lint` — 0 errors
- [x] `pnpm --filter web build` — succeeds

## Constraints Honored
- No shadows anywhere (elevation via surface ladder only)
- No light mode introduced
- Emergency/live/demo/vault status banners preserved and visible
- No backend logic, API contracts, or runtime behavior changed
- White CTA pill (#ffffff) only on primary actions
- Inter + ss03 font feature enabled globally