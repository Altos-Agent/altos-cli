// Skill loader tests

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseSkillManifest,
  loadSkillsFromDir,
  getLocalSkillsDir,
  getGlobalSkillsDir,
} from "./index.js";

describe("parseSkillManifest", () => {
  it("parses a valid manifest", () => {
    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, `test-skill-${Date.now()}.json`);
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        name: "test-skill",
        version: "1.0.0",
        instructions: "Do the thing",
      }),
    );

    const manifest = parseSkillManifest(filePath);
    expect(manifest).not.toBeNull();
    expect(manifest?.name).toBe("test-skill");
    expect(manifest?.version).toBe("1.0.0");
    expect(manifest?.instructions).toBe("Do the thing");

    fs.unlinkSync(filePath);
  });

  it("returns null for missing name", () => {
    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, `test-skill-${Date.now()}.json`);
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: "1.0.0",
        instructions: "Do the thing",
      }),
    );

    const manifest = parseSkillManifest(filePath);
    expect(manifest).toBeNull();
    fs.unlinkSync(filePath);
  });

  it("returns null for missing instructions", () => {
    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, `test-skill-${Date.now()}.json`);
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        name: "test-skill",
        version: "1.0.0",
      }),
    );

    const manifest = parseSkillManifest(filePath);
    expect(manifest).toBeNull();
    fs.unlinkSync(filePath);
  });

  it("returns null for invalid JSON", () => {
    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, `test-skill-${Date.now()}.json`);
    fs.writeFileSync(filePath, "not valid json{");

    const manifest = parseSkillManifest(filePath);
    expect(manifest).toBeNull();
    fs.unlinkSync(filePath);
  });

  it("returns null for non-existent file", () => {
    const manifest = parseSkillManifest("/non/existent/path.json");
    expect(manifest).toBeNull();
  });
});

describe("loadSkillsFromDir", () => {
  const tempDir = path.join(os.tmpdir(), `altos-skills-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads a skill from a JSON file", () => {
    fs.writeFileSync(
      path.join(tempDir, "my-skill.json"),
      JSON.stringify({
        name: "my-skill",
        version: "0.1.0",
        instructions: "Do a thing",
      }),
    );

    const skills = loadSkillsFromDir(tempDir, "local");
    expect(skills).toHaveLength(1);
    expect(skills[0].manifest.name).toBe("my-skill");
    expect(skills[0].source).toBe("local");
  });

  it("loads a skill from a directory with skill.json", () => {
    fs.mkdirSync(path.join(tempDir, "my-skill"));
    fs.writeFileSync(
      path.join(tempDir, "my-skill", "skill.json"),
      JSON.stringify({
        name: "my-skill",
        version: "0.1.0",
        instructions: "Do a thing",
      }),
    );

    const skills = loadSkillsFromDir(tempDir, "global");
    expect(skills).toHaveLength(1);
    expect(skills[0].manifest.name).toBe("my-skill");
    expect(skills[0].source).toBe("global");
    expect(skills[0].path).toContain("my-skill");
  });

  it("skips directories without skill.json", () => {
    fs.mkdirSync(path.join(tempDir, "empty-skill"));

    const skills = loadSkillsFromDir(tempDir, "local");
    expect(skills).toHaveLength(0);
  });

  it("skips invalid manifest files", () => {
    fs.writeFileSync(
      path.join(tempDir, "bad-skill.json"),
      JSON.stringify({
        version: "1.0.0",
        instructions: "Missing name",
      }),
    );

    const skills = loadSkillsFromDir(tempDir, "local");
    expect(skills).toHaveLength(0);
  });

  it("returns empty array for non-existent directory", () => {
    const skills = loadSkillsFromDir("/non/existent/dir", "local");
    expect(skills).toHaveLength(0);
  });

  it("loads multiple skills from mixed sources", () => {
    fs.writeFileSync(
      path.join(tempDir, "file-skill.json"),
      JSON.stringify({
        name: "file-skill",
        version: "1.0.0",
        instructions: "From file",
      }),
    );
    fs.mkdirSync(path.join(tempDir, "dir-skill"));
    fs.writeFileSync(
      path.join(tempDir, "dir-skill", "skill.json"),
      JSON.stringify({
        name: "dir-skill",
        version: "1.0.0",
        instructions: "From dir",
      }),
    );

    const skills = loadSkillsFromDir(tempDir, "local");
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.manifest.name).sort()).toEqual(["dir-skill", "file-skill"]);
  });
});

describe("getLocalSkillsDir", () => {
  it("returns project-relative path", () => {
    const dir = getLocalSkillsDir("/my/project");
    expect(dir).toBe(path.join("/my/project", ".altos", "skills"));
  });
});

describe("getGlobalSkillsDir", () => {
  it("returns home-relative path", () => {
    const dir = getGlobalSkillsDir();
    expect(dir).toBe(path.join(os.homedir(), ".altos", "skills"));
  });
});
