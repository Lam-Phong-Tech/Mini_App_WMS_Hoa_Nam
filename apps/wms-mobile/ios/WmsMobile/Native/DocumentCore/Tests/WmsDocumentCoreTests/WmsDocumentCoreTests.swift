import Foundation
import XCTest
@testable import WmsDocumentCore

final class WmsDocumentCoreTests: XCTestCase {
    private let pdf = Data("%PDF-fixture".utf8)
    private let id = "90000000-0000-4000-8000-000000000099"

    private func temporaryDirectory() throws -> URL {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return directory
    }

    private func assertError<T>(_ expected: WmsDocumentError, _ operation: () throws -> T,
                                file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertThrowsError(try operation(), file: file, line: line) {
            XCTAssertEqual($0 as? WmsDocumentError, expected, file: file, line: line)
        }
    }

    func testDecodesMatchingDocumentSignaturesWithoutChangingBytes() throws {
        let cases: [(String, Data)] = [
            ("application/pdf", pdf),
            ("image/png", Data([137, 80, 78, 71, 13, 10, 26, 10, 0])),
            ("image/jpeg", Data([255, 216, 255, 224])),
            ("image/webp", Data("RIFF1234WEBP".utf8))
        ]
        for (mime, data) in cases {
            XCTAssertEqual(try WmsDocumentCore.decode(data.base64EncodedString(), mime: mime, maxBytes: 64), data)
        }
    }

    func testRejectsUnsupportedMimeAndSignatureMismatch() {
        assertError(.invalidMime) { try WmsDocumentCore.decode(pdf.base64EncodedString(), mime: "text/html", maxBytes: 64) }
        assertError(.invalidPayload) { try WmsDocumentCore.decode(pdf.base64EncodedString(), mime: "image/png", maxBytes: 64) }
        assertError(.invalidPayload) { try WmsDocumentCore.decode("not base64", mime: "application/pdf", maxBytes: 64) }
    }

    func testEnforcesDecodedByteLimitIncludingExactBoundary() throws {
        XCTAssertEqual(try WmsDocumentCore.decode(pdf.base64EncodedString(), mime: "application/pdf", maxBytes: 12).count, 12)
        assertError(.fileTooLarge) { try WmsDocumentCore.decode(pdf.base64EncodedString(), mime: "application/pdf", maxBytes: 11) }
        assertError(.emptyFile) { try WmsDocumentCore.decode("", mime: "application/pdf", maxBytes: 12) }
    }

    func testFilenameCannotCreateSubdirectoriesAndKeepsVietnameseText() throws {
        XCTAssertEqual(try WmsDocumentCore.exportFilename("../../Hóa đơn.pdf", mime: "application/pdf"), "Hóa đơn.pdf")
        XCTAssertEqual(try WmsDocumentCore.exportFilename("C:\\temp\\receipt\n.pdf", mime: "application/pdf"), "receipt.pdf")
        XCTAssertEqual(try WmsDocumentCore.exportFilename("\u{0000}\n", mime: "image/png"), "chung-tu.png")
        XCTAssertEqual(try WmsDocumentCore.exportFilename("receipt.exe", mime: "application/pdf"), "receipt.exe.pdf")
    }

    func testFileURLAcceptsOnlyAbsoluteLocalFileURLs() throws {
        XCTAssertEqual(try WmsDocumentCore.fileURL("file:///tmp/H%C3%B3a%20%C4%91%C6%A1n.pdf").path, "/tmp/Hóa đơn.pdf")
        for value in ["https://example.invalid/a.pdf", "content://provider/a", "file://remote/tmp/a.pdf", "file:///tmp/a.pdf?token=secret", "file:///tmp/a.pdf#page=1", "/tmp/a.pdf", "file:relative.pdf"] {
            assertError(.invalidURL) { try WmsDocumentCore.fileURL(value) }
        }
    }

