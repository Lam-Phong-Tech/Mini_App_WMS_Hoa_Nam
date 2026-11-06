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
public enum NfcRules {
    public static func hardwareUID(_ identifier: Data,
                                   order: NfcIdentifierOrder = .discoveryOrder) throws -> String {
        guard !identifier.isEmpty else {
            throw NfcFailure("NFC_UID_UNAVAILABLE", "Không đọc được UID phần cứng của thẻ.")
        }
        let bytes: [UInt8]
        switch order {
        case .discoveryOrder: bytes = Array(identifier)
        case .coreNfcISO15693: bytes = Array(identifier.reversed())
        }
        return bytes.map { String(format: "%02X", $0) }.joined()
    }

    public static func textRecord(_ payload: String) throws -> NfcRecord {
        guard !payload.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw NfcFailure("NFC_EMPTY_PAYLOAD", "Dữ liệu ghi NFC trống.")
        }
        var bytes = Data([0x02, 0x76, 0x69])
        bytes.append(contentsOf: payload.utf8)
        return NfcRecord(typeNameFormat: 1, type: Data([0x54]), payload: bytes)
    }

    public static func text(in record: NfcRecord) throws -> String? {
        guard record.typeNameFormat == 1, record.type == Data([0x54]),
              let status = record.payload.first else { return nil }
        let textOffset = 1 + Int(status & 0x3F)
        guard record.payload.count > textOffset else { return nil }
        let textBytes = record.payload.dropFirst(textOffset)
        return String(data: Data(textBytes), encoding: status & 0x80 == 0 ? .utf8 : .utf16)
    }

    public static func hasNdefData(_ records: [NfcRecord]) throws -> Bool {
        records.contains { $0.typeNameFormat != 0 }
    }

    public static func writeContext(payload: String, expectedUID: String,
                                    remainingMilliseconds: Double,
                                    nowUptime: TimeInterval) throws -> NfcWriteContext {
        let uidBytes = Array(expectedUID.utf8)
        let validUID = !uidBytes.isEmpty && uidBytes.count.isMultiple(of: 2) && uidBytes.allSatisfy {
            (0x30...0x39).contains($0) || (0x41...0x46).contains($0) || (0x61...0x66).contains($0)
        }
        let deadline = nowUptime + remainingMilliseconds / 1_000
        guard validUID, !payload.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              remainingMilliseconds.isFinite, remainingMilliseconds > 0,
              nowUptime.isFinite, deadline.isFinite else {
            throw NfcFailure("NFC_INVALID_WRITE_CONTEXT", "Thiếu UID hoặc giữ chỗ đã hết hạn; chưa ghi chip.")
        }
        return NfcWriteContext(expectedUID: expectedUID.uppercased(), deadlineUptime: deadline)
    }

    public static func validateIdentity(_ hardwareUID: String, context: NfcWriteContext,
                                        nowUptime: TimeInterval) throws {
        guard hardwareUID == context.expectedUID else {
            throw NfcFailure("NFC_WRONG_TAG", "Chip đang chạm khác UID đã kiểm tra; chưa ghi chip.")
        }
        guard nowUptime.isFinite, nowUptime < context.deadlineUptime else {
            throw NfcFailure("NFC_RESERVATION_EXPIRED", "Giữ chỗ đã hết hạn trước khi ghi chip; chưa ghi.")
        }
    }

    public static func validateExistingRecords(_ records: [NfcRecord],
                                               expectedPayload: String) throws {
        guard try hasNdefData(records) else { return }
        guard records.count == 1, try text(in: records[0]) == expectedPayload else {
            throw NfcFailure("NFC_TAG_NOT_EMPTY", "Chip đã có dữ liệu khác; không tự ghi đè.")
        }
    }

    public static func verifiedReadback(_ records: [NfcRecord],
                                        expectedPayload: String) throws -> String {
        for record in records {
            if let actual = try text(in: record) {
                guard actual == expectedPayload else {
                    throw NfcFailure("NFC_VERIFY_FAILED", "Nội dung đọc lại không khớp dữ liệu WMS.")
                }
                return actual
            }
        }
        throw NfcFailure("NFC_VERIFY_FAILED", "Đã ghi nhưng không đọc lại được nội dung thẻ NFC.")
    }
}
