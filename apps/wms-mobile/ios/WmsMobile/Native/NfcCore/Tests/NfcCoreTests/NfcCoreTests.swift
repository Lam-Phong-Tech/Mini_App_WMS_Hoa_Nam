import Foundation
import XCTest
@testable import NfcCore

final class NfcCoreTests: XCTestCase {
    // Catches dropped leading zeroes, signed-byte formatting, and lowercase UIDs.
    func testHardwareUIDPreservesEveryDiscoveryByteAsUppercaseHex() throws {
        XCTAssertEqual(try NfcRules.hardwareUID(Data([0x00, 0x04, 0x80, 0xAB, 0xFF])), "000480ABFF")
    }

    // CoreNFC ISO15693 identifiers are big endian; Android Tag.id exposes the
    // discovery UID in reverse byte order. Backend identities must stay aligned.
    func testISO15693UIDUsesExistingAndroidByteOrder() throws {
        let coreNfcIdentifier = Data([0xE0, 0x04, 0x01, 0x23, 0x45, 0x67, 0x89, 0x00])
        XCTAssertEqual(try NfcRules.hardwareUID(coreNfcIdentifier, order: .coreNfcISO15693),
                       "00896745230104E0")
    }

    func testMissingHardwareUIDIsAnErrorInsteadOfSyntheticIdentity() {
        assertFailure("NFC_UID_UNAVAILABLE") { try NfcRules.hardwareUID(Data()) }
    }

    // Literal bytes are status 2, language vi, then UTF-8 for 'WMS:đỏ'.
    func testTextWriteProducesVietnameseUTF8WellKnownRecord() throws {
        let record = try NfcRules.textRecord("WMS:đỏ")
        XCTAssertEqual(record.typeNameFormat, 1)
        XCTAssertEqual(record.type, Data([0x54]))
        XCTAssertEqual(record.payload, Data([0x02, 0x76, 0x69, 0x57, 0x4D, 0x53, 0x3A,
                                           0xC4, 0x91, 0xE1, 0xBB, 0x8F]))
    }

    func testEmptyTextWriteIsRejected() {
        assertFailure("NFC_EMPTY_PAYLOAD") { try NfcRules.textRecord(" \n\t ") }
    }

    func testReadDecodesUTF8TextWithoutLanguagePrefix() throws {
        let record = textRecord([0x02, 0x65, 0x6E, 0x41, 0x42, 0x43])
        XCTAssertEqual(try NfcRules.text(in: record), "ABC")
    }

    func testReadDecodesUTF16TextWithByteOrderMark() throws {
        let record = textRecord([0x82, 0x76, 0x69, 0xFE, 0xFF, 0x00, 0x41, 0x01, 0x11])
        XCTAssertEqual(try NfcRules.text(in: record), "Ađ")
    }

    func testReadIgnoresNonTextNdefRecords() throws {
        let uriRecord = NfcRecord(typeNameFormat: 1, type: Data([0x55]), payload: Data([0x00, 0x41]))
        let mimeRecord = NfcRecord(typeNameFormat: 2, type: Data([0x54]), payload: Data([0x00, 0x41]))
        XCTAssertNil(try NfcRules.text(in: uriRecord))
        XCTAssertNil(try NfcRules.text(in: mimeRecord))
    }

    func testReadIgnoresTruncatedOrInvalidUTF8TextPayloads() throws {
        let payloads: [[UInt8]] = [[], [0x02], [0x02, 0x76, 0x69], [0x02, 0x76, 0x69, 0xFF]]
        for payload in payloads {
            XCTAssertNil(try NfcRules.text(in: textRecord(payload)))
        }
    }

    func testNdefDataFlagCountsUnsupportedRecordsWithoutTreatingEmptyRecordsAsData() throws {
        let empty = NfcRecord(typeNameFormat: 0, type: Data(), payload: Data())
        let uri = NfcRecord(typeNameFormat: 1, type: Data([0x55]), payload: Data([0x01, 0x41]))
        XCTAssertFalse(try NfcRules.hasNdefData([]))
        XCTAssertFalse(try NfcRules.hasNdefData([empty]))
        XCTAssertTrue(try NfcRules.hasNdefData([empty, uri]))
    }

    func testWriteContextNormalizesExpectedUIDAndUsesMonotonicMilliseconds() throws {
        let context = try NfcRules.writeContext(payload: "WMS:1", expectedUID: "00aB04",
                                                remainingMilliseconds: 1_250, nowUptime: 100)
        XCTAssertEqual(context.expectedUID, "00AB04")
        XCTAssertEqual(context.deadlineUptime, 101.25, accuracy: 0.000_001)
    }

