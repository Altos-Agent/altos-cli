// CLI Command interfaces

export interface IndexCommandOptions {
  path?: string;
  force?: boolean;
  stats?: boolean;
  json?: boolean;
  quiet?: boolean;
  watch?: boolean;
  poll?: number; // polling interval in ms for watch mode fallback
}

export interface MapCommandOptions {
  path?: string;
  focus?: string;
  exports?: boolean;
  packages?: boolean;
  important?: boolean;
  json?: boolean;
  noColor?: boolean;
  quiet?: boolean;
}

export interface SearchCommandOptions {
  query: string;
  path?: string;
  refs?: boolean;
  file?: string;
  kind?: string;
  json?: boolean;
  limit?: number;
}

export interface ContextCommandOptions {
  prompt: string;
  path?: string;
  files?: number;
  json?: boolean;
  includeTree?: boolean;
  includeGit?: boolean;
  maxTokens?: number;
  showEvidence?: boolean;
}
