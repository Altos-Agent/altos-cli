// altos skill CLI commands

import * as fs from "node:fs";
import * as path from "node:path";
import {
  loadAllSkills,
  findSkill,
  type LoadedSkill,
  getLocalSkillsDir,
  getGlobalSkillsDir,
  loadSkillsFromDir,
} from "@altos/skills/loader";
import { getBuiltinSkillsDir, loadBuiltinSkills } from "@altos/skills/builtin";

export interface SkillCommandOptions {
  list?: boolean;
  inspect?: string;
  run?: string;
  create?: string;
  cwd?: string;
  json?: boolean;
}

export async function runSkillCommand(cwd: string, options: SkillCommandOptions): Promise<number> {
  if (options.create) {
    return cmdCreate(cwd, options.create);
  }
  if (options.inspect) {
    return cmdInspect(cwd, options.inspect, options.json);
  }
  if (options.run) {
    return cmdRun(cwd, options.run);
  }
  // Default: list
  return cmdList(cwd, options.json);
}

// =============================================================================
// altos skill list
// =============================================================================

async function cmdList(cwd: string, asJson?: boolean): Promise<number> {
  const localSkills = loadAllSkills({ cwd });
  // Load built-in skills as LoadedSkill[]
  const builtinManifests = loadBuiltinSkills();
  const builtinSkills: LoadedSkill[] = builtinManifests.map((m) => ({
    manifest: m,
    source: "builtin" as const,
    path: path.join(getBuiltinSkillsDir(), m.name),
  }));

  // Deduplicate by name (local > builtin)
  const seen = new Map<string, LoadedSkill>();
  for (const s of [...localSkills, ...builtinSkills]) {
    if (!seen.has(s.manifest.name)) {
      seen.set(s.manifest.name, s);
    }
  }
  const skills = [...seen.values()];

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          skills: skills.map((s) => ({
            name: s.manifest.name,
            version: s.manifest.version,
            description: s.manifest.description,
            source: s.source,
            triggers: s.manifest.triggers,
          })),
          total: skills.length,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log("\n=== Altos Skills ===\n");
  if (skills.length === 0) {
    console.log("  No skills found.");
    console.log("\nAdd skills to:");
    console.log("  Local:  <cwd>/.altos/skills/");
    console.log("  Global: ~/.altos/skills/");
    console.log("\nOr create one:");
    console.log("  altos create skill <name>");
    console.log("\nOr install a built-in skill package.");
  } else {
    for (const s of skills) {
      const triggers = s.manifest.triggers ? ` (${s.manifest.triggers.join(", ")})` : "";
      console.log(
        `  ${s.manifest.name.padEnd(24)} v${s.manifest.version.padEnd(8)} ${s.source}${triggers}`,
      );
      if (s.manifest.description) {
        console.log(`    ${s.manifest.description}`);
      }
    }
  }

  console.log();
  console.log("  Local dir:  " + getLocalSkillsDir(cwd));
  console.log("  Global dir: " + getGlobalSkillsDir());
  console.log("  Built-in:   " + getBuiltinSkillsDir());
  console.log();

  return 0;
}

// =============================================================================
// altos skill inspect <name>
// =============================================================================

