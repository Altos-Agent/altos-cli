import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decryptPrivateKey,
  encryptPrivateKey,
  loadOrCreateMasterKey
} from "./wallet-vault.js";

describe("wallet vault encryption", () => {
  it("creates a 32-byte local master key file with owner-only permissions where supported", async () => {
    const dir = await mkdtemp(join(tmpdir(), "base-orchestrator-vault-"));
    const keyPath = join(dir, "master.key");

    const key = await loadOrCreateMasterKey(keyPath);
    const persisted = await readFile(keyPath);
    const mode = (await stat(keyPath)).mode & 0o777;

    expect(key).toHaveLength(32);
    expect(persisted).toHaveLength(32);
    expect(Buffer.compare(key, persisted)).toBe(0);
    expect(mode & 0o077).toBe(0);
  });

  it("round trips a private key without storing plaintext in the encrypted payload", async () => {
    const masterKey = Buffer.alloc(32, 7);
    const privateKey =
      "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const encrypted = encryptPrivateKey(privateKey, masterKey);

    expect(encrypted).not.toContain(privateKey);
    expect(decryptPrivateKey(encrypted, masterKey)).toBe(privateKey);
  });

  it("rejects tampered ciphertext", async () => {
    const masterKey = Buffer.alloc(32, 9);
    const privateKey =
      "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    const encrypted = encryptPrivateKey(privateKey, masterKey);
    const tampered = `${encrypted.slice(0, -2)}aa`;

    expect(() => decryptPrivateKey(tampered, masterKey)).toThrow(
      "Failed to decrypt wallet private key"
    );
  });
});
