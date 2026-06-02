#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(SimulaMiniGameModule, RCTEventEmitter)

RCT_EXTERN_METHOD(showMiniGameMenu:(NSDictionary *)props
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(hideMiniGameMenu)
RCT_EXTERN_METHOD(showMiniGameButton:(NSDictionary *)props
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(hideMiniGameButton)
RCT_EXTERN_METHOD(showMiniGameInvitation:(NSDictionary *)props
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(hideMiniGameInvitation)
RCT_EXTERN_METHOD(showMiniGameInterstitial:(NSDictionary *)props
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(hideMiniGameInterstitial)
RCT_EXTERN_METHOD(preload:(NSDictionary *)props
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
