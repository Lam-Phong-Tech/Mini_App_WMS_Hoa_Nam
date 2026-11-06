import Foundation

public struct NfcFailure: Error, Equatable, LocalizedError {
    public let code: String
    public let message: String

    public init(_ code: String, _ message: String) {
        self.code = code
        self.message = message
    }

    public var errorDescription: String? { message }
}

public enum NfcIdentifierOrder {
    case discoveryOrder
    case coreNfcISO15693
}

public struct NfcRecord: Equatable {
    public let typeNameFormat: UInt8
    public let type: Data
    public let payload: Data

    public init(typeNameFormat: UInt8, type: Data, payload: Data) {
        self.typeNameFormat = typeNameFormat
        self.type = type
        self.payload = payload
    }
}

public struct NfcWriteContext {
    public let expectedUID: String
    public let deadlineUptime: TimeInterval

    public init(expectedUID: String, deadlineUptime: TimeInterval) {
        self.expectedUID = expectedUID
        self.deadlineUptime = deadlineUptime
    }
}

/// Foundation-only boundary rules shared by CoreNFC and the macOS package tests.
/// The throwing bodies are intentional RED-stage stubs, pending macOS execution.
public enum NfcRules {
    public static func hardwareUID(_ identifier: Data,
                                   order: NfcIdentifierOrder = .discoveryOrder) throws -> String {
        throw NfcFailure("NFC_NOT_IMPLEMENTED", "NFC helper implementation pending RED verification.")
    }

    public static func textRecord(_ payload: String) throws -> NfcRecord {
        throw NfcFailure("NFC_NOT_IMPLEMENTED", "NFC helper implementation pending RED verification.")
    }

    public static func text(in record: NfcRecord) throws -> String? {
        throw NfcFailure("NFC_NOT_IMPLEMENTED", "NFC helper implementation pending RED verification.")
    }

    public static func hasNdefData(_ records: [NfcRecord]) throws -> Bool {
        throw NfcFailure("NFC_NOT_IMPLEMENTED", "NFC helper implementation pending RED verification.")
    }

    public static func writeContext(payload: String, expectedUID: String,
                                    remainingMilliseconds: Double,
                                    nowUptime: TimeInterval) throws -> NfcWriteContext {
        throw NfcFailure("NFC_NOT_IMPLEMENTED", "NFC helper implementation pending RED verification.")
    }

    public static func validateIdentity(_ hardwareUID: String, context: NfcWriteContext,
                                        nowUptime: TimeInterval) throws {
        throw NfcFailure("NFC_NOT_IMPLEMENTED", "NFC helper implementation pending RED verification.")
    }

    public static func validateExistingRecords(_ records: [NfcRecord],
                                               expectedPayload: String) throws {
        throw NfcFailure("NFC_NOT_IMPLEMENTED", "NFC helper implementation pending RED verification.")
    }

    public static func verifiedReadback(_ records: [NfcRecord],
                                        expectedPayload: String) throws -> String {
        throw NfcFailure("NFC_NOT_IMPLEMENTED", "NFC helper implementation pending RED verification.")
    }
}
