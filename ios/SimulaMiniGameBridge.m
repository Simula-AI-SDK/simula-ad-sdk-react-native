#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(SimulaMiniGameModule, RCTEventEmitter)

RCT_EXTERN_METHOD(showMiniGameMenu:(NSDictionary *)props)
RCT_EXTERN_METHOD(hideMiniGameMenu)

@end
