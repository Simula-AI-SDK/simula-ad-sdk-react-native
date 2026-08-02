#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(SimulaNativeAdViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(adUnitId, NSString)
RCT_EXPORT_VIEW_PROPERTY(adPosition, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(theme, NSString)
RCT_EXPORT_VIEW_PROPERTY(extraParametersJson, NSString)
RCT_EXPORT_VIEW_PROPERTY(preloadedAdId, NSString)
RCT_EXPORT_VIEW_PROPERTY(previewHtml, NSString)

RCT_EXPORT_VIEW_PROPERTY(onAdSizeChange, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onAdImpression, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onAdClick, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onAdPaid, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onAdError, RCTDirectEventBlock)

@end
