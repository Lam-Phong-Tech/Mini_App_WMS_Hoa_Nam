import Foundation
import Security
import XCTest
@testable import WmsSecurityCore

final class WmsKeychainRefreshTokenStoreTests: XCTestCase {
    private var service: String!
    private let account = "refresh_token.v1"

    override func setUpWithError() throws {
        try super.setUpWithError()
        // Every test owns a fresh namespace. Never read or delete app credentials.
        service = "vn.info.lptech.wmshoanam.security-tests.\(UUID().uuidString)"
    }

    override func tearDownWithError() throws {
        let status = SecItemDelete(query() as CFDictionary)
        XCTAssertTrue(status == errSecSuccess || status == errSecItemNotFound)
        service = nil
        try super.tearDownWithError()
    }

    func testMissingRefreshTokenReturnsNil() throws {
        XCTAssertNil(try store().getRefreshToken())
    }

    func testRefreshTokenPersistsAcrossStoreInstances() throws {
        let dummy = "dummy-\(UUID().uuidString)-phiên"
        try store().setRefreshToken(dummy)

        // Boolean comparison prevents even random dummy credentials in failures.
        XCTAssertTrue(try store().getRefreshToken() == dummy)
    }

    func testReplacingRefreshTokenKeepsOnlyLatestValue() throws {
        let initial = "dummy-initial-\(UUID().uuidString)"
        let replacement = "dummy-replacement-\(UUID().uuidString)"
        let subject = store()
        try subject.setRefreshToken(initial)
        try subject.setRefreshToken(replacement)

        XCTAssertTrue(try store().getRefreshToken() == replacement)
    }

    func testClearingRefreshTokenRemovesPersistedValueAndIsIdempotent() throws {
        let subject = store()
        try subject.setRefreshToken("dummy-\(UUID().uuidString)")
        try subject.clearRefreshToken()
        try subject.clearRefreshToken()

        XCTAssertNil(try store().getRefreshToken())
    }

    func testBlankRefreshTokenIsRejectedWithoutReplacingExistingCredential() throws {
        let dummy = "dummy-\(UUID().uuidString)"
        let subject = store()
        try subject.setRefreshToken(dummy)

        for blank in ["", " ", "\t\r\n"] {
            XCTAssertThrowsError(try subject.setRefreshToken(blank)) { error in
                XCTAssertEqual(error as? WmsSecurityError, .emptyRefreshToken)
            }
        }
        XCTAssertTrue(try store().getRefreshToken() == dummy)
    }

    func testMalformedStoredBytesFailInsteadOfReturningAnEmptySession() throws {
        var item = query()
        item[kSecValueData as String] = Data([0xff, 0xfe])
        XCTAssertEqual(SecItemAdd(item as CFDictionary, nil), errSecSuccess)

        XCTAssertThrowsError(try store().getRefreshToken()) { error in
            XCTAssertEqual(error as? WmsSecurityError, .invalidStoredToken)
        }
    }

    func testBlankStoredCredentialFailsInsteadOfReturningAnEmptySession() throws {
        var item = query()
        item[kSecValueData as String] = Data(" \n".utf8)
        XCTAssertEqual(SecItemAdd(item as CFDictionary, nil), errSecSuccess)

        XCTAssertThrowsError(try store().getRefreshToken()) { error in
            XCTAssertEqual(error as? WmsSecurityError, .invalidStoredToken)
        }
    }

    func testClearingOneAccountDoesNotRemoveAnotherAccount() throws {
        let otherAccount = "unrelated-test-account"
        let otherStore = WmsKeychainRefreshTokenStore(service: service, account: otherAccount)
        defer {
            var otherQuery = query()
            otherQuery[kSecAttrAccount as String] = otherAccount
            let status = SecItemDelete(otherQuery as CFDictionary)
            XCTAssertTrue(status == errSecSuccess || status == errSecItemNotFound)
        }
        let dummy = "dummy-unrelated-\(UUID().uuidString)"
        try otherStore.setRefreshToken(dummy)
        try store().setRefreshToken("dummy-target-\(UUID().uuidString)")

        try store().clearRefreshToken()

        XCTAssertTrue(try otherStore.getRefreshToken() == dummy)
    }

    private func store() -> WmsKeychainRefreshTokenStore {
        WmsKeychainRefreshTokenStore(service: service, account: account)
    }

    private func query() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service as String,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: false,
        ]
    }
}

final class WmsRecoveryEntropyTests: XCTestCase {
    func testIdentityContainsVersionFourUUIDAnd256BitBase64URLProof() throws {
        let identity = try WmsRecoveryEntropy().createIdentity()

        XCTAssertNotNil(UUID(uuidString: identity.operationId))
        XCTAssertNotNil(identity.operationId.range(
            of: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
            options: .regularExpression
        ))
        XCTAssertEqual(identity.proof.count, 43)
        XCTAssertNotNil(identity.proof.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression))
        let base64 = identity.proof.replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/") + "="
        XCTAssertEqual(Data(base64Encoded: base64)?.count, 32)
    }

    func testRepeatedIdentitiesNeverReuseOperationOrProof() throws {
        let subject = WmsRecoveryEntropy()
        var operationIds = Set<String>()
        var proofs = Set<String>()

        for _ in 0..<64 {
            let identity = try subject.createIdentity()
            XCTAssertTrue(operationIds.insert(identity.operationId).inserted)
            XCTAssertTrue(proofs.insert(identity.proof).inserted)
        }
    }

    func testBothUUIDAndProofComeFromTheSecureRandomSource() throws {
        let subject = WmsRecoveryEntropy(copyRandomBytes: { count, output in
            let bytes = output.assumingMemoryBound(to: UInt8.self)
            for index in 0..<count { bytes[index] = 0 }
            return errSecSuccess
        })

        let identity = try subject.createIdentity()

        XCTAssertEqual(identity.operationId, "00000000-0000-4000-8000-000000000000")
        XCTAssertTrue(identity.proof == String(repeating: "A", count: 43))
    }

    func testRandomGeneratorFailureThrowsInsteadOfCreatingAnIdentity() throws {
        let subject = WmsRecoveryEntropy(copyRandomBytes: { _, _ in errSecNotAvailable })

        XCTAssertThrowsError(try subject.createIdentity()) { error in
            XCTAssertEqual(error as? WmsSecurityError, .entropyFailure(errSecNotAvailable))
        }
    }
}
