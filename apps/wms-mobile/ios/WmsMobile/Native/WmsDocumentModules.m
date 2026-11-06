#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(P12Documents, NSObject)
RCT_EXTERN_METHOD(save:(NSString *)base64 name:(NSString *)name mime:(NSString *)mime resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(open:(NSString *)uri resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(hashFile:(NSString *)uri resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(cancel)
@end

@interface RCT_EXTERN_MODULE(P18Preview, NSObject)
RCT_EXTERN_METHOD(open:(NSString *)base64 mime:(NSString *)mime resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(render:(NSString *)identifier page:(nonnull NSNumber *)page width:(nonnull NSNumber *)width resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(close:(NSString *)identifier)
@end