    func testHashReadsActualBytesAndMatchesKnownSHA256Vector() throws {
        let file = try temporaryDirectory().appendingPathComponent("source")
        try Data("abc".utf8).write(to: file)
        XCTAssertEqual(try WmsDocumentCore.hashFile(file), WmsDocumentDigest(
            sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", bytes: 3))
    }

    func testHashStreamsAcrossChunkBoundary() throws {
        let file = try temporaryDirectory().appendingPathComponent("source")
        try Data(repeating: 97, count: 65_537).write(to: file)
        XCTAssertEqual(try WmsDocumentCore.hashFile(file), WmsDocumentDigest(
            sha256: "008ffc88d3c96a9f307524eb361e47c5222a887fc45fa0c1fb8d429c5c23b430", bytes: 65_537))
    }

    func testHashRejectsEmptyOversizeDirectoryMissingAndSymbolicLink() throws {
        let directory = try temporaryDirectory(), file = directory.appendingPathComponent("source")
        try Data().write(to: file)
        assertError(.emptyFile) { try WmsDocumentCore.hashFile(file) }
        try Data("abc".utf8).write(to: file)
        assertError(.fileTooLarge) { try WmsDocumentCore.hashFile(file, maxBytes: 2) }
        assertError(.fileUnavailable) { try WmsDocumentCore.hashFile(directory) }
        assertError(.fileUnavailable) { try WmsDocumentCore.hashFile(directory.appendingPathComponent("missing")) }
        let link = directory.appendingPathComponent("link")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: file)
        assertError(.fileUnavailable) { try WmsDocumentCore.hashFile(link) }
    }

    func testOwnedFileRejectsSameSizeReplacementAndAcceptsPinnedBytes() throws {
        let file = try temporaryDirectory().appendingPathComponent("source")
        try Data("abc".utf8).write(to: file)
        let pin = WmsDocumentDigest(sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", bytes: 3)
        XCTAssertEqual(try WmsDocumentCore.verifiedFile(file, expected: pin), file)
        try Data("abd".utf8).write(to: file)
        assertError(.notOwned) { try WmsDocumentCore.verifiedFile(file, expected: pin) }
    }

    func testPreviewURLMustBelongToExactPrivatePreviewDirectory() throws {
        let root = try temporaryDirectory().appendingPathComponent("p18-previews")
        let directory = root.appendingPathComponent(id)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let page = directory.appendingPathComponent("page.png")
        try Data([1]).write(to: page)
        XCTAssertEqual(try WmsDocumentCore.previewURL(page.absoluteString, id: id, root: root), page)
        for value in [root.appendingPathComponent("other/page.png").absoluteString,
                      root.appendingPathComponent(id + "-other/page.png").absoluteString,
                      directory.absoluteString + "/../other/page.png",
                      page.absoluteString + "?secret=1", "https://example.invalid/" + id + "/page.png"] {
            assertError(.notOwned) { try WmsDocumentCore.previewURL(value, id: id, root: root) }
        }
    }

    func testPreviewURLRejectsSymlinkEscapingExactDirectory() throws {
        let base = try temporaryDirectory(), root = base.appendingPathComponent("p18-previews")
        let directory = root.appendingPathComponent(id)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let outside = base.appendingPathComponent("outside")
        try Data([1]).write(to: outside)
        let link = directory.appendingPathComponent("page.png")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: outside)
        assertError(.notOwned) { try WmsDocumentCore.previewURL(link.absoluteString, id: id, root: root) }
    }

    func testRasterSizeCapsMemoryAndRejectsInvalidDimensions() throws {
        XCTAssertEqual(try WmsDocumentCore.rasterSize(width: 600, height: 800, requestedWidth: 1200),
                       WmsDocumentDimensions(width: 1200, height: 1600))
        let tall = try WmsDocumentCore.rasterSize(width: 100, height: 10_000, requestedWidth: 1800)
        XCTAssertEqual(tall, WmsDocumentDimensions(width: 40, height: 4096))
        let large = try WmsDocumentCore.rasterSize(width: 1000, height: 2000, requestedWidth: 1800)
        XCTAssertLessThanOrEqual(large.width * large.height, 4_000_000)
        for value in [0.0, -1, Double.infinity, Double.nan] {
            assertError(.invalidDimensions) { try WmsDocumentCore.rasterSize(width: value, height: 800, requestedWidth: 1000) }
            assertError(.invalidDimensions) { try WmsDocumentCore.rasterSize(width: 600, height: 800, requestedWidth: value) }
        }
    }
}
