import { NativeModules } from 'react-native';
import type { SimulaAPIEnvironment } from '../ads/SimulaAds';

export type CatalogConfiguration = {
  apiKey: string;
  apiEnvironment: SimulaAPIEnvironment;
  primaryUserID?: string;
};

export type CatalogGame = { id: string; name: string };
export type GameCatalog = { menuId: string; games: CatalogGame[] };
export type CatalogPlayOptions = CatalogConfiguration & {
  menuId: string;
  gameId: string;
  /** Per-launch preview, subject to backend publisher/environment policy. Omit to retain defaults. */
  companionEnabled?: boolean;
  charId: string;
  charName: string;
  charImage: string;
  charDesc?: string;
};

function nativeCatalog() {
  const native = NativeModules.SimulaGameCatalogModule;
  if (!native) {
    throw Object.assign(new Error('Rebuild the app with catalog-capable native SDKs.'), { code: 'CATALOG_UNAVAILABLE' });
  }
  return native;
}

function validateConfiguration(config: CatalogConfiguration) {
  if (!config.apiKey.trim() || !['staging', 'production'].includes(config.apiEnvironment)) {
    throw new Error('Invalid catalog configuration');
  }
}

/** Catalog launches have their own environment and session; the host ad SDK stays configured. */
export const SimulaGameCatalog = {
  async fetch(config: CatalogConfiguration): Promise<GameCatalog> {
    validateConfiguration(config);
    return nativeCatalog().fetchCatalog(config);
  },

  /** Resolves after the native player closes. Rejects before presentation on init failure. */
  async play(options: CatalogPlayOptions): Promise<void> {
    validateConfiguration(options);
    if (!options.menuId.trim() || !options.gameId.trim()) throw new Error('A catalog menu and game are required');
    await nativeCatalog().showCatalogGame(options);
  },

  dismiss(): void {
    NativeModules.SimulaGameCatalogModule?.hideCatalogGame();
  },
};
