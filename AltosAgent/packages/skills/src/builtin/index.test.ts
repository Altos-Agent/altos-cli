// Builtin skills manifest validation tests

import { describe, it, expect } from "vitest";
import { loadBuiltinSkills } from "./index.js";

describe("loadBuiltinSkills", () => {
  it("loads all builtin skill manifests", () => {
    const skills = loadBuiltinSkills();
    expect(skills.length).toBeGreaterThan(0);
  });

  it("every skill has required fields", () => {
    const skills = loadBuiltinSkills();
    for (const skill of skills) {
      expect(skill.name, `Skill at index ${skills.indexOf(skill)} missing name`).toBeTruthy();
      expect(skill.version, `Skill "${skill.name}" missing version`).toBeTruthy();
      expect(skill.instructions, `Skill "${skill.name}" missing instructions`).toBeTruthy();
    }
  });

  it("every skill has a unique name", () => {
    const skills = loadBuiltinSkills();
    const names = skills.map((s) => s.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("skill versions are valid semver-ish format", () => {
    const skills = loadBuiltinSkills();
    const semverRegex = /^\d+\.\d+\.\d+/;
    for (const skill of skills) {
      expect(
        semverRegex.test(skill.version),
        `Skill "${skill.name}" has invalid version "${skill.version}"`,
      ).toBe(true);
    }
  });

  it("no skill has duplicate entries", () => {
    const skills = loadBuiltinSkills();
    for (const skill of skills) {
      expect(skill.name).toBe(skill.name.toLowerCase().replace(/ /g, "-"));
    }
  });
});

describe("builtin skill examples", () => {
  it("skills with examples have valid example structure", () => {
    const skills = loadBuiltinSkills();
    const skillsWithExamples = skills.filter((s) => s.examples && s.examples.length > 0);

    for (const skill of skillsWithExamples) {
      for (const example of skill.examples ?? []) {
        expect(
          example.description,
          `Skill "${skill.name}" example missing description`,
        ).toBeTruthy();
        expect(example.input, `Skill "${skill.name}" example missing input`).toBeTruthy();
      }
    }
  });
});
