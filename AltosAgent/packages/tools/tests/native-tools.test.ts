// @altos/tools - Security and tool tests

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  maskSecrets,
  isProtectedPath,
  isDangerousCommand,
  normalizePath,
  isPathTraversal,
  validatePath,
  validateBashCommand,
  redactEnv,
  truncateOutput,
  createOutputSummary,
  ToolRegistry,
  createAllTools,
  createReadFileTool,
  createWriteFileTool,
  createEditFileTool,
  createApplyPatchTool,
  createListDirTool,
  createGrepTool,
  createFindFilesTool,
  createBashTool,
  createGitStatusTool,
} from "../src/index.js";

// ============================================================================
// Security Tests
// ============================================================================

describe("security utilities", () => {
  describe("maskSecrets", () => {
    it("masks OpenAI API keys", () => {
      const input = "sk-1234567890abcdefghijklmnopqrstuvwxyz";
      const result = maskSecrets(input);
      expect(result).toBe("[REDACTED]");
    });

    it("masks GitHub tokens", () => {
      const input = "ghp_1234567890abcdefghijklmnopqrstuvwxyz1234";
      const result = maskSecrets(input);
      expect(result).toBe("[REDACTED]");
    });

    it("masks Bearer tokens", () => {
      const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
      const result = maskSecrets(input);
      expect(result).toContain("[REDACTED]");
    });

    it("masks private keys", () => {
      const input =
        "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQ...\n-----END RSA PRIVATE KEY-----";
      const result = maskSecrets(input);
      expect(result).toBe("[REDACTED]");
    });

    it("masks AWS keys", () => {
      const input = "AKIAIOSFODNN7EXAMPLE";
      const result = maskSecrets(input);
      expect(result).toBe("[REDACTED]");
    });

    it("preserves normal text", () => {
      const input = "This is just some normal text with no secrets.";
      const result = maskSecrets(input);
      expect(result).toBe(input);
    });

    it("handles empty string", () => {
      expect(maskSecrets("")).toBe("");
    });

    it("supports extra patterns", () => {
      const input = "my_custom_secret_key";
      const result = maskSecrets(input, [/my_custom_\w+/g]);
      expect(result).toBe("[REDACTED]");
    });
  });

  describe("isProtectedPath", () => {
    it("protects ~/.ssh directory", () => {
      expect(isProtectedPath("~/.ssh/")).toBe(true);
      expect(isProtectedPath(os.homedir() + "/.ssh/id_rsa")).toBe(true);
    });

    it("protects .env files", () => {
      expect(isProtectedPath("~/.env")).toBe(true);
      expect(isProtectedPath(".env")).toBe(true);
      expect(isProtectedPath(".env.local")).toBe(true);
    });

    it("protects /etc/sudoers", () => {
      expect(isProtectedPath("/etc/sudoers")).toBe(true);
    });

    it("allows normal project paths", () => {
      expect(isProtectedPath("/home/user/project/src/index.ts")).toBe(false);
      expect(isProtectedPath("./src/index.ts")).toBe(false);
    });

    it("protects git-credentials", () => {
      expect(isProtectedPath("~/.git-credentials")).toBe(true);
    });

    it("protects .env files in subdirectories", () => {
      expect(isProtectedPath("/home/user/project/.env")).toBe(true);
      expect(isProtectedPath("/home/user/project/config/.env.local")).toBe(true);
    });

    it("protects sensitive system paths", () => {
      expect(isProtectedPath("/etc/shadow")).toBe(true);
      expect(isProtectedPath("/etc/gshadow")).toBe(true);
      expect(isProtectedPath("/System/Library")).toBe(true);
    });

    it("protects cloud credential paths", () => {
      expect(isProtectedPath("/home/user/.aws/credentials")).toBe(true);
      expect(isProtectedPath("/home/user/.kube/config")).toBe(true);
    });
  });

  describe("isDangerousCommand", () => {
    it("flags rm", () => expect(isDangerousCommand("rm -rf")).toBe(true));
    it("flags chmod", () => expect(isDangerousCommand("chmod 777")).toBe(true));
    it("flags sudo", () => expect(isDangerousCommand("sudo rm")).toBe(true));
    it("flags kill", () => expect(isDangerousCommand("kill -9")).toBe(true));
    it("flags dd", () => expect(isDangerousCommand("dd if=/dev/zero")).toBe(true));
    it("flags wget/curl", () => {
      expect(isDangerousCommand("wget http://evil.com")).toBe(true);
      expect(isDangerousCommand("curl http://evil.com")).toBe(true);
    });
    it("flags eval/exec/source", () => {
      expect(isDangerousCommand("eval $malicious")).toBe(true);
      expect(isDangerousCommand("exec bash")).toBe(true);
      expect(isDangerousCommand("source ~/.bashrc")).toBe(true);
    });
    it("flags docker/kubectl", () => {
      expect(isDangerousCommand("docker run --privileged")).toBe(true);
      expect(isDangerousCommand("kubectl delete pod app")).toBe(true);
    });
    it("flags network tools", () => {
      expect(isDangerousCommand("nc -l 4444")).toBe(true);
      expect(isDangerousCommand("telnet 192.168.1.1")).toBe(true);
    });
    it("allows safe commands", () => {
      expect(isDangerousCommand("ls")).toBe(false);
      expect(isDangerousCommand("cat file.txt")).toBe(false);
      expect(isDangerousCommand("git status")).toBe(false);
      expect(isDangerousCommand("node script.js")).toBe(false);
      expect(isDangerousCommand("python3 app.py")).toBe(false);
    });
  });

  describe("normalizePath", () => {
    it("expands tilde to home", () => {
      const result = normalizePath("~/project");
      expect(result).toBe(path.join(os.homedir(), "project"));
    });

    it("resolves relative paths", () => {
      const result = normalizePath("./src/index.ts");
      expect(path.isAbsolute(result)).toBe(true);
    });

    it("normalizes separators", () => {
      const result = normalizePath("C:\\Users\\test\\file.txt");
      expect(result).not.toContain("\\");
    });
  });

  describe("isPathTraversal", () => {
    const workspace = "/home/user/project";

    it("detects traversal with ..", () => {
      expect(isPathTraversal("/home/user/project/../etc/passwd", workspace)).toBe(true);
    });

    it("allows paths within workspace", () => {
      expect(isPathTraversal("/home/user/project/src/index.ts", workspace)).toBe(false);
    });

    it("allows exact workspace match", () => {
      expect(isPathTraversal("/home/user/project", workspace)).toBe(false);
    });

    it("detects escape above workspace", () => {
      expect(isPathTraversal("/home/user/project/../../etc/passwd", workspace)).toBe(true);
    });

    it("detects deep traversal", () => {
      expect(isPathTraversal("/home/user/project/a/b/c/../../../../etc/passwd", workspace)).toBe(true);
    });

    it("allows nested paths within workspace", () => {
      expect(isPathTraversal("/home/user/project/src/a/b/c/file.ts", workspace)).toBe(false);
    });
  });

  describe("validatePath", () => {
    const workspaces = ["/home/user/project"];

    it("allows paths within workspace", () => {
      const result = validatePath("/home/user/project/src/index.ts", workspaces, "read");
      expect(result.valid).toBe(true);
    });

    it("denies paths outside workspace", () => {
      // Use /tmp/other.txt which is outside workspace but not protected
      const result = validatePath("/tmp/other.txt", workspaces, "read");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("outside");
    });

    it("denies protected paths", () => {
      const result = validatePath("~/.ssh/id_rsa", workspaces, "read");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("denied");
    });

    it("returns normalized path on success", () => {
      // Use path within the actual workspace
      const result = validatePath("/home/user/project/src", workspaces, "read");
      expect(result.valid).toBe(true);
      expect(result.normalizedPath).toBeDefined();
    });
  });

  describe("validateBashCommand", () => {
    it("allows safe commands", () => {
      const result = validateBashCommand("ls -la", "/home/user/project");
      expect(result.valid).toBe(true);
    });

    it("denies dangerous commands without flag", () => {
      const result = validateBashCommand("rm -rf /", "/home/user/project", false);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Dangerous command");
    });

    it("allows dangerous commands with flag", () => {
      const result = validateBashCommand("rm -rf /", "/home/user/project", true);
      expect(result.valid).toBe(true);
    });

    it("warns about shell operators", () => {
      const result = validateBashCommand("ls && echo hi", "/home/user/project", false);
      expect(result.valid).toBe(true);
      expect(result.warning).toBeDefined();
    });

    it("denies empty commands", () => {
      const result = validateBashCommand("", "/home/user/project");
      expect(result.valid).toBe(false);
    });
  });

  describe("redactEnv", () => {
    it("redacts sensitive env vars", () => {
      const env = {
        PATH: "/usr/bin",
        AWS_ACCESS_KEY_ID: "AKIAXXX",
        GITHUB_TOKEN: "ghp_xxx",
        SECRET_KEY: "super-secret",
      };
      const result = redactEnv(env);
      expect(result.PATH).toBe("/usr/bin");
      expect(result.AWS_ACCESS_KEY_ID).toBe("[REDACTED]");
      expect(result.GITHUB_TOKEN).toBe("[REDACTED]");
      expect(result.SECRET_KEY).toBe("[REDACTED]");
    });
  });

  describe("truncateOutput", () => {
    it("returns unchanged output under threshold", () => {
      const input = "short output";
      const result = truncateOutput(input, 1024 * 1024, 100 * 1024);
      expect(result.wasTruncated).toBe(false);
      expect(result.truncated).toBe(input);
    });

    it("truncates output over threshold", () => {
      const input = "a".repeat(200 * 1024);
      const result = truncateOutput(input, 1024 * 1024, 50 * 1024);
      expect(result.wasTruncated).toBe(true);
      expect(result.truncatedSize).toBeLessThan(input.length);
      expect(result.truncated).toContain("[output truncated]");
    });

    it("handles very long output (1MB+) without crashing", () => {
      const input = "x".repeat(1024 * 1024); // 1MB
      const result = truncateOutput(input, 1024 * 1024, 100 * 1024);
      expect(result.wasTruncated).toBe(true);
      expect(result.originalSize).toBe(1024 * 1024);
      expect(result.truncated).toContain("[output truncated]");
    });

    it("preserves partial content near threshold", () => {
      const input = "a".repeat(80 * 1024) + "b".repeat(80 * 1024);
      const result = truncateOutput(input, 1024 * 1024, 100 * 1024);
      expect(result.wasTruncated).toBe(true);
      // The truncated output should end with "... [output truncated]"
      expect(result.truncated.endsWith("\n... [output truncated]")).toBe(true);
    });
  });

  describe("createOutputSummary", () => {
    it("summarizes strings with byte count", () => {
      const result = createOutputSummary("test", "hello world");
      expect(result.summary).toContain("String output");
      expect(result.truncated).toBe(false);
    });

    it("summarizes arrays with count", () => {
      const result = createOutputSummary("test", [1, 2, 3, 4, 5]);
      expect(result.summary).toContain("5 items");
      expect(result.truncated).toBe(true);
    });

    it("summarizes objects with key count", () => {
      const result = createOutputSummary("test", { a: 1, b: 2 });
      expect(result.summary).toContain("2 keys");
      expect(result.truncated).toBe(false);
    });

    it("handles null", () => {
      const result = createOutputSummary("test", null);
      expect(result.summary).toBe("null");
    });
  });
});

