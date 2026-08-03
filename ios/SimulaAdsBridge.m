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
RCT_EXTERN_METHOD(updatePrimaryUserID:(NSString * _Nullable)id)
RCT_EXTERN_METHOD(checkFrequencyCap:(NSString * _Nullable)adUnitId
                  primaryUserID:(NSString * _Nullable)primaryUserID
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getUserAgent:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getDeviceId:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// ── Native ad (imperative) ────────────────────────────────────────────────────
RCT_EXTERN_METHOD(preloadNativeAd:(NSString * _Nullable)adUnitId
                  position:(nonnull NSNumber *)position
                  theme:(NSString * _Nullable)theme
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(destroyPreloadedAd:(NSString * _Nullable)preloadedAdId)
RCT_EXTERN_METHOD(invalidateNativeAd:(NSString * _Nullable)adUnitId
                  position:(nonnull NSNumber *)position)
RCT_EXTERN_METHOD(invalidateNativeAds)

// ── Imperative ads ──────────────────────────────────────────────────────────
RCT_EXTERN_METHOD(createInterstitial:(NSString * _Nonnull)instanceId
                  adUnitId:(NSString * _Nullable)adUnitId)
RCT_EXTERN_METHOD(createRewarded:(NSString * _Nonnull)instanceId
                  adUnitId:(NSString * _Nullable)adUnitId)
RCT_EXTERN_METHOD(setExtraParameter:(NSString * _Nonnull)instanceId
                  key:(NSString * _Nullable)key
                  value:(NSString * _Nullable)value)
RCT_EXTERN_METHOD(setExtraParameters:(NSString * _Nonnull)instanceId
                  parametersJson:(NSString * _Nullable)parametersJson)
RCT_EXTERN_METHOD(loadAd:(NSString * _Nonnull)instanceId
                  options:(NSDictionary *)options)
RCT_EXTERN_METHOD(showAd:(NSString * _Nonnull)instanceId)
RCT_EXTERN_METHOD(showAdPreview:(NSString * _Nonnull)instanceId
                  options:(NSDictionary *)options)
RCT_EXTERN_METHOD(destroyAd:(NSString * _Nonnull)instanceId)

// ── Privacy ─────────────────────────────────────────────────────────────────
RCT_EXTERN_METHOD(applyConsent:(NSDictionary *)config)
RCT_EXTERN_METHOD(updateConsent:(NSDictionary *)partial)
RCT_EXTERN_METHOD(clearConsent:(NSDictionary *)flags)
RCT_EXTERN_METHOD(requestTrackingAuthorization:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getTrackingAuthorizationStatus:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
