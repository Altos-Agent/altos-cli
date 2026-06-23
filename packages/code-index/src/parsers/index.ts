// Re-export all parsers to ensure registration
// Import order matters for auto-registration side effects

export { parserRegistry, LanguageParserRegistry } from "./registry.js";
export type { LanguageParser, ParserCapabilities, ParsedFile } from "./registry.js";

import "./python-parser.js";
import "./go-parser.js";
import "./rust-parser.js";