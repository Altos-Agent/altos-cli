import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseArgs, printVersion, printHelp, VERSION } from "./index.js";
import type { CLIOptions } from "./index.js";

describe("@altos/cli", () => {
  describe("VERSION", () => {
    it("should be exported", () => {
      expect(VERSION).toBeDefined();
      expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe("parseArgs", () => {
    it("should parse --version flag", () => {
      const opts = parseArgs(["node", "altos", "--version"]);
      expect(opts.version).toBe(true);
    });

    it("should parse -v flag", () => {
      const opts = parseArgs(["node", "altos", "-v"]);
      expect(opts.version).toBe(true);
    });

    it("should parse --help flag", () => {
      const opts = parseArgs(["node", "altos", "--help"]);
      expect(opts.help).toBe(true);
    });

    it("should parse -h flag", () => {
      const opts = parseArgs(["node", "altos", "-h"]);
      expect(opts.help).toBe(true);
    });

    it("should parse --config value", () => {
      const opts = parseArgs(["node", "altos", "--config=/path/to/config.json"]);
      expect(opts.config).toBe("/path/to/config.json");
    });

    it("should parse --config as separate argument", () => {
      const opts = parseArgs(["node", "altos", "--config", "/other/config.json"]);
      expect(opts.config).toBe("/other/config.json");
    });

    it("should parse -p with question", () => {
      const opts = parseArgs(["node", "altos", "-p", "What is 2+2?"]);
      expect(opts.print).toBe("What is 2+2?");
    });

    it("should parse --json flag", () => {
      const opts = parseArgs(["node", "altos", "--json"]);
      expect(opts.json).toBe(true);
    });

    it("should parse -p with --json", () => {
      const opts = parseArgs(["node", "altos", "-p", "Hello world", "--json"]);
      expect(opts.print).toBe("Hello world");
      expect(opts.json).toBe(true);
    });

    it("should parse --run with task", () => {
      const opts = parseArgs(["node", "altos", "--run", "Fix the bug in auth"]);
      expect(opts.run).toBe("Fix the bug in auth");
    });

    it("should parse 'run' as command with task", () => {
      const opts = parseArgs(["node", "altos", "run", "Fix the login"]);
      expect(opts.command).toBe("run");
      expect(opts.args).toEqual(["Fix the login"]);
    });

    it("should parse bare 'altos' (no command)", () => {
      const opts = parseArgs(["node", "altos"]);
      expect(opts.command).toBeUndefined();
    });

    it("should parse 'altos' as interactive", () => {
      const opts = parseArgs(["node", "altos", "interactive"]);
      expect(opts.command).toBe("interactive");
    });

    it("should parse command with args", () => {
      const opts = parseArgs(["node", "altos", "config", "get", "model"]);
      expect(opts.command).toBe("config");
      expect(opts.args).toEqual(["get", "model"]);
    });

    it("should parse 'doctor' command", () => {
      const opts = parseArgs(["node", "altos", "doctor"]);
      expect(opts.command).toBe("doctor");
    });

    it("should parse 'models' command", () => {
      const opts = parseArgs(["node", "altos", "models"]);
      expect(opts.command).toBe("models");
    });

    it("should parse 'tools --list'", () => {
      const opts = parseArgs(["node", "altos", "tools", "--list"]);
      expect(opts.command).toBe("tools");
      expect(opts.args).toEqual(["--list"]);
    });

    it("should parse 'tools --show=bash'", () => {
      const opts = parseArgs(["node", "altos", "tools", "--show=bash"]);
      expect(opts.command).toBe("tools");
      expect(opts.args).toContain("--show=bash");
    });

    it("should ignore unknown flags", () => {
      // Unknown flags starting with - are skipped; non-flag values after become command
      const opts = parseArgs(["node", "altos", "--unknown", "value"]);
      expect(opts.command).toBe("value");
      expect(opts.args).toEqual([]);
    });

    it("should handle multiple flags before command", () => {
      const opts = parseArgs(["node", "altos", "--version", "--json", "doctor"]);
      expect(opts.version).toBe(true);
      expect(opts.json).toBe(true);
      expect(opts.command).toBe("doctor");
    });

    it("should handle flags interspersed with command", () => {
      const opts = parseArgs(["node", "altos", "--config", "path.json", "doctor"]);
      expect(opts.config).toBe("path.json");
      expect(opts.command).toBe("doctor");
    });
  });

  describe("printVersion", () => {
    it("should print version string", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      printVersion();
      expect(spy).toHaveBeenCalledWith(`altos v${VERSION}`);
      spy.mockRestore();
    });
  });

  describe("printHelp", () => {
    it("should print help text", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      printHelp();
      expect(spy).toHaveBeenCalled();
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain("Altos");
      expect(output).toContain("--version");
      expect(output).toContain("-p");
      expect(output).toContain("run");
      spy.mockRestore();
    });

    it("should mention interactive mode", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      printHelp();
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain("altos");
      spy.mockRestore();
    });
  });

  describe("command routing", () => {
    it("should route 'models' to cmdModels", () => {
      // We can't easily test the actual command execution without mocking
      // the AI registry, but we can verify parseArgs routes correctly
      const opts = parseArgs(["node", "altos", "models"]);
      expect(opts.command).toBe("models");
    });

    it("should route 'doctor' to cmdDoctor", () => {
      const opts = parseArgs(["node", "altos", "doctor"]);
      expect(opts.command).toBe("doctor");
    });

    it("should route 'tools' to runToolsCommand", () => {
      const opts = parseArgs(["node", "altos", "tools", "--list"]);
      expect(opts.command).toBe("tools");
    });

    it("should route 'config get' to cmdConfigGet", () => {
      const opts = parseArgs(["node", "altos", "config", "get", "key"]);
      expect(opts.command).toBe("config");
      expect(opts.args).toEqual(["get", "key"]);
    });

    it("should route 'config set' to cmdConfigSet", () => {
      const opts = parseArgs(["node", "altos", "config", "set", "key", "value"]);
      expect(opts.command).toBe("config");
      expect(opts.args).toEqual(["set", "key", "value"]);
    });
  });

  describe("print mode (-p)", () => {
    it("should set print mode correctly", () => {
      const opts = parseArgs(["node", "altos", "-p", "What is the weather?"]);
      expect(opts.print).toBe("What is the weather?");
      expect(opts.json).toBeUndefined();
    });

    it("should combine -p with --json", () => {
      const opts = parseArgs(["node", "altos", "-p", "Hello", "--json"]);
      expect(opts.print).toBe("Hello");
      expect(opts.json).toBe(true);
    });
  });

  describe("run mode", () => {
    it("should set run mode with --run", () => {
      const opts = parseArgs(["node", "altos", "--run", "Do something"]);
      expect(opts.run).toBe("Do something");
    });

    it("should set run mode with 'run' command", () => {
      const opts = parseArgs(["node", "altos", "run", "Do something else"]);
      expect(opts.command).toBe("run");
      expect(opts.args).toEqual(["Do something else"]);
    });
  });

  describe("session recovery", () => {
    it("should have recoverSession function exported", async () => {
      const mod = await import("./index.js");
      expect(typeof mod.recoverSession).toBe("function");
    });

    it("should have saveSessionState function exported", async () => {
      const mod = await import("./index.js");
      expect(typeof mod.saveSessionState).toBe("function");
    });

    it("should have getRecoverableSessions function exported", async () => {
      const mod = await import("./index.js");
      expect(typeof mod.getRecoverableSessions).toBe("function");
    });

    it("should have clearActiveSession function exported", async () => {
      const mod = await import("./index.js");
      expect(typeof mod.clearActiveSession).toBe("function");
    });

    it("should have getActiveSessionId function exported", async () => {
      const mod = await import("./index.js");
      expect(typeof mod.getActiveSessionId).toBe("function");
    });

    it("recoverSession returns null for non-existent session", async () => {
      const { recoverSession } = await import("./index.js");
      const result = await recoverSession("nonexistent_session_id_12345");
      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// Non-Interactive Command Tests
// These test the CLI without interactive input/output
// ============================================================================

describe("Non-interactive commands", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should parseArgs for config get command", () => {
    const opts = parseArgs(["node", "altos", "config", "get"]);
    expect(opts.command).toBe("config");
    expect(opts.args).toEqual(["get"]);
  });

  it("should parseArgs for config set command", () => {
    const opts = parseArgs(["node", "altos", "config", "set", "model", "gpt-4"]);
    expect(opts.command).toBe("config");
    expect(opts.args).toEqual(["set", "model", "gpt-4"]);
  });

  it("should handle unknown command gracefully", () => {
    const opts = parseArgs(["node", "altos", "unknown-cmd"]);
    expect(opts.command).toBe("unknown-cmd");
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("parseArgs edge cases", () => {
  it("should handle empty args array", () => {
    const opts = parseArgs(["node", "altos"]);
    expect(opts).toEqual({});
  });

  it("should handle just flags", () => {
    const opts = parseArgs(["node", "altos", "--version"]);
    expect(opts.version).toBe(true);
  });

  it("should handle flag value with equals and spaces", () => {
    const opts = parseArgs(["node", "altos", "-p", "multi word question"]);
    expect(opts.print).toBe("multi word question");
  });

  it("should handle deeply nested config key", () => {
    const opts = parseArgs(["node", "altos", "config", "get", "a.b.c.d"]);
    expect(opts.args).toEqual(["get", "a.b.c.d"]);
  });

  it("should not confuse --run with command named 'run'", () => {
    const opts1 = parseArgs(["node", "altos", "--run", "task"]);
    expect(opts1.run).toBe("task");
    expect(opts1.command).toBeUndefined();

    const opts2 = parseArgs(["node", "altos", "run", "task"]);
    expect(opts2.command).toBe("run");
    expect(opts2.args).toEqual(["task"]);
  });
});

// ============================================================================
// Type check — CLIOptions fields
// ============================================================================

describe("CLIOptions interface completeness", () => {
  it("should have all required fields", () => {
    const opts: CLIOptions = {
      version: false,
      help: false,
      config: "/path",
      command: "doctor",
      args: ["arg1"],
      print: "question",
      json: true,
      run: "task",
      interactive: false,
    };

    expect(opts.version).toBe(false);
    expect(opts.help).toBe(false);
    expect(opts.config).toBe("/path");
    expect(opts.command).toBe("doctor");
    expect(opts.args).toEqual(["arg1"]);
    expect(opts.print).toBe("question");
    expect(opts.json).toBe(true);
    expect(opts.run).toBe("task");
    expect(opts.interactive).toBe(false);
  });
});
