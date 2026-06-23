// @altos/memory - Secret redaction tests

import { describe, it, expect } from "vitest";
import { redactSecrets, containsSecrets } from "../redaction.js";

describe("redactSecrets", () => {
  it("should redact OpenAI API keys (sk-...)", () => {
    const input = "My API key is sk-1234567890abcdefghijklmnopqrstuvwxyz";
    const result = redactSecrets(input);
    expect(result).toBe("My API key is [REDACTED]");
    expect(result).not.toContain("sk-1234567890abcdefghijklmnopqrstuvwxyz");
  });

  it("should redact GitHub tokens (ghp_...)", () => {
    const input = "GitHub token: ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    const result = redactSecrets(input);
    expect(result).toBe("GitHub token: [REDACTED]");
    expect(result).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz1234567890");
  });

  it("should redact Bearer tokens", () => {
    const input =
      "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4JgU4xT3c3JvK8Q9X7gT5cF6vJmKJxYZbc";
    const result = redactSecrets(input);
    expect(result).not.toContain("Bearer eyJ");
    expect(result).not.toContain(
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0",
    );
  });

  it("should redact password patterns", () => {
    const input = 'Config: password="mysecretpassword123"';
    const result = redactSecrets(input);
    expect(result).toBe("Config: password=[REDACTED]");
    expect(result).not.toContain("mysecretpassword123");
  });

  it("should redact passwd patterns", () => {
    const input = "passwd: super_secret_123";
    const result = redactSecrets(input);
    expect(result).toBe("passwd: [REDACTED]");
  });

  it("should redact pwd patterns", () => {
    const input = "Enter pwd: mypassword";
    const result = redactSecrets(input);
    expect(result).toBe("Enter pwd: [REDACTED]");
  });

  it("should redact secret= patterns", () => {
    const input = "secret=mysecretvalue";
    const result = redactSecrets(input);
    expect(result).toBe("secret=[REDACTED]");
  });

  it("should redact api_key patterns", () => {
    const input = "api_key: myapikey1234567890";
    const result = redactSecrets(input);
    expect(result).toBe("api_key: [REDACTED]");
    expect(result).not.toContain("myapikey1234567890");
  });

  it("should redact API keys in various formats", () => {
    const input = 'Set key with: apiKey="secret12345678" or API-KEY: another12345678';
    const result = redactSecrets(input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("secret12345678");
    expect(result).not.toContain("another12345678");
  });

  it("should redact database connection strings", () => {
    const input = "mysql://user:password123@localhost:3306/db";
    const result = redactSecrets(input);
    expect(result).toBe("mysql://user:[REDACTED]@localhost:3306/db");
    expect(result).not.toContain("password123");
  });

  it("should redact postgres connection strings", () => {
    const input = "postgres://admin:secretpass@db.example.com:5432/prod";
    const result = redactSecrets(input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("secretpass");
  });

  it("should redact private keys", () => {
    const input =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBALRiMLAHudeSA2aaaa\n-----END RSA PRIVATE KEY-----";
    const result = redactSecrets(input);
    expect(result).toBe(
      "-----BEGIN RSA PRIVATE KEY-----\n[REDACTED]\n-----END RSA PRIVATE KEY-----",
    );
    expect(result).not.toContain("MIIBOgIBAAJBALRiMLAHudeSA2aaaa");
  });

  it("should redact multiple secrets in one string", () => {
    const input = "sk-1234567890abcdefghijklmnop and ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    const result = redactSecrets(input);
    expect(result).toBe("[REDACTED] and [REDACTED]");
  });

  it("should return unchanged text if no secrets found", () => {
    const input = "This is just regular text with no secrets here.";
    const result = redactSecrets(input);
    expect(result).toBe(input);
  });

  it("should handle empty string", () => {
    const result = redactSecrets("");
    expect(result).toBe("");
  });

  it("should handle strings with only secrets", () => {
    const input = "sk-abcdefghijklmnopqrstuvwxyz sk-zyxwvutsrqponmlkjabcdefghijklmnop";
    const result = redactSecrets(input);
    expect(result).toBe("[REDACTED] [REDACTED]");
  });

  it("should redact bearer token with prefix", () => {
    const input = "bearer abc123def456ghi789";
    const result = redactSecrets(input);
    expect(result).toBe("bearer [REDACTED]");
  });
});

describe("containsSecrets", () => {
  it("should return true for OpenAI API keys", () => {
    expect(containsSecrets("sk-1234567890abcdefghijklmnopqrstuvwxyz")).toBe(true);
  });

  it("should return true for GitHub tokens", () => {
    expect(containsSecrets("ghp_abcdefghijklmnopqrstuvwxyz1234567890")).toBe(true);
  });

  it("should return true for passwords in config", () => {
    expect(containsSecrets('password="mysecret"')).toBe(true);
    expect(containsSecrets("passwd: secret123")).toBe(true);
  });

  it("should return true for JWT tokens", () => {
    expect(
      containsSecrets("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjg"),
    ).toBe(true);
  });

  it("should return true for database connection strings", () => {
    expect(containsSecrets("mysql://user:pass@localhost/db")).toBe(true);
    expect(containsSecrets("postgres://admin:secret@db.example.com:5432")).toBe(true);
  });

  it("should return true for bearer tokens", () => {
    expect(containsSecrets("bearer abc123def456")).toBe(true);
  });

  it("should return false for normal text", () => {
    expect(containsSecrets("This is just some regular text about coding.")).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(containsSecrets("")).toBe(false);
  });

  it("should return true for API key in text", () => {
    expect(containsSecrets("My API key is sk-1234567890abcdefghij")).toBe(true);
  });

  it("should return true for private key pattern", () => {
    expect(containsSecrets("-----BEGIN RSA PRIVATE KEY-----")).toBe(true);
  });

  it("should return false for code without secrets", () => {
    expect(containsSecrets("function hello() { return 'world'; }")).toBe(false);
  });
});

describe("redaction edge cases", () => {
  it("should handle unicode content", () => {
    const input = "API key: sk-abcdefghijklmnopqrstuvwxyz 中文 français";
    const result = redactSecrets(input);
    expect(result).toBe("API key: [REDACTED] 中文 français");
  });

  it("should handle multiline content", () => {
    const input =
      "Line 1: sk-1234567890abcdefghijklmnopqrstuvwxyz\nLine 2: normal text\nLine 3: ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    const result = redactSecrets(input);
    expect(result).toBe("Line 1: [REDACTED]\nLine 2: normal text\nLine 3: [REDACTED]");
  });

  it("should handle JSON-like content", () => {
    const input = '{"api_key": "sk-1234567890abcdefghijklmnop", "note": "test"}';
    const result = redactSecrets(input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("sk-1234567890abcdefghijklmnop");
  });
});
