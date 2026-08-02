#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(SimulaAdsModule, RCTEventEmitter)

// ── Lifecycle ───────────────────────────────────────────────────────────────
RCT_EXTERN_METHOD(initialize:(NSDictionary *)config
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(isInitialized:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(updateContext:(NSDictionary *)context)
RCT_EXTERN_METHOD(updatePrimaryUserID:(NSString *)id)
RCT_EXTERN_METHOD(checkFrequencyCap:(NSString *)adUnitId
                  primaryUserID:(NSString *)primaryUserID
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getUserAgent:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getDeviceId:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// ── Native ad (imperative) ────────────────────────────────────────────────────
RCT_EXTERN_METHOD(preloadNativeAd:(NSString *)adUnitId
                  position:(nonnull NSNumber *)position
                  theme:(NSString *)theme
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(destroyPreloadedAd:(NSString *)preloadedAdId)
RCT_EXTERN_METHOD(invalidateNativeAd:(NSString *)adUnitId
                  position:(nonnull NSNumber *)position)
RCT_EXTERN_METHOD(invalidateNativeAds)

// ── Imperative ads ──────────────────────────────────────────────────────────
RCT_EXTERN_METHOD(createInterstitial:(NSString *)instanceId
                  adUnitId:(NSString *)adUnitId)
RCT_EXTERN_METHOD(createRewarded:(NSString *)instanceId
                  adUnitId:(NSString *)adUnitId)
RCT_EXTERN_METHOD(setExtraParameter:(NSString *)instanceId
                  key:(NSString *)key
                  value:(NSString *)value)
RCT_EXTERN_METHOD(setExtraParameters:(NSString *)instanceId
                  parametersJson:(NSString *)parametersJson)
RCT_EXTERN_METHOD(loadAd:(NSString *)instanceId
                  options:(NSDictionary *)options)
RCT_EXTERN_METHOD(showAd:(NSString *)instanceId)
RCT_EXTERN_METHOD(showAdPreview:(NSString *)instanceId
                  options:(NSDictionary *)options)
RCT_EXTERN_METHOD(destroyAd:(NSString *)instanceId)

// ── Privacy ─────────────────────────────────────────────────────────────────
RCT_EXTERN_METHOD(applyConsent:(NSDictionary *)config)
RCT_EXTERN_METHOD(updateConsent:(NSDictionary *)partial)
RCT_EXTERN_METHOD(clearConsent:(NSDictionary *)flags)
RCT_EXTERN_METHOD(requestTrackingAuthorization:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getTrackingAuthorizationStatus:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
