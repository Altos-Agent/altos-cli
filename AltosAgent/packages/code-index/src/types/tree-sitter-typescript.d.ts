declare module "tree-sitter-typescript/typescript" {
  export const TypeScript: { name: string };
}

declare module "tree-sitter-typescript/bindings/node/typescript.js" {
  import type { Language } from "tree-sitter";
  const TypeScript: Language;
  export default TypeScript;
}
