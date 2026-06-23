// @altos/skills - Skill system

export interface Skill {
  name: string;
  version: string;
  description?: string;
  trigger?: string | string[];
  execute(ctx: SkillContext): Promise<unknown>;
}

export interface SkillContext {
  input: string;
  session: SkillSession;
  registerAction(name: string, fn: () => Promise<void>): void;
}

export interface SkillSession {
  id: string;
  data: Record<string, unknown>;
  appendOutput(content: string): void;
}

export interface SkillResult {
  success: boolean;
  output?: string;
  error?: string;
}

export class SkillRunner {
  private skills: Map<string, Skill> = new Map();

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  async run(name: string, input: string): Promise<SkillResult> {
    const skill = this.skills.get(name);
    if (!skill) return { success: false, error: `Skill not found: ${name}` };
    try {
      const session: SkillSession = {
        id: crypto.randomUUID(),
        data: {},
        appendOutput() {},
      };
      const result = await skill.execute({ input, session, registerAction: () => {} });
      return { success: true, output: String(result) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  listSkills(): { name: string; version: string; description?: string }[] {
    return [...this.skills.values()].map((s) => ({
      name: s.name,
      version: s.version,
      description: s.description,
    }));
  }
}

export function createSkillRunner(): SkillRunner {
  return new SkillRunner();
}

// Re-export manifest types
export type { SkillManifest, SkillExample, PermissionRef } from "./manifest.js";
export {
  parseSkillManifest,
  loadSkillsFromDir,
  loadAllSkills,
  findSkill,
  listSkills,
  getLocalSkillsDir,
  getGlobalSkillsDir,
  type LoadedSkill,
  type SkillLoaderOptions,
} from "./loader/index.js";
