// @altos/memory - Memory provider factory

import type { MemoryProvider, MemoryProviderType } from "./MemoryProvider.js";
import { LocalMemoryProvider } from "./LocalMemoryProvider.js";
import { HermesMemoryProvider } from "./HermesMemoryProvider.js";
import { MemplaceMemoryProvider } from "./MemplaceMemoryProvider.js";
import { CodeGraphMemoryProvider } from "./CodeGraphMemoryProvider.js";

/**
 * Registry of memory provider classes.
 */
const PROVIDER_CLASSES: Record<MemoryProviderType, new (projectRoot?: string) => MemoryProvider> = {
  local: LocalMemoryProvider,
  hermes: HermesMemoryProvider,
  memplace: MemplaceMemoryProvider,
  codegraph: CodeGraphMemoryProvider,
};

/**
 * Create a memory provider instance by type.
 *
 * @param type - The provider type to create
 * @param projectRoot - Optional project root for local providers
 * @returns A new memory provider instance (not yet initialized)
 */
export function createMemoryProvider(
  type: MemoryProviderType,
  projectRoot?: string,
): MemoryProvider {
  const ProviderClass = PROVIDER_CLASSES[type];
  if (!ProviderClass) {
    throw new Error(`Unknown memory provider type: ${type}`);
  }
  return new ProviderClass(projectRoot);
}

/**
 * Singleton provider instance for the current process.
 * This ensures we don't create multiple providers for the same config.
 */
let singletonProvider: MemoryProvider | null = null;
let singletonType: MemoryProviderType | null = null;
let singletonProjectRoot: string | undefined = undefined;

/**
 * Get or create a singleton memory provider.
 *
 * @param type - The provider type to use
 * @param projectRoot - Optional project root for local providers
 * @returns The initialized singleton provider
 */
export async function getMemoryProvider(
  type: MemoryProviderType,
  projectRoot?: string,
): Promise<MemoryProvider> {
  // Create new provider if type or project root changed
  if (!singletonProvider || singletonType !== type || singletonProjectRoot !== projectRoot) {
    if (singletonProvider) {
      await singletonProvider.close();
    }
    singletonProvider = createMemoryProvider(type, projectRoot);
    singletonType = type;
    singletonProjectRoot = projectRoot;
    await singletonProvider.initialize();
  }
  return singletonProvider;
}

/**
 * Reset the singleton provider.
 * Mainly useful for testing.
 */
export async function resetMemoryProvider(): Promise<void> {
  if (singletonProvider) {
    await singletonProvider.close();
    singletonProvider = null;
    singletonType = null;
    singletonProjectRoot = undefined;
  }
}
