// @altos/memory - Secret redaction utilities

/**
 * Core secret patterns (sk- and ghp_ prefixes).
 * We implement these directly to avoid core's Bearer handling conflicting
 * with our key-preserving Bearer redaction.
 */
const CORE_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, replacement: "[REDACTED]" },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, replacement: "[REDACTED]" },
];

/**
 * Memory-specific secret patterns with key-preserving redaction.
 * IMPORTANT: Patterns are ordered by specificity - more specific (quoted values) come first.
 */
type ReplacementFn = (match: string, ...args: string[]) => string;

const MEMORY_PATTERNS: { pattern: RegExp; replacement: ReplacementFn }[] = [
  // API key patterns with quoted values - must come BEFORE unquoted to handle apiKey="value" correctly
  {
    pattern: /(api[_-]?key|apikey)([=\s:]+)("[^"]+")/gi,
    replacement: (_m, key, sep) => `${key}${sep}[REDACTED]`,
  },
  // Password patterns with quoted values - must come BEFORE unquoted
  {
    pattern: /(password|passwd|pwd|secret)([=\s:]+)("[^"]+")/gi,
    replacement: (_m, key, sep) => `${key}${sep}[REDACTED]`,
  },
  // Bearer tokens (both "Bearer " and "bearer ") - preserve prefix, redact token
  {
    pattern: /(Bearer|bearer)(\s+)([a-zA-Z0-9._-]+)/g,
    replacement: (_m, prefix, space) => `${prefix}${space}[REDACTED]`,
  },
  // Database connection strings - redact password portion only
  {
    pattern: /((?:mysql|postgres|mongodb|redis):\/\/[^:@]+:)([^\s"'`@]+)(@)/gi,
    replacement: (_m, prefix) => `${prefix}[REDACTED]@`,
  },
  // Private keys - redact entire content between markers
  {
    pattern: /(-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----)[\s\S]*?(-----END\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----)/gi,
    replacement: (_m, begin, end) => `${begin}\n[REDACTED]\n${end}`,
  },
  // AWS credentials - preserve key and redact value
  {
    pattern: /(aws[_-]?(?:access[_-]?key[_-]?id|secret[_-]?access[_-]?key))([=\s:]+)([^\s"'`]{10,})/gi,
    replacement: (_m, key, sep) => `${key}${sep}[REDACTED]`,
  },
  // password=, passwd:, pwd: patterns (unquoted) - preserve key and redact value
  {
    pattern: /(password|passwd|pwd|secret)([=\s:]+)([^\s"'`]{4,})/gi,
    replacement: (_m, key, sep) => `${key}${sep}[REDACTED]`,
  },
  // api_key= or api-key: patterns (unquoted) - preserve key and redact value
  {
    pattern: /(api[_-]?key|apikey)([=\s:]+)([^\s"'`]{8,})/gi,
    replacement: (_m, key, sep) => `${key}${sep}[REDACTED]`,
  },
  // JWT tokens (compact form)
  {
    pattern: /(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g,
    replacement: () => "[REDACTED]",
  },
];

/**
 * Redact secrets from content before storing in memory.
 * This is ALWAYS called before writeMemory() stores anything.
 *
 * @param content - The content to redact
 * @returns The redacted content with secrets replaced by [REDACTED]
 */
export function redactSecrets(content: string): string {
  let result = content;

  // Apply core patterns (sk-, ghp_)
  for (const { pattern, replacement } of CORE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  // Apply memory-specific patterns with key preservation
  for (const { pattern, replacement } of MEMORY_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

/**
 * Check if content likely contains secrets that would be redacted.
 * Used for confirmation prompts before writing long-term memory.
 *
 * @param content - The content to check
 * @returns true if the content likely contains secrets
 */
export function containsSecrets(content: string): boolean {
  // Check core patterns
  for (const { pattern } of CORE_PATTERNS) {
    if (pattern.test(content)) {
      return true;
    }
  }

  // Check memory patterns
  for (const { pattern } of MEMORY_PATTERNS) {
    // Reset lastIndex since some patterns use 'g' flag
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      return true;
    }
  }

  // Also check for private key markers
  if (/-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/i.test(content)) {
    return true;
  }

  return false;
}

/**
 * Summary of what was redacted (for logging/debugging).
 */
export interface RedactionSummary {
  originalLength: number;
  redactedLength: number;
  redactionsApplied: number;
}

/**
 * Detailed redaction that returns what was changed.
 * Useful for debugging and audit trails.
 *
 * @param content - The content to redact
 * @returns Object with original, redacted content, and redaction count
 */
export function redactSecretsDetailed(content: string): {
  redacted: string;
  summary: RedactionSummary;
} {
  let redactionsApplied = 0;
  let result = content;

  // Core patterns
  for (const { pattern, replacement } of CORE_PATTERNS) {
    const matches = result.match(pattern);
    if (matches) {
      redactionsApplied += matches.length;
      result = result.replace(pattern, replacement);
    }
  }

  // Memory patterns
  for (const { pattern, replacement } of MEMORY_PATTERNS) {
    const matches = result.match(pattern);
    if (matches) {
      redactionsApplied += matches.length;
      result = result.replace(pattern, replacement);
    }
  }

  return {
    redacted: result,
    summary: {
      originalLength: content.length,
      redactedLength: result.length,
      redactionsApplied,
    },
  };
}