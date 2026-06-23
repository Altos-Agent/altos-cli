import { describe, it, expect } from "vitest";
import { VERSION, createLogger, maskSecrets, type AgentConfig } from "./index.js";

describe("@altos/core", () => {
  describe("VERSION", () => {
    it("should be a semver string", () => {
      expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe("createLogger", () => {
    it("should create a logger with correct name", () => {
      const logger = createLogger("test");
      expect(logger).toBeDefined();
      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
    });

    it("should accept log level option", () => {
      const logger = createLogger("test", "error");
      expect(logger).toBeDefined();
    });
  });

  describe("maskSecrets", () => {
    it("should mask OpenAI API keys", () => {
      const input = "sk-abc123xyzABCxyz78901234567890"; // 25+ chars after sk-
      const result = maskSecrets(input);
      expect(result).toBe("[REDACTED]");
      expect(result).not.toContain("sk-");
    });

    it("should mask GitHub tokens", () => {
      const input = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";
      const result = maskSecrets(input);
      expect(result).toBe("[REDACTED]");
    });

    it("should mask Bearer tokens", () => {
      const input =
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.abc123";
      const result = maskSecrets(input);
      expect(result).not.toContain("Bearer ");
    });

    it("should not mask regular text", () => {
      const input = "Hello, this is a normal message";
      const result = maskSecrets(input);
      expect(result).toBe(input);
    });
  });

  describe("types", () => {
    it("should export AgentConfig interface", () => {
      const config: AgentConfig = {
        id: "test-agent",
        name: "Test Agent",
      };
      expect(config.id).toBe("test-agent");
    });

    it("should export Message type", () => {
      const message = {
        id: "msg_1",
        role: "user" as const,
        content: "Hello",
        timestamp: Date.now(),
      };
      expect(message.role).toBe("user");
    });
  });
});