    func testWriteContextRejectsMissingOrMalformedExpectedIdentity() {
        for uid in ["", " ", "AB:C0", "0", "GG01"] {
            assertFailure("NFC_INVALID_WRITE_CONTEXT") {
                try NfcRules.writeContext(payload: "WMS:1", expectedUID: uid,
                                          remainingMilliseconds: 10, nowUptime: 1)
            }
        }
    }

    func testWriteContextRejectsEmptyPayloadAndExpiredOrNonFiniteTTL() {
        assertFailure("NFC_INVALID_WRITE_CONTEXT") {
            try NfcRules.writeContext(payload: "\n ", expectedUID: "00AB",
                                      remainingMilliseconds: 10, nowUptime: 1)
        }
        for ttl in [0.0, -1.0, Double.infinity, -Double.infinity, Double.nan] {
            assertFailure("NFC_INVALID_WRITE_CONTEXT") {
                try NfcRules.writeContext(payload: "WMS:1", expectedUID: "00AB",
                                          remainingMilliseconds: ttl, nowUptime: 1)
            }
        }
    }

    func testWrongHardwareIdentityIsRejectedBeforeWrite() {
        let context = NfcWriteContext(expectedUID: "00AB", deadlineUptime: 10)
        assertFailure("NFC_WRONG_TAG") {
            try NfcRules.validateIdentity("00AC", context: context, nowUptime: 9)
        }
    }

    func testMatchingHardwareIdentityCanProceedBeforeDeadline() throws {
        let context = NfcWriteContext(expectedUID: "00AB", deadlineUptime: 10)
        try NfcRules.validateIdentity("00AB", context: context, nowUptime: 9.999)
    }

    func testReservationDeadlineIsExclusiveAndRecheckedBeforeWriting() {
        let context = NfcWriteContext(expectedUID: "00AB", deadlineUptime: 10)
        for now in [10.0, 10.001] {
            assertFailure("NFC_RESERVATION_EXPIRED") {
                try NfcRules.validateIdentity("00AB", context: context, nowUptime: now)
            }
        }
    }

    func testEmptyTagAndSingleMatchingTextAreSafeForAssignmentWrite() throws {
        let empty = NfcRecord(typeNameFormat: 0, type: Data(), payload: Data())
        try NfcRules.validateExistingRecords([], expectedPayload: "ABC")
        try NfcRules.validateExistingRecords([empty], expectedPayload: "ABC")
        try NfcRules.validateExistingRecords([textRecord([0x02, 0x76, 0x69, 0x41, 0x42, 0x43])],
                                            expectedPayload: "ABC")
    }

    func testExistingDifferentOrAdditionalDataIsNeverSilentlyOverwritten() {
        let same = textRecord([0x02, 0x76, 0x69, 0x41, 0x42, 0x43])
        let other = textRecord([0x02, 0x76, 0x69, 0x58])
        let uri = NfcRecord(typeNameFormat: 1, type: Data([0x55]), payload: Data([0x01, 0x41]))
        for records in [[other], [uri], [same, same]] {
            assertFailure("NFC_TAG_NOT_EMPTY") {
                try NfcRules.validateExistingRecords(records, expectedPayload: "ABC")
            }
        }
    }

    func testWriteResultUsesPayloadActuallyReadBackFromChip() throws {
        let actual = try NfcRules.verifiedReadback([textRecord([0x02, 0x76, 0x69, 0x41, 0x42, 0x43])],
                                                  expectedPayload: "ABC")
        XCTAssertEqual(actual, "ABC")
    }

    func testMissingOrDifferentReadbackCannotConfirmWrite() {
        for records in [[], [textRecord([0x02, 0x76, 0x69, 0x58])]] {
            assertFailure("NFC_VERIFY_FAILED") {
                try NfcRules.verifiedReadback(records, expectedPayload: "ABC")
            }
        }
    }

    private func textRecord(_ payload: [UInt8]) -> NfcRecord {
        NfcRecord(typeNameFormat: 1, type: Data([0x54]), payload: Data(payload))
    }

    private func assertFailure<T>(_ code: String, file: StaticString = #filePath, line: UInt = #line,
                                  _ body: () throws -> T) {
        XCTAssertThrowsError(try body(), file: file, line: line) { error in
            XCTAssertEqual((error as? NfcFailure)?.code, code, file: file, line: line)
        }
    }
}
