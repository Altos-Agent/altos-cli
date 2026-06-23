// @altos/packages - Package registry

export interface Package {
  name: string;
  version: string;
  description?: string;
  author?: string;
  keywords?: string[];
  downloadUrl: string;
  checksum?: string;
}

export interface PackageRegistry {
  search(query: string, limit?: number): Promise<Package[]>;
  get(name: string): Promise<Package | undefined>;
  publish(pkg: Package): Promise<void>;
}

export class HttpRegistry implements PackageRegistry {
  constructor(public baseUrl: string) {}

  async search(_query: string, _limit = 10): Promise<Package[]> {
    // Placeholder - will call registry API
    return [];
  }

  async get(_name: string): Promise<Package | undefined> {
    return undefined;
  }

  async publish(_pkg: Package): Promise<void> {
    // Placeholder - will upload to registry
  }
}

export function createRegistry(url: string): PackageRegistry {
  return new HttpRegistry(url);
}

// Re-export manifest and loader types
export type {
  AltosPackageManifest,
  PackagePlugin,
  PackageSkill,
  PackagePrompt,
  PackageTheme,
  PackageMcpConfig,
  PackagePermission,
} from "./manifest.js";
export {
  loadAllPackages,
  findPackage,
  installPackage,
  removePackage,
  loadPackageFromPath,
  loadPackageFromGit,
  loadPackageFromNpm,
  getLocalPackagesDir,
  getGlobalPackagesDir,
  getInstalledPackagesDir,
  type LoadedPackage,
  type PackageLoaderOptions,
} from "./loader/index.js";
