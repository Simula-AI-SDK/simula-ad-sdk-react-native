import { NativeModules } from 'react-native';
import { SimulaGameCatalog } from '../SimulaGameCatalog';

const config = { apiKey: 'demo', apiEnvironment: 'staging' as const, primaryUserID: 'tester' };
const play = { ...config, menuId: 'simula-menu', gameId: 'chess__exp', companionEnabled: false, charId: 'leon', charName: 'Leon', charImage: '' };

beforeEach(() => {
  NativeModules.SimulaGameCatalogModule = {
    fetchCatalog: jest.fn().mockResolvedValue({ menuId: 'simula-menu', games: [] }),
    showCatalogGame: jest.fn().mockResolvedValue(undefined), hideCatalogGame: jest.fn(),
  };
});

test('passes launch-specific environment, companion and exact game identity', async () => {
  await SimulaGameCatalog.fetch(config);
  await SimulaGameCatalog.play(play);
  expect(NativeModules.SimulaGameCatalogModule.fetchCatalog).toHaveBeenCalledWith(config);
  expect(NativeModules.SimulaGameCatalogModule.showCatalogGame).toHaveBeenCalledWith(play);
});

test('preserves native expiry errors for caller recovery', async () => {
  NativeModules.SimulaGameCatalogModule.showCatalogGame.mockRejectedValue({ code: 'HTTP_410' });
  await expect(SimulaGameCatalog.play(play)).rejects.toEqual({ code: 'HTTP_410' });
});

test('fails clearly on older native binaries', async () => {
  delete NativeModules.SimulaGameCatalogModule;
  await expect(SimulaGameCatalog.fetch(config)).rejects.toMatchObject({ code: 'CATALOG_UNAVAILABLE' });
  expect(() => SimulaGameCatalog.dismiss()).not.toThrow();
});

test('rejects invalid game identity before making a native call', async () => {
  await expect(SimulaGameCatalog.play({ ...play, gameId: ' ' })).rejects.toThrow();
  expect(NativeModules.SimulaGameCatalogModule.showCatalogGame).not.toHaveBeenCalled();
});

test('does not add a companion override when the caller leaves it out', async () => {
  const { companionEnabled: _, ...backendPolicy } = play;
  await SimulaGameCatalog.play(backendPolicy);
  expect(NativeModules.SimulaGameCatalogModule.showCatalogGame).toHaveBeenCalledWith(backendPolicy);
  expect(NativeModules.SimulaGameCatalogModule.showCatalogGame.mock.calls[0][0]).not.toHaveProperty('companionEnabled');
});
