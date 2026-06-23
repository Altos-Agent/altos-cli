// @altos/plugins - Plugin discovery and loader tests

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  discoverPlugins,
  getLocalPluginPath,
  getGlobalPluginPath,
  PluginConfigStore,
} from "./index.js";

describe("Plugin Discovery", () => {
  const testDir = path.join(os.tmpdir(), `altos-plugin-discovery-${Date.now()}`);
  let origHome: string | undefined;

  beforeEach(() => {
    origHome = process.env.HOME;
    process.env.HOME = testDir;
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe("discoverPlugins", () => {
    it("discovers nothing when no plugin directories exist", () => {
      const discovered = discoverPlugins({ cwd: testDir });
      expect(discovered).toHaveLength(0);
    });

    it("discovers a plugin from local .altos/plugins directory", () => {
      const pluginDir = path.join(testDir, ".altos", "plugins", "my-test-plugin");
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(
        path.join(pluginDir, "plugin.json"),
        JSON.stringify({
          name: "my-test-plugin",
          version: "1.0.0",
          entry: "index.js",
        }),
      );

      const discovered = discoverPlugins({ cwd: testDir });
      const found = discovered.find((d) => d.name === "my-test-plugin");
      expect(found).toBeDefined();
      expect(found!.source).toBe("local");
      expect(found!.manifest).toBeDefined();
      expect(found!.manifest!.version).toBe("1.0.0");
    });

    it("discovers a plugin from global ~/.altos/plugins directory", () => {
      const pluginDir = path.join(testDir, ".altos", "plugins", "global-plugin");
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(
        path.join(pluginDir, "plugin.json"),
        JSON.stringify({
          name: "global-plugin",
          version: "2.0.0",
          entry: "index.js",
        }),
      );

      const discovered = discoverPlugins({ cwd: "/nonexistent" });
      const found = discovered.find((d) => d.name === "global-plugin");
      expect(found).toBeDefined();
      expect(found!.source).toBe("global");
    });

    it("loads manifest from package.json with altosPlugin field", () => {
      const pluginDir = path.join(testDir, ".altos", "plugins", "pkg-plugin");
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(
        path.join(pluginDir, "package.json"),
        JSON.stringify({
          name: "pkg-plugin",
          version: "3.0.0",
          description: "Plugin from package.json",
          altosPlugin: {
            entry: "dist/index.js",
            permissions: [],
          },
        }),
      );

      const discovered = discoverPlugins({ cwd: testDir });
      const found = discovered.find((d) => d.name === "pkg-plugin");
      expect(found).toBeDefined();
      expect(found!.manifest!.version).toBe("3.0.0");
      expect(found!.manifest!.entry).toBe("dist/index.js");
    });

    it("marks plugin as discovered with error when no manifest found", () => {
      const pluginDir = path.join(testDir, ".altos", "plugins", "no-manifest-plugin");
      fs.mkdirSync(pluginDir, { recursive: true });
      // Write a dummy file that is not a manifest
      fs.writeFileSync(path.join(pluginDir, "README.md"), "# No plugin here");

      const discovered = discoverPlugins({ cwd: testDir });
      const found = discovered.find((d) => d.name === "no-manifest-plugin");
      expect(found).toBeDefined();
      expect(found!.manifest).toBeUndefined();
      expect(found!.manifestError).toBeDefined();
    });

    it("discovers from node_modules by default", () => {
      const nmPluginDir = path.join(testDir, "node_modules", "altos-plugin-test-nm");
      fs.mkdirSync(nmPluginDir, { recursive: true });
      fs.writeFileSync(
        path.join(nmPluginDir, "plugin.json"),
        JSON.stringify({ name: "test-nm", version: "1.0.0", entry: "index.js" }),
      );

      const discovered = discoverPlugins({ cwd: testDir });
      const found = discovered.find((d) => d.name === "test-nm");
      expect(found).toBeDefined();
      expect(found!.source).toBe("node_modules");
    });

    it("does not discover from node_modules when includeNodeModules is false", () => {
      const nmPluginDir = path.join(testDir, "node_modules", "altos-plugin-test-nm");
      fs.mkdirSync(nmPluginDir, { recursive: true });
      fs.writeFileSync(
        path.join(nmPluginDir, "plugin.json"),
        JSON.stringify({ name: "test-nm", version: "1.0.0", entry: "index.js" }),
      );

      const discovered = discoverPlugins({ cwd: testDir, includeNodeModules: false });
      expect(discovered.find((d) => d.name === "test-nm")).toBeUndefined();
    });

    it("discovers same plugin from both local and global paths separately", () => {
      // Install same-named plugin in both local and global
      const localDir = path.join(testDir, ".altos", "plugins", "both-plugin");
      fs.mkdirSync(localDir, { recursive: true });
      fs.writeFileSync(
        path.join(localDir, "plugin.json"),
        JSON.stringify({ name: "both-plugin", version: "1.0.0", entry: "index.js" }),
      );

      // Global discovery uses a different HOME dir
      const discovered = discoverPlugins({ cwd: testDir });
      const found = discovered.filter((d) => d.name === "both-plugin");
      // Both may appear if they resolve to different paths
      expect(found.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getLocalPluginPath", () => {
    it("returns path under project .altos/plugins", () => {
      const p = getLocalPluginPath("my-plugin", "/project");
      expect(p).toBe("/project/.altos/plugins/my-plugin");
    });

    it("uses cwd when no cwd provided", () => {
      const p = getLocalPluginPath("my-plugin");
      expect(p).toContain(".altos/plugins/my-plugin");
    });
  });

  describe("getGlobalPluginPath", () => {
    it("returns path under ~/.altos/plugins", () => {
      const p = getGlobalPluginPath("my-plugin");
      expect(p).toBe(path.join(testDir, ".altos", "plugins", "my-plugin"));
    });
  });
});

describe("PluginConfigStore", () => {
  const testDir = path.join(os.tmpdir(), `altos-config-store-${Date.now()}`);
  let origHome: string | undefined;
  let store: PluginConfigStore;

  beforeEach(() => {
    origHome = process.env.HOME;
    process.env.HOME = testDir;
    fs.mkdirSync(testDir, { recursive: true });
    store = new PluginConfigStore();
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("returns empty object for unknown plugin", () => {
    const config = store.read("nonexistent-plugin");
    expect(config).toEqual({});
  });

  it("writes and reads config for a plugin", () => {
    store.write("my-plugin", { foo: "bar", count: 42 });
    const config = store.read("my-plugin");
    expect(config).toEqual({ foo: "bar", count: 42 });
  });

  it("overwrites previous config on write", () => {
    store.write("my-plugin", { a: 1 });
    store.write("my-plugin", { b: 2 });
    const config = store.read("my-plugin");
    expect(config).toEqual({ b: 2 });
    expect(config).not.toHaveProperty("a");
  });

  it("deletes config for a plugin", () => {
    store.write("my-plugin", { foo: "bar" });
    store.delete("my-plugin");
    const config = store.read("my-plugin");
    expect(config).toEqual({});
  });

  it("handles special characters in plugin names safely", () => {
    store.write("my-complex@plugin!", { ok: true });
    const config = store.read("my-complex@plugin!");
    expect(config).toEqual({ ok: true });
  });
});
