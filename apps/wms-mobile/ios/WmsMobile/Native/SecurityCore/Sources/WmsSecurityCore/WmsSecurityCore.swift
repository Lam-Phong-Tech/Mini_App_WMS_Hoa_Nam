import Foundation
import Security

public enum WmsSecurityError: Error, Equatable {
    case notImplemented
    case emptyRefreshToken
    case invalidStoredToken
    case keychainFailure(OSStatus)
    case entropyFailure(OSStatus)
}

public final class WmsKeychainRefreshTokenStore {
    public init(
        service: String = "vn.info.lptech.wmshoanam.secure-session.v1",
        account: String = "refresh_token.v1"
    ) {}

    public func getRefreshToken() throws -> String? {
        throw WmsSecurityError.notImplemented
    }

    public func setRefreshToken(_ token: String) throws {
        throw WmsSecurityError.notImplemented
    }

    public func clearRefreshToken() throws {
        throw WmsSecurityError.notImplemented
    }
}

public struct WmsRecoveryIdentity {
    public let operationId: String
    public let proof: String
}

public final class WmsRecoveryEntropy {
    public init() {}

    // Injectable OS boundary permits verification of entropy failure without
    // relying on an actual system random generator failure.
    init(copyRandomBytes: @escaping (Int, UnsafeMutableRawPointer) -> OSStatus) {}

    public func createIdentity() throws -> WmsRecoveryIdentity {
        throw WmsSecurityError.notImplemented
    }
}
