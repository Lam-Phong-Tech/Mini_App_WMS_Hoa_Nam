#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WmsSecureSession, NSObject)
RCT_EXTERN_METHOD(getRefreshToken:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setRefreshToken:(NSString *)token
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(clearRefreshToken:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE(P14RecoveryEntropy, NSObject)
RCT_EXTERN_METHOD(createIdentity:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
