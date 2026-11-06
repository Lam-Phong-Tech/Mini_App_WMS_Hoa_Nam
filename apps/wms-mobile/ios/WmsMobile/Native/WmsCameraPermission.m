#import <React/RCTBridgeModule.h>
@interface RCT_EXTERN_MODULE(WmsCameraPermission, NSObject)
RCT_EXTERN_METHOD(getStatus:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(request:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
