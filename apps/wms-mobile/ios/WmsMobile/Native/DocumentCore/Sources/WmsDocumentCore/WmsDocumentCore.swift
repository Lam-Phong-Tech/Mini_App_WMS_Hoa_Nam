import Foundation

public enum WmsDocumentError: Error, Equatable {
    case notImplemented
    case invalidMime
    case invalidPayload
    case emptyFile
    case fileTooLarge
    case invalidURL
    case fileUnavailable
    case notOwned
    case invalidDimensions
}

public struct WmsDocumentDigest: Equatable {
    public let sha256: String
    public let bytes: Int64

    public init(sha256: String, bytes: Int64) {
        self.sha256 = sha256
        self.bytes = bytes
    }
}

public struct WmsDocumentDimensions: Equatable {
    public let width: Int
    public let height: Int
}

/// Foundation-only validation shared by the iOS document bridges.
/// Throwing bodies intentionally stage the initial macOS RED test run.
public enum WmsDocumentCore {
    public static func decode(_ base64: String, mime: String, maxBytes: Int) throws -> Data {
        throw WmsDocumentError.notImplemented
    }

    public static func exportFilename(_ name: String, mime: String) throws -> String {
        throw WmsDocumentError.notImplemented
    }

    public static func fileURL(_ value: String) throws -> URL {
        throw WmsDocumentError.notImplemented
    }

    public static func hashFile(_ url: URL, maxBytes: Int64 = 314_572_800) throws -> WmsDocumentDigest {
        throw WmsDocumentError.notImplemented
    }

    public static func verifiedFile(_ url: URL, expected: WmsDocumentDigest) throws -> URL {
        throw WmsDocumentError.notImplemented
    }

    public static func previewURL(_ value: String, id: String, root: URL) throws -> URL {
        throw WmsDocumentError.notImplemented
    }

    public static func rasterSize(width: Double, height: Double, requestedWidth: Double) throws -> WmsDocumentDimensions {
        throw WmsDocumentError.notImplemented
    }
}