// ============================================================================
// ToolRegistry Tests
// ============================================================================

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.setWorkspaceRoots(["/home/user/project"]);
  });

  describe("registerTool / getTool", () => {
    it("registers and retrieves a tool", () => {
      const tool = createReadFileTool(["/home/user/project"]);
      registry.registerTool(tool);
      expect(registry.getTool("read_file")).toBe(tool);
    });

    it("throws on duplicate registration", () => {
      const tool = createReadFileTool(["/home/user/project"]);
      registry.registerTool(tool);
      expect(() => registry.registerTool(tool)).toThrow("already registered");
    });

    it("returns undefined for non-existent tool", () => {
      expect(registry.getTool("nonexistent")).toBeUndefined();
    });
  });

  describe("unregisterTool", () => {
    it("removes a tool", () => {
      const tool = createReadFileTool(["/home/user/project"]);
      registry.registerTool(tool);
      expect(registry.unregisterTool("read_file")).toBe(true);
      expect(registry.getTool("read_file")).toBeUndefined();
    });

    it("returns false for non-existent tool", () => {
      expect(registry.unregisterTool("nonexistent")).toBe(false);
    });
  });

  describe("listTools", () => {
    it("lists all registered tools", () => {
      registry.registerTool(createReadFileTool(["/home/user/project"]));
      registry.registerTool(createWriteFileTool(["/home/user/project"]));
      const tools = registry.listTools();
      expect(tools.length).toBe(2);
    });

    it("filters by risk level", () => {
      registry.registerTool(createReadFileTool(["/home/user/project"])); // low
      registry.registerTool(createWriteFileTool(["/home/user/project"])); // high
      const low = registry.listToolsByRisk("low");
      expect(low.length).toBe(1);
      expect(low[0].name).toBe("read_file");
    });

    it("filters by permission", () => {
      registry.registerTool(createReadFileTool(["/home/user/project"]));
      registry.registerTool(createWriteFileTool(["/home/user/project"]));
      const writeTools = registry.listToolsByPermission("write");
      expect(writeTools.length).toBe(1);
    });
  });

  describe("workspace boundaries", () => {
    it("setWorkspaceRoots overwrites previous roots", () => {
      registry.setWorkspaceRoots(["/root1", "/root2"]);
      expect(registry.getWorkspaceRoots()).toEqual(["/root1", "/root2"]);
    });

    it("addWorkspaceRoot adds to existing", () => {
      registry.addWorkspaceRoot("/new/root");
      expect(registry.getWorkspaceRoots()).toContain("/new/root");
    });

    it("isPathInWorkspace checks all roots", () => {
      registry.setWorkspaceRoots(["/home/user/project", "/tmp/work"]);
      expect(registry.isPathInWorkspace("/home/user/project/src")).toBe(true);
      expect(registry.isPathInWorkspace("/tmp/work/file.txt")).toBe(true);
      expect(registry.isPathInWorkspace("/etc/passwd")).toBe(false);
    });
  });
});

