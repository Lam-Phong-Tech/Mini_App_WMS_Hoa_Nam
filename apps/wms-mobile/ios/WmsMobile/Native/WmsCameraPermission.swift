import Foundation
import AVFoundation
import React

@objc(WmsCameraPermission)
final class WmsCameraPermission: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }
  private func status() -> String {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: return "authorized"
    case .notDetermined: return "notDetermined"
    case .denied: return "denied"
    case .restricted: return "restricted"
    @unknown default: return "restricted"
    }
  }
  @objc(getStatus:rejecter:)
  func getStatus(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) { resolve(status()) }
  @objc(request:rejecter:)
  func request(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined else { resolve(self.status()); return }
      AVCaptureDevice.requestAccess(for: .video) { _ in resolve(self.status()) }
    }
  }
}
