// @altos/packages - Package manifest definition

/**
 * AltosPackageManifest describes a complete Altos package that can bundle
 * plugins, skills, prompt templates, themes, MCP configs, and commands.
 */
export interface AltosPackageManifest {
  /** Package name, e.g. "my-project" or "@org/my-package" */
  name: string;
  /** Semantic version */
  version: string;
  /** Human-readable description */
  description: string;
  /** Package author */
  author?: string;
  /** Keywords for discovery */
  keywords?: string[];
  /** List of plugins provided by this package */
  plugins?: PackagePlugin[];
  /** List of skills provided by this package */
  skills?: PackageSkill[];
  /** Prompt templates bundled in this package */
  prompts?: PackagePrompt[];
  /** Themes provided by this package */
  themes?: PackageTheme[];
  /** MCP server configurations */
  mcp?: PackageMcpConfig[];
  /** Permissions declared by this package */
  permissions?: PackagePermission[];
}

export interface PackagePlugin {
  /** Plugin name */
  name: string;
  /** Plugin version */
  version: string;
  /** Description */
  description?: string;
  /** Relative path to plugin directory within package, or npm package name */
  entry: string;
}

export interface PackageSkill {
  /** Skill name */
  name: string;
  /** Skill version */
  version: string;
  /** Description */
  description?: string;
  /** Relative path to skill directory within package */
  entry: string;
}

export interface PackagePrompt {
  /** Template name used to reference it */
  name: string;
  /** Description */
  description?: string;
  /** The prompt template text. Supports {{variable}} substitution. */
  template: string;
}

export interface PackageTheme {
  /** Theme name */
  name: string;
  /** Description */
  description?: string;
  /** Relative path to theme CSS/assets directory */
  entry: string;
}

export interface PackageMcpConfig {
  /** MCP config name */
  name: string;
  /** Description */
  description?: string;
  /** MCP server command, e.g. "npx" or absolute path */
  command: string;
  /** Arguments to the command */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
}

export interface PackagePermission {
  scope: string;
  reason?: string;
}