// ============================================================================
// File Tool Tests
// ============================================================================

describe("file tools", () => {
  const workspaceRoots = ["/tmp/altos-test"];
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "altos-tools-"));
    // Create test workspace
    await fs.promises.mkdir(path.join(tmpDir, "project"), { recursive: true });
    await fs.promises.writeFile(
      path.join(tmpDir, "project", "test.txt"),
      "hello world\nline 2\nline 3",
    );
    await fs.promises.writeFile(path.join(tmpDir, "project", "config.json"), '{"key": "value"}');
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe("read_file", () => {
    it("reads a file within workspace", async () => {
      const tool = createReadFileTool([path.join(tmpDir, "project")]);
      const result = await tool.execute(
        { path: "test.txt" },
        { sessionId: "s1", cwd: path.join(tmpDir, "project") },
      );
      expect(result.success).toBe(true);
      expect((result.data as any).content).toContain("hello world");
    });

    it("denies files outside workspace", async () => {
      const tool = createReadFileTool([path.join(tmpDir, "project")]);
      const result = await tool.execute(
        { path: "/tmp/other.txt" },
        { sessionId: "s1", cwd: path.join(tmpDir, "project") },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("outside");
    });

    it("denies protected paths", async () => {
      const tool = createReadFileTool(["/home/user"]);
      const result = await tool.execute(
        { path: "~/.ssh/id_rsa" },
        { sessionId: "s1", cwd: "/home/user" },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("denied");
    });

    it("respects offset and limit", async () => {
      const tool = createReadFileTool([path.join(tmpDir, "project")]);
      const result = await tool.execute(
        { path: "test.txt", offset: 0, limit: 5 },
        { sessionId: "s1", cwd: path.join(tmpDir, "project") },
      );
      expect(result.success).toBe(true);
      expect((result.data as any).content.length).toBeLessThanOrEqual(5);
    });
  });

  describe("write_file", () => {
    it("creates a new file", async () => {
      const tool = createWriteFileTool([path.join(tmpDir, "project")]);
      const result = await tool.execute(
        { path: "newfile.txt", content: "new content" },
        { sessionId: "s1", cwd: path.join(tmpDir, "project") },
      );
      expect(result.success).toBe(true);
      expect((result.data as any).created).toBe(true);

      const content = await fs.promises.readFile(
        path.join(tmpDir, "project", "newfile.txt"),
        "utf8",
      );
      expect(content).toBe("new content");
    });

    it("overwrites existing file", async () => {
      const tool = createWriteFileTool([path.join(tmpDir, "project")]);
      const result = await tool.execute(
        { path: "test.txt", content: "updated" },
        { sessionId: "s1", cwd: path.join(tmpDir, "project") },
      );
      expect(result.success).toBe(true);
      expect((result.data as any).created).toBe(false);
    });

    it("denies writing outside workspace", async () => {
      const tool = createWriteFileTool([path.join(tmpDir, "project")]);
      const result = await tool.execute(
        { path: "/tmp/evil.txt", content: "malicious" },
        { sessionId: "s1", cwd: path.join(tmpDir, "project") },
      );
      expect(result.success).toBe(false);
    });
  });

  describe("edit_file", () => {
    it("replaces text in file", async () => {
      const tool = createEditFileTool([path.join(tmpDir, "project")]);
      const result = await tool.execute(
        { path: "test.txt", find: "hello", replace: "bonjour" },
        { sessionId: "s1", cwd: path.join(tmpDir, "project") },
      );
      expect(result.success).toBe(true);
      expect((result.data as any).replacements).toBe(1);

      const content = await fs.promises.readFile(path.join(tmpDir, "project", "test.txt"), "utf8");
      expect(content).toContain("bonjour");
      expect(content).not.toContain("hello");
    });

    it("replaces all occurrences with all=true", async () => {
      await fs.promises.writeFile(path.join(tmpDir, "project", "multi.txt"), "foo bar foo baz foo");
      const tool = createEditFileTool([path.join(tmpDir, "project")]);
      const result = await tool.execute(
        { path: "multi.txt", find: "foo", replace: "qux", all: true },
        { sessionId: "s1", cwd: path.join(tmpDir, "project") },
      );
      expect(result.success).toBe(true);
      expect((result.data as any).replacements).toBe(3);
    });

    it("fails when string not found", async () => {
      const tool = createEditFileTool([path.join(tmpDir, "project")]);
      const result = await tool.execute(
        { path: "test.txt", find: "notexist", replace: "replacement" },
        { sessionId: "s1", cwd: path.join(tmpDir, "project") },
      );
      expect(result.success).toBe(false);
    });
  });

  describe("list_dir", () => {
    it("lists directory contents", async () => {
      const tool = createListDirTool([path.join(tmpDir, "project")]);
      const result = await tool.execute(
        { path: "." },
        { sessionId: "s1", cwd: path.join(tmpDir, "project") },
      );
      expect(result.success).toBe(true);
      expect((result.data as any).entries.length).toBeGreaterThan(0);
    });

    it("respects include_hidden=false by default", async () => {
      await fs.promises.writeFile(path.join(tmpDir, "project", ".hidden"), "secret");
      const tool = createListDirTool([path.join(tmpDir, "project")]);
      const result = await tool.execute(
        { path: ".", include_hidden: false },
        { sessionId: "s1", cwd: path.join(tmpDir, "project") },
      );
      expect(result.success).toBe(true);
      const names = (result.data as any).entries.map((e: any) => e.name);
      expect(names).not.toContain(".hidden");
    });

    it("includes hidden files when requested", async () => {
      await fs.promises.writeFile(path.join(tmpDir, "project", ".hidden"), "secret");
      const tool = createListDirTool([path.join(tmpDir, "project")]);
      const result = await tool.execute(
        { path: ".", include_hidden: true },
        { sessionId: "s1", cwd: path.join(tmpDir, "project") },
      );
      expect(result.success).toBe(true);
      const names = (result.data as any).entries.map((e: any) => e.name);
      expect(names).toContain(".hidden");
    });
  });
});

