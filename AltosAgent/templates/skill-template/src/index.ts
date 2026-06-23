// Example skill - replace with your implementation

import type { Skill, SkillContext } from "@altos/skills";

const SKILL_NAME = "{{name}}";
const SKILL_VERSION = "0.1.0";

const ExampleSkill: Skill = {
  name: SKILL_NAME,
  version: SKILL_VERSION,
  description: "Example skill for Altos",
  trigger: ["hello", "greet"],

  async execute(ctx: SkillContext): Promise<unknown> {
    ctx.session.appendOutput(`Hello from ${SKILL_NAME}!`);
    return { success: true, message: "Skill executed" };
  },
};

export default ExampleSkill;
