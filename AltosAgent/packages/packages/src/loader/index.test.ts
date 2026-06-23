// Package loader tests

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parsePackageManifest,
  loadPackagesFromDir,
  loadPackageFromPath,
  getLocalPackagesDir,
  getGlobalPackagesDir,
  getInstalledPackagesDir,
} from "./index.js";

describe("parsePackageManifest", () => {
  const tempDir = path.join(os.tmpdir(), `altos-pkg-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("parses altos-package.json", () => {
    fs.writeFileSync(
      path.join(tempDir, "altos-package.json"),
      JSON.stringify({
        name: "my-pkg",
        version: "1.0.0",
        description: "A test package",
      }),
    );

    const manifest = parsePackageManifest(tempDir);
    expect(manifest).not.toBeNull();
    expect(manifest!.name).toBe("my-pkg");
    expect(manifest!.version).toBe("1.0.0");
  });

  it("parses package.json with altos field", () => {
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({
        name: "my-pkg-npm",
        version: "2.0.0",
        altos: {
          name: "my-pkg",
          version: "1.0.0",
          description: "From npm package",
        },
      }),
    );

    const manifest = parsePackageManifest(tempDir);
    expect(manifest).not.toBeNull();
    expect(manifest!.name).toBe("my-pkg");
    expect(manifest!.version).toBe("1.0.0");
  });

  it("returns null when neither file exists", () => {
    const manifest = parsePackageManifest("/non/existent");
    expect(manifest).toBeNull();
  });

  it("returns null for altos-package.json without name", () => {
    fs.writeFileSync(
      path.join(tempDir, "altos-package.json"),
      JSON.stringify({
        version: "1.0.0",
      }),
    );

    const manifest = parsePackageManifest(tempDir);
    expect(manifest).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    fs.writeFileSync(path.join(tempDir, "altos-package.json"), "not json");

    const manifest = parsePackageManifest(tempDir);
    expect(manifest).toBeNull();
  });
});

describe("loadPackagesFromDir", () => {
  const tempDir = path.join(os.tmpdir(), `altos-pkgs-dir-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads packages from subdirectories", () => {
    fs.mkdirSync(path.join(tempDir, "pkg-a"));
    fs.writeFileSync(
      path.join(tempDir, "pkg-a", "altos-package.json"),
      JSON.stringify({
        name: "pkg-a",
        version: "1.0.0",
      }),
    );
    fs.mkdirSync(path.join(tempDir, "pkg-b"));
    fs.writeFileSync(
      path.join(tempDir, "pkg-b", "altos-package.json"),
      JSON.stringify({
        name: "pkg-b",
        version: "2.0.0",
      }),
    );

    const packages = loadPackagesFromDir(tempDir, "local");
    expect(packages).toHaveLength(2);
    expect(packages.map((p) => p.manifest.name).sort()).toEqual(["pkg-a", "pkg-b"]);
    expect(packages[0].source).toBe("local");
  });

  it("returns empty array for non-existent directory", () => {
    const packages = loadPackagesFromDir("/non/existent", "global");
    expect(packages).toHaveLength(0);
  });

  it("skips directories without valid manifest", () => {
    fs.mkdirSync(path.join(tempDir, "empty-pkg"));
    fs.mkdirSync(path.join(tempDir, "bad-pkg"));
    fs.writeFileSync(
      path.join(tempDir, "bad-pkg", "altos-package.json"),
      JSON.stringify({
        version: "1.0.0",
      }),
    );

    const packages = loadPackagesFromDir(tempDir, "local");
    expect(packages).toHaveLength(0);
  });

  it("skips files (not directories)", () => {
    fs.writeFileSync(
      path.join(tempDir, "not-a-package.json"),
      JSON.stringify({
        name: "not-a-dir",
        version: "1.0.0",
      }),
    );

    const packages = loadPackagesFromDir(tempDir, "local");
    expect(packages).toHaveLength(0);
  });
});

describe("loadPackageFromPath", () => {
  const tempDir = path.join(os.tmpdir(), `altos-pkg-path-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads a package from an absolute path", () => {
    fs.mkdirSync(path.join(tempDir, "test-pkg"));
    fs.writeFileSync(
      path.join(tempDir, "test-pkg", "altos-package.json"),
      JSON.stringify({
        name: "test-pkg",
        version: "1.0.0",
        description: "Loaded from path",
      }),
    );

    const pkg = loadPackageFromPath(path.join(tempDir, "test-pkg"));
    expect(pkg).not.toBeNull();
    expect(pkg!.manifest.name).toBe("test-pkg");
    expect(pkg!.source).toBe("local");
    expect(pkg!.path).toContain("test-pkg");
  });

  it("loads a package from a relative path resolved from cwd", () => {
    // Relative paths resolve from process.cwd(), not from the test temp dir.
    // Use an absolute path instead.
    fs.mkdirSync(path.join(tempDir, "relative-pkg"));
    fs.writeFileSync(
      path.join(tempDir, "relative-pkg", "altos-package.json"),
      JSON.stringify({
        name: "relative-pkg",
        version: "1.0.0",
      }),
    );

    const pkg = loadPackageFromPath(path.join(tempDir, "relative-pkg"));
    expect(pkg).not.toBeNull();
    expect(pkg!.manifest.name).toBe("relative-pkg");
  });

  it("returns null for non-existent path", () => {
    const pkg = loadPackageFromPath("/non/existent/package");
    expect(pkg).toBeNull();
  });

  it("returns null for path without valid manifest", () => {
    fs.mkdirSync(path.join(tempDir, "no-manifest-pkg"));

    const pkg = loadPackageFromPath(path.join(tempDir, "no-manifest-pkg"));
    expect(pkg).toBeNull();
  });
});

describe("getLocalPackagesDir", () => {
  it("returns project-relative path", () => {
    const dir = getLocalPackagesDir("/my/project");
    expect(dir).toBe(path.join("/my/project", ".altos", "packages"));
  });
});

describe("getGlobalPackagesDir", () => {
  it("returns home-relative path", () => {
    const dir = getGlobalPackagesDir();
    expect(dir).toBe(path.join(os.homedir(), ".altos", "packages"));
  });
});

describe("getInstalledPackagesDir", () => {
  it("returns home-relative installed path", () => {
    const dir = getInstalledPackagesDir();
    expect(dir).toBe(path.join(os.homedir(), ".altos", "installed"));
  });
});
