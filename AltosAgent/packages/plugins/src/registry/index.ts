// @altos/plugins - Registry barrel

export type {
  DiscoveredPlugin,
  PluginSource,
  PluginState,
  PluginStatus,
} from "../index.js";

export {
  PluginConfigStore,
  discoverPlugins,
  getLocalPluginPath,
  getGlobalPluginPath,
} from "../loader/index.js";