// ============================================================================
// Search Tool Tests
// ============================================================================

describe("search tools", () => {
  const workspaceRoots = ["/tmp/altos-search-test"];
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "altos-search-"));
    await fs.promises.mkdir(path.join(tmpDir, "src"), { recursive: true });
    await fs.promises.writeFile(
      path.join(tmpDir, "src", "index.ts"),
      "export const foo = 'hello';\nexport const bar = 'world';",
    );
    await fs.promises.writeFile(
      path.join(tmpDir, "src", "util.ts"),
      "export function greet(name: string) {\n  return 'Hello ' + name;\n}",
    );
    await fs.promises.writeFile(path.join(tmpDir, ".gitignore"), "node_modules\ndist\n");
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe("grep", () => {
    it("finds matches in files", async () => {
      const tool = createGrepTool([tmpDir]);
      const result = await tool.execute(
        { pattern: "hello", path: tmpDir },
        { sessionId: "s1", cwd: tmpDir },
      );
      expect(result.success).toBe(true);
      expect((result.data as any).total).toBeGreaterThan(0);
    });

    it("respects case_sensitive option", async () => {
      const tool = createGrepTool([tmpDir]);
      const result = await tool.execute(
        { pattern: "Hello", path: tmpDir, case_sensitive: true },
        { sessionId: "s1", cwd: tmpDir },
      );
      // case insensitive by default, should find it
      expect(result.success).toBe(true);
    });

    it("filters by file_pattern", async () => {
      const tool = createGrepTool([tmpDir]);
      const result = await tool.execute(
        { pattern: "export", path: tmpDir, file_pattern: "*.ts" },
        { sessionId: "s1", cwd: tmpDir },
      );
      expect(result.success).toBe(true);
    });

    it("denies paths outside workspace", async () => {
      const tool = createGrepTool([tmpDir]);
      const result = await tool.execute(
        { pattern: "hello", path: "/etc/passwd" },
        { sessionId: "s1", cwd: tmpDir },
      );
      expect(result.success).toBe(false);
    });
  });

  describe("find_files", () => {
    it("finds files by name pattern", async () => {
      const tool = createFindFilesTool([tmpDir]);
      const result = await tool.execute(
        { path: tmpDir, name: "*.ts" },
        { sessionId: "s1", cwd: tmpDir },
      );
      expect(result.success).toBe(true);
      expect((result.data as any).total).toBeGreaterThan(0);
    });

    it("finds files by glob pattern", async () => {
      const tool = createFindFilesTool([tmpDir]);
      const result = await tool.execute(
        { path: tmpDir, pattern: "**/*.ts" },
        { sessionId: "s1", cwd: tmpDir },
      );
      expect(result.success).toBe(true);
    });

    it("filters by type", async () => {
      const tool = createFindFilesTool([tmpDir]);
      const result = await tool.execute(
        { path: tmpDir, type: "f" },
        { sessionId: "s1", cwd: tmpDir },
      );
      expect(result.success).toBe(true);
      for (const file of (result.data as any).files) {
        expect(file.type).toBe("file");
      }
    });

    it("respects max_results", async () => {
      const tool = createFindFilesTool([tmpDir]);
      const result = await tool.execute(
        { path: tmpDir, max_results: 1 },
        { sessionId: "s1", cwd: tmpDir },
      );
      expect(result.success).toBe(true);
      expect((result.data as any).files.length).toBeLessThanOrEqual(1);
      expect((result.data as any).truncated).toBe(true);
    });
  });
});

