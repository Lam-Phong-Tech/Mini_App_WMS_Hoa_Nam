import Foundation
import Security

public enum WmsSecurityError: Error, Equatable {
    case emptyRefreshToken
    case invalidStoredToken
    case keychainFailure(OSStatus)
    case entropyFailure(OSStatus)
}

public final class WmsKeychainRefreshTokenStore {
    private let service: String
    private let account: String

    public init(
        service: String = "vn.info.lptech.wmshoanam.secure-session.v1",
        account: String = "refresh_token.v1"
    ) {
        self.service = service
        self.account = account
    }

    public func getRefreshToken() throws -> String? {
        var query = itemQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else {
            throw WmsSecurityError.keychainFailure(status)
        }
        guard let data = result as? Data,
              let token = String(data: data, encoding: .utf8),
              !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw WmsSecurityError.invalidStoredToken
        }
        return token
    }

    public func setRefreshToken(_ token: String) throws {
        guard !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw WmsSecurityError.emptyRefreshToken
        }
        let attributes: [String: Any] = [
            kSecValueData as String: Data(token.utf8),
            // Device-bound and unavailable while locked; never synchronized
            // to iCloud or restored as a credential onto another device.
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]
        var item = itemQuery
        for (key, value) in attributes { item[key] = value }

        let status = SecItemAdd(item as CFDictionary, nil)
        if status == errSecSuccess { return }
        guard status == errSecDuplicateItem else {
            throw WmsSecurityError.keychainFailure(status)
        }
        let updateStatus = SecItemUpdate(itemQuery as CFDictionary, attributes as CFDictionary)
        guard updateStatus == errSecSuccess else {
            throw WmsSecurityError.keychainFailure(updateStatus)
        }
    }

    public func clearRefreshToken() throws {
        let status = SecItemDelete(itemQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw WmsSecurityError.keychainFailure(status)
        }
    }

    private var itemQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: false,
        ]
    }
}

public struct WmsRecoveryIdentity {
    public let operationId: String
    public let proof: String
}

public final class WmsRecoveryEntropy {
    private let copyRandomBytes: (Int, UnsafeMutableRawPointer) -> OSStatus

    public convenience init() {
        self.init(copyRandomBytes: { count, output in
            SecRandomCopyBytes(kSecRandomDefault, count, output)
        })
    }

    // Injectable OS boundary permits verification of entropy failure without
    // relying on an actual system random generator failure.
    init(copyRandomBytes: @escaping (Int, UnsafeMutableRawPointer) -> OSStatus) {
        self.copyRandomBytes = copyRandomBytes
    }

    public func createIdentity() throws -> WmsRecoveryIdentity {
        // 16 independent random bytes for the operation UUID, then 32 for
        // the read capability. No identity is returned after an OS failure.
        var bytes = [UInt8](repeating: 0, count: 48)
        let status = bytes.withUnsafeMutableBytes { buffer in
            copyRandomBytes(buffer.count, buffer.baseAddress!)
        }
        guard status == errSecSuccess else {
            throw WmsSecurityError.entropyFailure(status)
        }
        bytes[6] = (bytes[6] & 0x0f) | 0x40
        bytes[8] = (bytes[8] & 0x3f) | 0x80
        let uuid = UUID(uuid: (
            bytes[0], bytes[1], bytes[2], bytes[3],
            bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11],
            bytes[12], bytes[13], bytes[14], bytes[15]
        ))
        let proof = Data(bytes[16..<48]).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return WmsRecoveryIdentity(operationId: uuid.uuidString.lowercased(), proof: proof)
    }
}
