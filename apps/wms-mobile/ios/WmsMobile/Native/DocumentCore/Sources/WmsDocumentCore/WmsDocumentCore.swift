import Foundation
import CryptoKit

public enum WmsDocumentError: Error, Equatable {
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

/// Local bytes only: this layer never accepts a remote document URL or auth data.
public enum WmsDocumentCore {
    private static let extensions = [
        "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"
    ]

    public static func decode(_ base64: String, mime: String, maxBytes: Int) throws -> Data {
        guard extensions[mime] != nil else { throw WmsDocumentError.invalidMime }
        guard maxBytes > 0, maxBytes <= 314_572_800 else { throw WmsDocumentError.fileTooLarge }
        guard !base64.isEmpty else { throw WmsDocumentError.emptyFile }
        guard base64.utf8.count <= ((maxBytes + 2) / 3) * 4 else { throw WmsDocumentError.fileTooLarge }
        guard let data = Data(base64Encoded: base64) else { throw WmsDocumentError.invalidPayload }
        guard !data.isEmpty else { throw WmsDocumentError.emptyFile }
        guard data.count <= maxBytes else { throw WmsDocumentError.fileTooLarge }
        let valid: Bool
        switch mime {
        case "application/pdf": valid = data.starts(with: Data("%PDF-".utf8))
        case "image/png": valid = data.starts(with: [137, 80, 78, 71, 13, 10, 26, 10])
        case "image/jpeg": valid = data.starts(with: [255, 216, 255])
        case "image/webp":
            valid = data.count >= 12 && data.prefix(4) == Data("RIFF".utf8)
                && data.subdata(in: 8..<12) == Data("WEBP".utf8)
        default: valid = false
        }
        guard valid else { throw WmsDocumentError.invalidPayload }
        return data
    }

    public static func exportFilename(_ name: String, mime: String) throws -> String {
        guard let suffix = extensions[mime] else { throw WmsDocumentError.invalidMime }
        let basename = name.replacingOccurrences(of: "\\", with: "/").components(separatedBy: "/").last ?? ""
        let clean = basename.unicodeScalars.filter { !CharacterSet.controlCharacters.contains($0) }
        var result = String(String.UnicodeScalarView(clean)).trimmingCharacters(in: .whitespacesAndNewlines)
        result = String(result.prefix(150))
        while result.utf8.count > 180 { result.removeLast() }
        if result.isEmpty || result == "." || result == ".." { result = "chung-tu" }
        let ext = (result as NSString).pathExtension.lowercased()
        if ext != suffix && !(mime == "image/jpeg" && ext == "jpeg") { result += "." + suffix }
        return result
    }

    public static func fileURL(_ value: String) throws -> URL {
        guard !value.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              value.hasPrefix("file:///"), let parts = URLComponents(string: value),
              parts.scheme == "file", parts.host == nil || parts.host == "",
              parts.user == nil, parts.password == nil, parts.port == nil,
              parts.query == nil, parts.fragment == nil,
              !parts.path.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              let url = parts.url, url.isFileURL, url.path.hasPrefix("/")
        else { throw WmsDocumentError.invalidURL }
        return url.standardizedFileURL
    }

    public static func hashFile(_ url: URL, maxBytes: Int64 = 314_572_800) throws -> WmsDocumentDigest {
        let source = try fileURL(url.absoluteString)
        guard maxBytes > 0 else { throw WmsDocumentError.fileTooLarge }
        let values: URLResourceValues
        do { values = try source.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey]) }
        catch { throw WmsDocumentError.fileUnavailable }
        guard values.isRegularFile == true, values.isSymbolicLink != true,
              let initialSize = values.fileSize else { throw WmsDocumentError.fileUnavailable }
        guard initialSize > 0 else { throw WmsDocumentError.emptyFile }
        guard Int64(initialSize) <= maxBytes else { throw WmsDocumentError.fileTooLarge }
        let handle: FileHandle
        do { handle = try FileHandle(forReadingFrom: source) }
        catch { throw WmsDocumentError.fileUnavailable }
        defer { try? handle.close() }
        var digest = SHA256(), total: Int64 = 0
        do {
            while let chunk = try handle.read(upToCount: 65_536), !chunk.isEmpty {
                total += Int64(chunk.count)
                guard total <= maxBytes else { throw WmsDocumentError.fileTooLarge }
                digest.update(data: chunk)
            }
        } catch let error as WmsDocumentError { throw error }
        catch { throw WmsDocumentError.fileUnavailable }
        guard total > 0 else { throw WmsDocumentError.emptyFile }
        guard total == Int64(initialSize) else { throw WmsDocumentError.fileUnavailable }
        let hex = digest.finalize().map { String(format: "%02x", $0) }.joined()
        return WmsDocumentDigest(sha256: hex, bytes: total)
    }

    public static func verifiedFile(_ url: URL, expected: WmsDocumentDigest) throws -> URL {
        guard expected.bytes > 0, expected.sha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              try hashFile(url) == expected else { throw WmsDocumentError.notOwned }
        return try fileURL(url.absoluteString)
    }

    public static func previewURL(_ value: String, id: String, root: URL) throws -> URL {
        do {
            guard UUID(uuidString: id) != nil else { throw WmsDocumentError.notOwned }
            let source = try fileURL(value)
            let directory = root.appendingPathComponent(id, isDirectory: true).standardizedFileURL
            guard source.deletingLastPathComponent().path == directory.path,
                  source.resolvingSymlinksInPath().deletingLastPathComponent().path == directory.resolvingSymlinksInPath().path
            else { throw WmsDocumentError.notOwned }
            let values = try source.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            guard values.isRegularFile == true, values.isSymbolicLink != true else { throw WmsDocumentError.notOwned }
            return source
        } catch { throw WmsDocumentError.notOwned }
    }

    public static func rasterSize(width: Double, height: Double, requestedWidth: Double) throws -> WmsDocumentDimensions {
        guard width.isFinite, height.isFinite, requestedWidth.isFinite,
              width > 0, height > 0, requestedWidth > 0,
              width <= 1_000_000_000, height <= 1_000_000_000
        else { throw WmsDocumentError.invalidDimensions }
        let target = min(1800, max(200, requestedWidth.rounded()))
        let ratio = min(target / width, 4096 / height, sqrt(4_000_000 / (width * height)))
        guard ratio.isFinite, ratio > 0 else { throw WmsDocumentError.invalidDimensions }
        return WmsDocumentDimensions(width: max(1, Int(width * ratio)), height: max(1, Int(height * ratio)))
    }
}
