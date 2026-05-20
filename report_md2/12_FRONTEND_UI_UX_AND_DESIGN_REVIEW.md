# Frontend UI UX And Design Review

Date: 2026-05-20

Scope: DESIGN.md compliance, Raycast dark UI, app shell, dashboard, wallets, transactions, token/pair/router/settings flows, dangerous action confirmations, runtime/vault/emergency visibility, states, responsiveness, and UI tests.

Verdict/status: PARTIAL. UI is materially implemented and aligned with the Raycast-style dark design, but some controls are placeholders and E2E was not run in this audit.

## DESIGN.md Compliance

- IMPLEMENTED: `apps/web/app/globals.css` uses dark canvas `#07080a`, Inter, and `ss03` font feature settings.
- IMPLEMENTED: Tailwind/UI components use canvas/surface/hairline/ink/body/muted/accent colors.
- IMPLEMENTED: Cards use hairline borders and surface ladder rather than heavy shadows.
- PARTIAL: `globals.css` imports Google Fonts directly, which may be undesirable for local/private deployments.

## Raycast Dark-Canvas UI Status

- IMPLEMENTED: App shell, cards, keycaps, status badges, command-palette-like rows, and accent stripe align with the design direction.
- IMPLEMENTED: Danger states use red accent, warning states use yellow, success states use green.
- PARTIAL: Some pages are functional management screens rather than highly polished product surfaces.

## App Shell, Sidebar, Topbar

- IMPLEMENTED: `AppShell` protects authenticated app pages and shows runtime badges.
- IMPLEMENTED: Topbar shows demo, dry-run/live, vault, emergency pause, Base chain, block, RPC, username, logout.
- IMPLEMENTED: Emergency pause and live-mode warning banners are visible.
- IMPLEMENTED: Mobile drawer component exists.

## Dashboard

- IMPLEMENTED: Dashboard summary, metrics, queue health, system safety panel, recent activity, and scheduler controls exist.
- PARTIAL: Live execution status label can read "READY" when dry-run is disabled, but actual readiness also depends on vault, verified tokens/routers, quote provider, approvals, and operator gates.

## Wallets

- IMPLEMENTED: Wallet import card, wallet table, bulk actions, profiles, encrypted backup export/import, wallet detail, balances, pair rules, schedule, allowances, dry-run, execute-once.
- IMPLEMENTED: Dangerous bulk actions use typed confirmation modals.
- HIGH / OPERATOR_REQUIRED: Private-key import still requires careful operator handling to avoid browser/devtools/screenshot leakage.

## Transactions

- IMPLEMENTED: Transaction list filters and detail pages exist.
- IMPLEMENTED: Demo Basescan links show `DEMO` badge.
- IMPLEMENTED: Manual refresh button exists for transaction confirmation.
- PARTIAL: Stuck/dropped/replacement operator workflow is mostly status/detail/runbook based, not a guided wizard.

## Tokens, Pairs, Routers

- IMPLEMENTED: Tokens page and management component exist.
- IMPLEMENTED: Pairs page and management component exist.
- IMPLEMENTED: Router management is placed under security settings.
- PARTIAL: UI can update/enable configs, but operator verification evidence capture is still minimal.

## Settings, Security, Telegram

- IMPLEMENTED: Security page shows runtime mode, security posture, global emergency pause, vault controls, router management.
- IMPLEMENTED: Telegram settings page warns that Telegram is third-party infrastructure and never returns bot token.
- IMPLEMENTED: Vault controls lock/unlock with operator password/passphrase fields.

## Login

- IMPLEMENTED: Login page is dark canvas and uses operator username/password.
- PARTIAL: No MFA, SSO, passkey, or hardware-backed operator auth.

## Dangerous Action Confirmations

- IMPLEMENTED: Confirmation modal is used for emergency pause, bulk wallet actions, backup import/export, and live-impacting flows.
- PARTIAL: API-level confirmation phrases are not universally enforced for management enablement routes.

## Runtime, Vault, Emergency Visibility

- IMPLEMENTED: Header/topbar and security page show demo/dry-run/live/vault/emergency state.
- IMPLEMENTED: Execute-once UI explains dry-run blocking.
- PARTIAL: UI can be more explicit that "live execution enabled" does not mean "ready for live funds."

## Error, Empty, Loading States

- IMPLEMENTED: `ErrorState`, loading card, and empty states exist.
- PARTIAL: Some server component pages fall back to empty arrays for secondary API failures.
- PARTIAL: Retry actions are present in some views but not consistently all views.

## Mobile/Responsive

- IMPLEMENTED: Mobile drawer and responsive grids exist.
- NOT_TESTED: Mobile viewport E2E was not run in this audit.

## UI Tests/E2E

- IMPLEMENTED: Playwright tests cover login dark canvas, app shell badges, dashboard, wallets, wallet detail, transactions, settings security/Telegram, execute-once blocking, typed confirmations.
- NOT_TESTED: `pnpm e2e` was not run due write-boundary constraints.
- PARTIAL: CI currently makes E2E non-gating.

## Remaining UI Debt

- Add explicit operator verification workflow for token/router live readiness.
- Add stuck/dropped transaction recovery wizard with nonce-check checklist.
- Add production-readiness banner when using local-file vault.
- Add aggregate-risk panel with current caps and pending exposure.
- Make E2E gating explicit in CI.

## Acceptance Criteria

- UI clearly separates "dry-run ready", "tiny manual live candidate", and "live automation no-go".
- Every dangerous action has typed UI confirmation and server-side validation.
- E2E tests pass locally and in CI without being masked.
