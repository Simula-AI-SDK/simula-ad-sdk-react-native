#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SimulaGameCatalogModule, NSObject)
RCT_EXTERN_METHOD(fetchCatalog:(NSDictionary *)props resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(showCatalogGame:(NSDictionary *)props resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(hideCatalogGame)
@end
