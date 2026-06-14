#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(SimulaMiniGameButtonViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(text, NSString)
RCT_EXPORT_VIEW_PROPERTY(showPulsate, BOOL)
RCT_EXPORT_VIEW_PROPERTY(showBadge, BOOL)
RCT_EXPORT_VIEW_PROPERTY(theme, NSDictionary)

RCT_EXPORT_VIEW_PROPERTY(onButtonPress, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onButtonSizeChange, RCTDirectEventBlock)

@end
