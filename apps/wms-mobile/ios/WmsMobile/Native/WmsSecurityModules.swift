import Foundation
import React

@objc(WmsSecureSession)
final class WmsSecureSession: NSObject {
    private let store = WmsKeychainRefreshTokenStore()
    // The native boundary serializes reads and mutations as well as the JS
    // credential queue, so a clear cannot race a write inside this module.
    private let queue = DispatchQueue(label: "vn.info.lptech.wmshoanam.secure-session")

    @objc static func requiresMainQueueSetup() -> Bool { false }

    @objc(getRefreshToken:rejecter:)
    func getRefreshToken(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async {
            do {
                resolve(try self.store.getRefreshToken())
            } catch {
                reject("SECURE_REFRESH_UNREADABLE", "Không đọc được phiên bảo mật. Đăng nhập lại.", error)
            }
        }
    }

    @objc(setRefreshToken:resolver:rejecter:)
    func setRefreshToken(
        _ token: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async {
            do {
                try self.store.setRefreshToken(token)
                resolve(nil)
            } catch WmsSecurityError.emptyRefreshToken {
                reject("SECURE_REFRESH_EMPTY", "Refresh token trống.", nil)
            } catch {
                reject("SECURE_REFRESH_WRITE_FAILED", "Không lưu được phiên bảo mật.", error)
            }
        }
    }

    @objc(clearRefreshToken:rejecter:)
    func clearRefreshToken(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async {
            do {
                try self.store.clearRefreshToken()
                resolve(nil)
            } catch {
                reject("SECURE_REFRESH_CLEAR_FAILED", "Không xoá được phiên bảo mật.", error)
            }
        }
    }
}

@objc(P14RecoveryEntropy)
final class P14RecoveryEntropy: NSObject {
    private let entropy = WmsRecoveryEntropy()
    private let queue = DispatchQueue(label: "vn.info.lptech.wmshoanam.recovery-entropy")

    @objc static func requiresMainQueueSetup() -> Bool { false }

    @objc(createIdentity:rejecter:)
    func createIdentity(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        queue.async {
            do {
                let identity = try self.entropy.createIdentity()
                resolve(["operationId": identity.operationId, "proof": identity.proof])
            } catch {
                reject("RECOVERY_ENTROPY_UNAVAILABLE", "Không tạo được mã bảo vệ yêu cầu.", error)
            }
        }
    }
}