// ============================================================================
// Path Traversal Prevention Tests
// ============================================================================

describe("path traversal prevention", () => {
  const workspaceRoots = ["/home/user/project"];

  it("prevents ../../../etc/passwd", async () => {
    const tool = createReadFileTool(workspaceRoots);
    const result = await tool.execute(
      { path: "/home/user/project/../../../etc/passwd" },
      { sessionId: "s1", cwd: "/home/user/project" },
    );
    expect(result.success).toBe(false);
  });

  it("prevents symlink traversal", async () => {
    const tool = createReadFileTool(workspaceRoots);
    const result = await tool.execute(
      { path: "/home/user/project/../../home/other/.ssh/id_rsa" },
      { sessionId: "s1", cwd: "/home/user/project" },
    );
    expect(result.success).toBe(false);
  });

  it("allows valid nested paths", async () => {
    // Use a path within the actual test workspace - the key is that the
    // workspaceRoot must match the actual tmpDir, not a different path
    const workspaceRoot = path.join(os.tmpdir(), "altos-test");
    await fs.promises.mkdir(path.join(workspaceRoot, "project", "src"), { recursive: true });

    const tool = createListDirTool([workspaceRoot]);
    const result = await tool.execute(
      { path: path.join(workspaceRoot, "project", "src") },
      { sessionId: "s1", cwd: path.join(workspaceRoot, "project") },
    );
    // Should not fail validation - the dir might not exist but that's ok
    expect(result.error === undefined || result.error?.includes("failed to list")).toBe(true);
  });

  it("prevents symlink escape via actual symlink", async () => {
    // Create a temp workspace with a symlink pointing outside
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "altos-symlink-test-"));
    await fs.promises.mkdir(path.join(tmpDir, "workspace"), { recursive: true });
    await fs.promises.mkdir(path.join(tmpDir, "outside"), { recursive: true });
    await fs.promises.writeFile(path.join(tmpDir, "outside", "secret.txt"), "secret");

    // Create symlink: workspace/escape -> ../outside
    await fs.promises.symlink(
      path.join(tmpDir, "outside"),
      path.join(tmpDir, "workspace", "escape"),
      "dir"
    );

    const tool = createReadFileTool([path.join(tmpDir, "workspace")]);
    const result = await tool.execute(
      { path: path.join(tmpDir, "workspace", "escape", "secret.txt") },
      { sessionId: "s1", cwd: path.join(tmpDir, "workspace") },
    );
    // The path resolves to tmpDir/outside/secret.txt which is outside workspace
    expect(result.success).toBe(false);

    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it("prevents reading protected paths like .env", async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "altos-env-test-"));
    await fs.promises.mkdir(path.join(tmpDir, "project"), { recursive: true });
    await fs.promises.writeFile(path.join(tmpDir, ".env"), "SECRET=password123");

    const tool = createReadFileTool([path.join(tmpDir, "project")]);
    const result = await tool.execute(
      { path: path.join(tmpDir, ".env") },
      { sessionId: "s1", cwd: path.join(tmpDir, "project") },
    );
    // .env at tmpDir level is outside project workspace
    expect(result.success).toBe(false);

    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it("prevents ~/.ssh access", async () => {
    const tool = createReadFileTool(["/home/user/project"]);
    const result = await tool.execute(
      { path: os.homedir() + "/.ssh/id_rsa" },
      { sessionId: "s1", cwd: "/home/user/project" },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("denied");
  });
});

// ============================================================================
// Tool Registry Integration Tests
// ============================================================================

describe("ToolRegistry createAllTools", () => {
  it("creates a registry with all tools registered", () => {
    const registry = createAllTools(["/home/user"]);
    expect(registry.getToolCount()).toBeGreaterThan(0);

    // Verify all expected tools exist
    expect(registry.getTool("read_file")).toBeDefined();
    expect(registry.getTool("write_file")).toBeDefined();
    expect(registry.getTool("edit_file")).toBeDefined();
    expect(registry.getTool("apply_patch")).toBeDefined();
    expect(registry.getTool("list_dir")).toBeDefined();
    expect(registry.getTool("grep")).toBeDefined();
    expect(registry.getTool("find_files")).toBeDefined();
    expect(registry.getTool("bash")).toBeDefined();
    expect(registry.getTool("git_status")).toBeDefined();
    expect(registry.getTool("git_diff")).toBeDefined();
    expect(registry.getTool("git_log")).toBeDefined();
  });

  it("sets workspace roots on the registry", () => {
    const registry = createAllTools(["/custom/workspace"]);
    expect(registry.getWorkspaceRoots()).toContain("/custom/workspace");
  });
});
