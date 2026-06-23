// @altos/plugins - Plugin permission and manifest validation tests

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  validatePluginPermissions,
  loadUserGrants,
  saveUserGrants,
  grantPluginPermissions,
  denyPluginPermissions,
  revokePluginPermissions,
  getPluginGrants,
  expandWildcardScopes,
  isWildcardScope,
} from "./permissions/index.js";
import type { PluginManifest, UserPermissionGrants } from "./index.js";

describe("Permission Validation", () => {
  const minimalManifest: PluginManifest = {
    name: "test-plugin",
    version: "0.1.0",
    entry: "index.js",
  };

  describe("validatePluginPermissions", () => {
    it("returns valid for manifest with no permissions", () => {
      const result = validatePluginPermissions(minimalManifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.granted).toHaveLength(0);
      expect(result.denied).toHaveLength(0);
    });

    it("auto-grants fs:read permission", () => {
      const manifest: PluginManifest = {
        ...minimalManifest,
        permissions: [{ scope: "fs:read", reason: "Read project files" }],
      };
      const result = validatePluginPermissions(manifest);
      expect(result.valid).toBe(true);
      expect(result.granted).toContain("fs:read");
      expect(result.denied).not.toContain("fs:read");
    });

    it("auto-grants fs:write permission", () => {
      const manifest: PluginManifest = {
        ...minimalManifest,
        permissions: [{ scope: "fs:write", reason: "Write output files" }],
      };
      const result = validatePluginPermissions(manifest);
      expect(result.valid).toBe(true);
      expect(result.granted).toContain("fs:write");
    });

    it("auto-grants net:connect permission", () => {
      const manifest: PluginManifest = {
        ...minimalManifest,
        permissions: [{ scope: "net:connect", reason: "Call APIs" }],
      };
      const result = validatePluginPermissions(manifest);
      expect(result.valid).toBe(true);
      expect(result.granted).toContain("net:connect");
    });

    it("auto-grants memory:read/write/search permissions", () => {
      const manifest: PluginManifest = {
        ...minimalManifest,
        permissions: [
          { scope: "memory:read", reason: "Read memory" },
          { scope: "memory:write", reason: "Write memory" },
          { scope: "memory:search", reason: "Search memory" },
        ],
      };
      const result = validatePluginPermissions(manifest);
      expect(result.valid).toBe(true);
      expect(result.granted).toContain("memory:read");
      expect(result.granted).toContain("memory:write");
      expect(result.granted).toContain("memory:search");
    });

    it("auto-grants config:read and config:write permissions", () => {
      const manifest: PluginManifest = {
        ...minimalManifest,
        permissions: [
          { scope: "config:read", reason: "Read config" },
          { scope: "config:write", reason: "Write config" },
        ],
      };
      const result = validatePluginPermissions(manifest);
      expect(result.valid).toBe(true);
      expect(result.granted).toContain("config:read");
      expect(result.granted).toContain("config:write");
    });

    it("denies fs:exec by default", () => {
      const manifest: PluginManifest = {
        ...minimalManifest,
        permissions: [{ scope: "fs:exec", reason: "Run scripts" }],
      };
      const result = validatePluginPermissions(manifest);
      expect(result.valid).toBe(false);
      expect(result.denied).toContain("fs:exec");
      expect(result.errors.some((e) => e.includes("fs:exec"))).toBe(true);
    });

    it("denies tool:* wildcard by default", () => {
      const manifest: PluginManifest = {
        ...minimalManifest,
        permissions: [{ scope: "tool:*", reason: "Register tools" }],
      };
      const result = validatePluginPermissions(manifest);
      expect(result.valid).toBe(false);
      expect(result.denied).toContain("tool:*");
    });

    it("denies hook:* wildcard by default", () => {
      const manifest: PluginManifest = {
        ...minimalManifest,
        permissions: [{ scope: "hook:*", reason: "Hook all events" }],
      };
      const result = validatePluginPermissions(manifest);
      expect(result.valid).toBe(false);
      expect(result.denied).toContain("hook:*");
    });

    it("denies model:* wildcard by default", () => {
      const manifest: PluginManifest = {
        ...minimalManifest,
        permissions: [{ scope: "model:*", reason: "Register models" }],
      };
      const result = validatePluginPermissions(manifest);
      expect(result.valid).toBe(false);
    });

    it("denies mcp:* wildcard by default", () => {
      const manifest: PluginManifest = {
        ...minimalManifest,
        permissions: [{ scope: "mcp:*", reason: "Register MCP servers" }],
      };
      const result = validatePluginPermissions(manifest);
      expect(result.valid).toBe(false);
    });

    it("denies skill:* wildcard by default", () => {
      const manifest: PluginManifest = {
        ...minimalManifest,
        permissions: [{ scope: "skill:*", reason: "Register skills" }],
      };
      const result = validatePluginPermissions(manifest);
      expect(result.valid).toBe(false);
    });

    it("grants permission when explicitly allowed in user grants", () => {
      const manifest: PluginManifest = {
        ...minimalManifest,
        permissions: [{ scope: "hook:before_tool_call", reason: "Validate tools" }],
      };
      // Pre-grant the permission
      const grants: UserPermissionGrants = {
        "test-plugin": { granted: ["hook:before_tool_call"], denied: [] },
      };
      const result = validatePluginPermissions(manifest, grants);
      expect(result.valid).toBe(true);
      expect(result.granted).toContain("hook:before_tool_call");
    });

    it("denies permission when explicitly denied in user grants", () => {
      const manifest: PluginManifest = {
        ...minimalManifest,
        permissions: [{ scope: "fs:read", reason: "Read files" }],
      };
      // Force deny an auto-granted permission
      const grants: UserPermissionGrants = { "test-plugin": { granted: [], denied: ["fs:read"] } };
      const result = validatePluginPermissions(manifest, grants);
      expect(result.valid).toBe(false);
      expect(result.denied).toContain("fs:read");
    });
  });

  describe("expandWildcardScopes", () => {
    it("expands tool:* to tool:register", () => {
      const expanded = expandWildcardScopes("tool:*");
      expect(expanded).toContain("tool:register");
    });

    it("expands hook:* to all hook events", () => {
      const expanded = expandWildcardScopes("hook:*");
      expect(expanded).toContain("hook:session_start");
      expect(expanded).toContain("hook:user_prompt");
      expect(expanded).toContain("hook:before_model_call");
      expect(expanded).toContain("hook:after_model_call");
      expect(expanded).toContain("hook:before_tool_call");
      expect(expanded).toContain("hook:after_tool_call");
      expect(expanded).toContain("hook:before_file_write");
      expect(expanded).toContain("hook:after_file_write");
      expect(expanded).toContain("hook:before_compact");
      expect(expanded).toContain("hook:session_end");
    });

    it("returns the scope as-is if not a wildcard", () => {
      const expanded = expandWildcardScopes("fs:read");
      expect(expanded).toEqual(["fs:read"]);
    });
  });

  describe("isWildcardScope", () => {
    it("returns true for scopes ending in *", () => {
      expect(isWildcardScope("tool:*")).toBe(true);
      expect(isWildcardScope("hook:*")).toBe(true);
      expect(isWildcardScope("model:*")).toBe(true);
    });

    it("returns false for specific scopes", () => {
      expect(isWildcardScope("fs:read")).toBe(false);
      expect(isWildcardScope("hook:session_start")).toBe(false);
    });
  });
});