async function cmdInspect(cwd: string, name: string, asJson?: boolean): Promise<number> {
  // Check local/user skills first
  let skill = findSkill(name, { cwd });
  // Fall back to built-in
  if (!skill) {
    const builtinManifests = loadBuiltinSkills();
    const found = builtinManifests.find((m) => m.name === name);
    if (found) {
      skill = {
        manifest: found,
        source: "builtin",
        path: path.join(getBuiltinSkillsDir(), found.name),
      };
    }
  }
  if (!skill) {
    console.error(`Skill not found: ${name}`);
    console.error("\nSearch in:");
    console.error("  Local:   " + getLocalSkillsDir(cwd));
    console.error("  Global:  " + getGlobalSkillsDir());
    console.error("  Built-in: " + getBuiltinSkillsDir());
    return 1;
  }

  if (asJson) {
    console.log(JSON.stringify(skill.manifest, null, 2));
    return 0;
  }

  const m = skill.manifest;
  console.log(`\n=== Skill: ${m.name} ===\n`);
  console.log(`Version:     ${m.version}`);
  console.log(`Description: ${m.description ?? "—"}`);
  console.log(`Source:      ${skill.source} (${skill.path})`);
  console.log(`Triggers:    ${m.triggers?.join(", ") ?? "(none — explicit only)"}`);

  console.log("\n--- Instructions ---\n");
  console.log(m.instructions);

  if (m.required_tools?.length) {
    console.log("\n--- Required Tools ---");
    for (const t of m.required_tools) console.log(`  • ${t}`);
  }

  if (m.required_permissions?.length) {
    console.log("\n--- Required Permissions ---");
    for (const p of m.required_permissions) {
      console.log(`  • ${p.scope}${p.reason ? ` — ${p.reason}` : ""}`);
    }
  }

  if (m.optional_memory?.length) {
    console.log("\n--- Optional Memory ---");
    for (const mem of m.optional_memory) console.log(`  • ${mem}`);
  }

  if (m.examples?.length) {
    console.log("\n--- Examples ---");
    for (const ex of m.examples) {
      console.log(`  "${ex.input}"`);
      if (ex.description) console.log(`    → ${ex.description}`);
      if (ex.expected) console.log(`    expected: ${ex.expected}`);
    }
  }

  console.log();
  return 0;
}

// =============================================================================
// altos skill run <name>
// =============================================================================

async function cmdRun(cwd: string, name: string): Promise<number> {
  let skill = findSkill(name, { cwd });
  if (!skill) {
    const builtinManifests = loadBuiltinSkills();
    const found = builtinManifests.find((m) => m.name === name);
    if (found) {
      skill = {
        manifest: found,
        source: "builtin",
        path: path.join(getBuiltinSkillsDir(), found.name),
      };
    }
  }

  if (!skill) {
    console.error(`Skill not found: ${name}`);
    return 1;
  }

  // The skill instructions are printed; actual execution happens when
  // the agent runtime picks up the skill. Here we just confirm it is valid.
  console.log(`Skill: ${skill.manifest.name} v${skill.manifest.version}`);
  console.log(`Source: ${skill.source}`);
  console.log("\nInstructions:\n");
  console.log(skill.manifest.instructions);
  console.log();

  if (skill.manifest.required_tools?.length) {
    console.log("Required tools: " + skill.manifest.required_tools.join(", "));
  }

  return 0;
}

// =============================================================================
// altos create skill <name>
// =============================================================================

async function cmdCreate(cwd: string, name: string): Promise<number> {
  // Validate name
  if (!/^[a-z0-9-]+$/.test(name)) {
    console.error("Skill name must be lowercase alphanumeric with hyphens only.");
    return 1;
  }

  const skillsDir = path.join(cwd, ".altos", "skills", name);
  if (fs.existsSync(skillsDir)) {
    console.error(`Skill directory already exists: ${skillsDir}`);
    return 1;
  }

  fs.mkdirSync(skillsDir, { recursive: true });

  const manifest: Record<string, unknown> = {
    name,
    version: "0.1.0",
    description: "TODO: describe what this skill does",
    instructions: `You are an expert at ${name}.\n\nWhen invoked, analyze the user's request and provide expert guidance on ${name}. Be thorough, cite relevant patterns, and explain your reasoning.`,
    triggers: [],
    examples: [
      {
        description: "TODO: describe this example",
        input: "TODO: example input",
        expected: "TODO: expected output or behavior",
      },
    ],
  };

  fs.writeFileSync(path.join(skillsDir, "skill.json"), JSON.stringify(manifest, null, 2) + "\n");

  console.log(`✓ Created skill: ${name}`);
  console.log(`  → ${path.join(skillsDir, "skill.json")}`);
  console.log("\nEdit the manifest and add your skill implementation.");
  console.log("Use 'altos skill inspect " + name + "' to verify.");
  return 0;
}
