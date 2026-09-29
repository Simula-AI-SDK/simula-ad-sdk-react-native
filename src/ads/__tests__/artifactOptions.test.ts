import { SimulaAds } from '../SimulaAds';
import { normalizeArtifactOptions } from '../../internal/artifactOptions';
import { resetAcceptedInitializationForTests } from '../../internal/initializationState';
import { NativeModules } from '../../test/reactNativeMock';

beforeEach(() => { resetAcceptedInitializationForTests(); jest.clearAllMocks(); });

test('only explicit boolean true crosses the bridge', () => {
  expect(normalizeArtifactOptions({ hidePlayableCompanion: true })).toEqual({ hidePlayableCompanion: true });
  for (const value of [false, undefined, 'true', 1, null]) {
    expect(normalizeArtifactOptions({ hidePlayableCompanion: value as boolean })).toEqual({});
  }
});

test('the option is independent of session mode and API environment', async () => {
  await SimulaAds.initialize({ apiKey: 'key', devMode: false, hidePlayableCompanion: true });
  expect(NativeModules.SimulaAdsModule.initialize).toHaveBeenCalledWith(expect.objectContaining({
    hidePlayableCompanion: true, devMode: false, apiEnvironment: 'production',
  }));
});

test('same process cannot switch the option after initialization', async () => {
  await SimulaAds.initialize({ apiKey: 'key', hidePlayableCompanion: true });
  await SimulaAds.initialize({ apiKey: 'key', hidePlayableCompanion: true });
  await expect(SimulaAds.initialize({ apiKey: 'key', hidePlayableCompanion: false })).rejects.toMatchObject({ code: 'INITIALIZATION_CONFLICT' });
  expect(NativeModules.SimulaAdsModule.initialize).toHaveBeenCalledTimes(2);
});