describe("User Permission Grants", () => {
  const testPlugin = "test-grant-plugin";
  const testDir = path.join(os.tmpdir(), `altos-plugin-test-${Date.now()}`);
  let origHome: string | undefined;

  beforeEach(() => {
    // Point to a temp dir for isolation
    origHome = process.env.HOME;
    process.env.HOME = testDir;
    fs.mkdirSync(path.join(testDir, ".altos"), { recursive: true });
    // Ensure clean state
    revokePluginPermissions(testPlugin);
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe("grantPluginPermissions", () => {
    it("grants specified scopes to a plugin", () => {
      grantPluginPermissions(testPlugin, ["hook:before_tool_call", "fs:read"]);
      const grants = getPluginGrants(testPlugin);
      expect(grants.granted).toContain("hook:before_tool_call");
      expect(grants.granted).toContain("fs:read");
    });

    it("removes scope from denied list when granted", () => {
      denyPluginPermissions(testPlugin, ["fs:read"]);
      grantPluginPermissions(testPlugin, ["fs:read"]);
      const grants = getPluginGrants(testPlugin);
      expect(grants.denied).not.toContain("fs:read");
      expect(grants.granted).toContain("fs:read");
    });
  });

  describe("denyPluginPermissions", () => {
    it("denies specified scopes to a plugin", () => {
      denyPluginPermissions(testPlugin, ["hook:before_tool_call"]);
      const grants = getPluginGrants(testPlugin);
      expect(grants.denied).toContain("hook:before_tool_call");
    });

    it("removes scope from granted list when denied", () => {
      grantPluginPermissions(testPlugin, ["fs:read"]);
      denyPluginPermissions(testPlugin, ["fs:read"]);
      const grants = getPluginGrants(testPlugin);
      expect(grants.granted).not.toContain("fs:read");
      expect(grants.denied).toContain("fs:read");
    });
  });

  describe("revokePluginPermissions", () => {
    it("removes all grants and denials for a plugin", () => {
      grantPluginPermissions(testPlugin, ["hook:before_tool_call"]);
      denyPluginPermissions(testPlugin, ["fs:read"]);
      revokePluginPermissions(testPlugin);
      const grants = getPluginGrants(testPlugin);
      expect(grants.granted).toHaveLength(0);
      expect(grants.denied).toHaveLength(0);
    });
  });

  describe("loadUserGrants / saveUserGrants", () => {
    it("persists grants to ~/.altos/plugin-permissions.json", () => {
      const grants: import("./index.js").UserPermissionGrants = {
        [testPlugin]: { granted: ["fs:read"], denied: [] },
      };
      saveUserGrants(grants);
      const loaded = loadUserGrants();
      expect(loaded[testPlugin]).toBeDefined();
      expect(loaded[testPlugin]!.granted).toContain("fs:read");
    });
  });
});
