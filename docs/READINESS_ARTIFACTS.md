# Readiness Artifacts

Artifacts represent evidence of completed drills, validations, and operator actions. They are uploaded via the API and stored as JSON files in `.readiness/artifacts/<type>_<timestamp>.json`.

## Artifact Types

| Type | Associated Check | Description |
|------|-----------------|-------------|
| `0x_quote_validation` | Check 15 | 0x quote returned valid response in dry-run mode |
| `backup_restore_drill` | Check 16 | Backup/restore drill completed successfully |
| `emergency_pause_drill` | Check 17 | Emergency pause flow exercised |
| `dry_run_load_test` | Check 18 | System validated under simulated load |
| `telegram_test` | Check 19 | Telegram alert channel verified |
| `tiny_live_operator_checklist` | Checks G9-G11 | Operator completed pre-trade checklist for tiny wallet |

## Artifact Schema

All artifacts conform to this interface:

```typescript
interface Artifact {
  type: ArtifactType;          // Which drill/validation this represents
  passed: boolean;            // Whether the drill/validation succeeded
  evidence: string | null;    // Freeform evidence (tx hash, screenshot ref, etc.)
  notes: string | null;       // Operator notes or caveats
  createdAt: string;           // ISO datetime when artifact was created
  createdBy: string;           // Identifier of who created the artifact
  expiresAt: string | null;    // ISO datetime when artifact expires; null = never expires
  checksum: string | null;     // SHA-256 hex digest of the artifact file content
  filePath: string | null;    // Absolute path to the stored artifact file
}
```

## Field Descriptions

### `type`
One of the 6 valid artifact types. Must match the expected type for the check it satisfies.

### `passed`
`true` if the drill/validation succeeded. `false` if it failed. Artifacts with `passed: false` do not satisfy the associated readiness check.

### `evidence`
Freeform text field for evidence such as transaction hashes, Basescan URLs, or a description of what was observed. May be `null` if no evidence was recorded.

### `notes`
Optional operator notes or caveats. May be `null`.

### `createdAt`
ISO datetime string (e.g., `"2026-05-22T10:30:00.000Z"`). Set automatically by the server on upload.

### `createdBy`
String identifier of who created the artifact (e.g., operator email, `system`, `ci`).

### `expiresAt`
ISO datetime string when this artifact expires and is treated as missing. `null` means the artifact never expires.

**Expiration behavior:** When an artifact expires, its associated check transitions from PASS to FAIL. Always refresh drill artifacts before `expiresAt` to avoid losing readiness status.

### `checksum`
SHA-256 hex digest of the raw JSON file content. `null` if not computed. Used for integrity verification.

### `filePath`
Absolute filesystem path where the artifact JSON file is stored. `null` if not yet written to disk.

## Expiration Rules

| Scenario | Behavior |
|----------|----------|
| `expiresAt: null` | Never expires; valid until superseded |
| `expiresAt` in the future | Still valid; check passes |
| `expiresAt` in the past | Artifact treated as missing; check fails |
| No artifact uploaded | Check fails immediately |

Drill artifacts (backup_restore_drill, emergency_pause_drill) should be refreshed periodically. The `tiny_live_operator_checklist` artifact does not expire by default.

## Upload API

### `POST /api/readiness/artifacts`

Upload a readiness artifact.

**Request body:**

```json
{
  "type": "backup_restore_drill",
  "passed": true,
  "evidence": "tx: 0xabc123... (Backup drill tx on Basescan)",
  "notes": "Drill completed successfully",
  "createdBy": "operator@example.com",
  "expiresAt": "2026-06-22T00:00:00.000Z"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | Must be one of the 6 valid artifact types |
| `passed` | Yes | Whether the drill succeeded |
| `evidence` | No | Evidence string |
| `notes` | No | Operator notes |
| `createdBy` | Yes | Creator identifier |
| `expiresAt` | No | ISO datetime; `null` means never expires |

**Response (200 OK):**

```json
{
  "data": {
    "type": "backup_restore_drill",
    "passed": true,
    "evidence": "tx: 0xabc123...",
    "notes": "Drill completed successfully",
    "createdAt": "2026-05-22T10:30:00.000Z",
    "createdBy": "operator@example.com",
    "expiresAt": "2026-06-22T00:00:00.000Z",
    "checksum": "a3f8b...",
    "filePath": "/home/user/base-auto-trader/.readiness/artifacts/backup_restore_drill_1747915800000.json"
  }
}
```

**Error (400):** Invalid artifact type or missing required fields.