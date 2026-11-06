#if os(iOS)
import Foundation
import UIKit
import QuickLook
import PDFKit
import ImageIO
import UniformTypeIdentifiers
import CryptoKit
import React

@MainActor private func documentPresenter() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    guard let scene = scenes.first(where: { $0.activationState == .foregroundActive }),
          let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else { return nil }
    func top(_ controller: UIViewController) -> UIViewController {
        if let presented = controller.presentedViewController, !presented.isBeingDismissed { return top(presented) }
        if let nav = controller as? UINavigationController, let visible = nav.visibleViewController { return top(visible) }
        if let tabs = controller as? UITabBarController, let selected = tabs.selectedViewController { return top(selected) }
        return controller
    }
    return top(root)
}

private func documentDigest(_ data: Data) -> WmsDocumentDigest {
    WmsDocumentDigest(sha256: SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(), bytes: Int64(data.count))
}

/// Coordinates only a URL granted by the document picker, without downloading a remote URL.
private func verifyExport(_ url: URL, expected: WmsDocumentDigest, copyTo snapshot: URL? = nil) throws {
    var failure: Error?, coordinationError: NSError?
    var read = false
    NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: url, options: .withoutChanges, error: &coordinationError) { coordinated in
        read = true
        do {
            _ = try WmsDocumentCore.verifiedFile(coordinated, expected: expected)
            if let snapshot = snapshot {
                try FileManager.default.copyItem(at: coordinated, to: snapshot)
                try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: snapshot.path)
                _ = try WmsDocumentCore.verifiedFile(snapshot, expected: expected)
            }
        }
        catch { failure = error }
    }
    if let error = coordinationError { throw error }
    if let error = failure { throw error }
    guard read else { throw WmsDocumentError.fileUnavailable }
}

private final class ExportedDocument {
    let url: URL
    let digest: WmsDocumentDigest
    let scoped: Bool
    let mime: String

    init(url: URL, digest: WmsDocumentDigest, scoped: Bool, mime: String) {
        self.url = url; self.digest = digest; self.scoped = scoped; self.mime = mime
    }
    func releaseAccess() { if scoped { url.stopAccessingSecurityScopedResource() } }
}

@MainActor private final class ExportPreviewItem: NSObject, QLPreviewItem {
    let url: URL
    var previewItemURL: URL? { url }
    var previewItemTitle: String? { url.lastPathComponent }
    init(_ url: URL) { self.url = url }
}

@MainActor private final class ExportPreviewSource: NSObject, QLPreviewControllerDataSource {
    let item: ExportPreviewItem
    init(_ url: URL) { item = ExportPreviewItem(url) }
    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { item }
}

private final class ExportRequest {
    let identifier = UUID().uuidString.lowercased()
    let resolve: RCTPromiseResolveBlock
    let reject: RCTPromiseRejectBlock
    let mime: String
    var directory: URL?
    var digest: WmsDocumentDigest?
    var picker: UIDocumentPickerViewController?
    init(mime: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        self.mime = mime; self.resolve = resolve; self.reject = reject
    }
}

/// Files export and Quick Look are user initiated. Only verified exports can be reopened.
@objc(P12Documents)
@MainActor
final class P12Documents: NSObject, UIDocumentPickerDelegate, QLPreviewControllerDelegate {
    private let io = DispatchQueue(label: "vn.info.lptech.wmshoanam.documents.export", qos: .userInitiated)
    private var pending: ExportRequest?
    private var owned: [String: ExportedDocument] = [:]
    private var viewer: QLPreviewController?
    private var viewerSource: ExportPreviewSource?
    private var viewerDirectory: URL?
    private var generation = 0
    private var disposed = false

    @objc static func requiresMainQueueSetup() -> Bool { true }
    @objc var methodQueue: DispatchQueue { .main }

    @objc(save:name:mime:resolver:rejecter:)
    func save(_ encoded: String, name: String, mime: String,
              resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard !disposed, documentPresenter() != nil else {
            reject("P12_SAVE_UNAVAILABLE", "Không thể mở trình lưu tệp lúc này.", nil); return
        }
        guard pending == nil else { reject("P12_SAVE_BUSY", "Đang chọn vị trí lưu.", nil); return }
        let request = ExportRequest(mime: mime, resolve: resolve, reject: reject)
        pending = request
        io.async {
            let root = FileManager.default.temporaryDirectory.appendingPathComponent("p12-exports", isDirectory: true)
            let directory = root.appendingPathComponent(request.identifier, isDirectory: true)
            do {
                var data = try WmsDocumentCore.decode(encoded, mime: mime, maxBytes: 314_572_800)
                defer { data.resetBytes(in: 0..<data.count) }
                let filename = try WmsDocumentCore.exportFilename(name, mime: mime)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let source = directory.appendingPathComponent(filename)
                try data.write(to: source, options: [.atomic, .completeFileProtection])
                let digest = documentDigest(data)
                _ = try WmsDocumentCore.verifiedFile(source, expected: digest)
                DispatchQueue.main.async {
                    guard self.pending === request, !self.disposed, let presenter = documentPresenter() else {
                        try? FileManager.default.removeItem(at: directory)
                        if self.pending === request {
                            self.pending = nil
                            reject("P12_SAVE_UNAVAILABLE", "Không thể mở trình lưu tệp lúc này.", nil)
                        }
                        return
                    }
                    request.directory = directory; request.digest = digest
                    let picker = UIDocumentPickerViewController(forExporting: [source], asCopy: true)
                    picker.delegate = self
                    picker.shouldShowFileExtensions = true
                    request.picker = picker
                    presenter.present(picker, animated: true)
                }
            } catch {
                try? FileManager.default.removeItem(at: directory)
                DispatchQueue.main.async {
                    guard self.pending === request else { return }
                    self.pending = nil
                    reject("P12_SAVE_FAILED", "Bytes tài liệu hoặc vị trí lưu chưa hợp lệ.", nil)
                }
            }
        }
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let request = pending, request.picker === controller, let expected = request.digest else { return }
        guard urls.count == 1, let value = urls.first, let url = try? WmsDocumentCore.fileURL(value.absoluteString) else {
            fail(request, code: "P12_SAVE_FAILED", message: "Không xác minh được vị trí lưu."); return
        }
        let scoped = url.startAccessingSecurityScopedResource()
        io.async {
            do {
                try verifyExport(url, expected: expected)
                DispatchQueue.main.async {
                    guard self.pending === request, !self.disposed else {
                        if scoped { url.stopAccessingSecurityScopedResource() }
                        return
                    }
                    self.pending = nil
                    self.owned[url.absoluteString]?.releaseAccess()
                    self.owned[url.absoluteString] = ExportedDocument(url: url, digest: expected, scoped: scoped, mime: request.mime)
                    self.eraseStaging(request)
                    request.resolve(["uri": url.absoluteString, "bytes": Double(expected.bytes)])
                }
            } catch {
                if scoped { url.stopAccessingSecurityScopedResource() }
                DispatchQueue.main.async {
                    self.fail(request, code: "P12_SAVE_FAILED", message: "Không xác minh được bytes tệp đã lưu.")
                }
            }
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard let request = pending, request.picker === controller else { return }
        fail(request, code: "P12_SAVE_CANCELLED", message: "Đã hủy chọn vị trí lưu.")
    }

    private func eraseStaging(_ request: ExportRequest) {
        guard let directory = request.directory else { return }
        request.directory = nil
        io.async { try? FileManager.default.removeItem(at: directory) }
    }

    private func fail(_ request: ExportRequest, code: String, message: String) {
        guard pending === request else { return }
        pending = nil
        eraseStaging(request)
        request.reject(code, message, nil)
    }

    @objc(open:resolver:rejecter:)
    func open(_ value: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard !disposed, let item = owned[value], let url = try? WmsDocumentCore.fileURL(value), url == item.url else {
            reject("P12_FILE_NOT_OWNED", "Tệp chưa được xác minh trong lượt lưu này.", nil); return
        }
        let version = generation
        io.async {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("p12-open", isDirectory: true)
                .appendingPathComponent(UUID().uuidString.lowercased(), isDirectory: true)
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let snapshot = directory.appendingPathComponent(try WmsDocumentCore.exportFilename(item.url.lastPathComponent, mime: item.mime))
                try verifyExport(item.url, expected: item.digest, copyTo: snapshot)
                DispatchQueue.main.async {
                    guard !self.disposed, self.generation == version, self.owned[value] === item else {
                        try? FileManager.default.removeItem(at: directory)
                        reject("P12_FILE_NOT_OWNED", "Lượt lưu đã đóng hoặc ngữ cảnh đã thay đổi.", nil); return
                    }
                    let source = ExportPreviewSource(snapshot)
                    guard let presenter = documentPresenter(), QLPreviewController.canPreview(source.item),
                          self.viewer?.presentingViewController == nil else {
                        try? FileManager.default.removeItem(at: directory)
                        reject("P12_OPEN_FAILED", "Thiết bị chưa thể mở tệp này.", nil); return
                    }
                    let viewer = QLPreviewController()
                    self.viewerSource = source; self.viewer = viewer
                    self.viewerDirectory = directory
                    viewer.dataSource = source; viewer.delegate = self
                    presenter.present(viewer, animated: true) {
                        if !self.disposed, self.generation == version, self.owned[value] === item, self.viewer === viewer {
                            resolve(true)
                        } else { reject("P12_FILE_NOT_OWNED", "Lượt mở tệp đã đóng.", nil) }
                    }
                }
            } catch {
                try? FileManager.default.removeItem(at: directory)
                reject("P12_FILE_NOT_OWNED", "Tệp đã thay đổi hoặc không còn truy cập được.", nil)
            }
        }
    }

    func previewControllerDidDismiss(_ controller: QLPreviewController) {
        if viewer === controller { clearViewer() }
    }

    private func clearViewer() {
        viewer = nil; viewerSource = nil
        if let directory = viewerDirectory {
            viewerDirectory = nil
            io.async { try? FileManager.default.removeItem(at: directory) }
        }
    }

    @objc(hashFile:resolver:rejecter:)
    func hashFile(_ value: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        guard !disposed else { reject("P18_HASH_FAILED", "Đã đóng trình đọc tệp.", nil); return }
        io.async {
            do {
                let url = try WmsDocumentCore.fileURL(value)
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                let digest = try WmsDocumentCore.hashFile(url)
                resolve(["sha256": digest.sha256, "bytes": Double(digest.bytes)])
            } catch { reject("P18_HASH_FAILED", "Không xác minh được bytes tệp nguồn.", nil) }
        }
    }

    @objc func cancel() {
        generation += 1
        if let request = pending {
            request.picker?.dismiss(animated: false)
            fail(request, code: "P12_SAVE_CANCELLED", message: "Đã đóng lượt lưu chứng từ.")
        }
        viewer?.dismiss(animated: false)
        clearViewer()
        owned.values.forEach { $0.releaseAccess() }
        owned.removeAll()
    }

    @objc func invalidate() {
        DispatchQueue.main.async { self.disposed = true; self.cancel() }
    }
}

private final class DocumentPreview {
    let id: String, directory: URL, file: URL, mime: String
    let bytes: Int, pages: Int, width: Int, height: Int
    let digest: WmsDocumentDigest
    let pdf: PDFDocument?
    var rasters: [URL] = []
    init(id: String, directory: URL, file: URL, mime: String, bytes: Int, pages: Int,
         width: Int, height: Int, digest: WmsDocumentDigest, pdf: PDFDocument?) {
        self.id = id; self.directory = directory; self.file = file; self.mime = mime
        self.bytes = bytes; self.pages = pages; self.width = width; self.height = height
        self.digest = digest; self.pdf = pdf
    }
    var metadata: [String: Any] {
        var info: [String: Any] = ["id": id, "mime": mime, "bytes": bytes, "pages": pages, "width": width, "height": height]
        if pdf == nil { info["uri"] = file.absoluteString }
        return info
    }
}

/// Serial worker owns the PDF objects and private files. No network or shared document store.
@objc(P18Preview)
final class P18Preview: NSObject {
    private let worker = DispatchQueue(label: "vn.info.lptech.wmshoanam.documents.preview", qos: .userInitiated)
    private let root = FileManager.default.temporaryDirectory.appendingPathComponent("p18-previews", isDirectory: true)
    private var entries: [String: DocumentPreview] = [:]
    private var disposed = false
    private var prepared = false

    @objc static func requiresMainQueueSetup() -> Bool { false }
    @objc var methodQueue: DispatchQueue { worker }

    private func prepare() throws {
        guard !prepared else { return }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        for child in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) {
            if UUID(uuidString: child.lastPathComponent) != nil { erase(child) }
        }
        prepared = true
    }

    private func erase(_ directory: URL) {
        guard directory.deletingLastPathComponent().standardizedFileURL == root.standardizedFileURL,
              UUID(uuidString: directory.lastPathComponent) != nil else { return }
        try? FileManager.default.removeItem(at: directory)
    }

    private func pageSize(_ page: CGPDFPage) throws -> (Int, Int) {
        let box = page.getBoxRect(.cropBox)
        let rotated = abs(page.rotationAngle % 180) == 90
        let width = rotated ? box.height : box.width, height = rotated ? box.width : box.height
        guard width.isFinite, height.isFinite, width > 0, height > 0, width <= 1_000_000_000, height <= 1_000_000_000
        else { throw WmsDocumentError.invalidDimensions }
        return (Int(ceil(width)), Int(ceil(height)))
    }

    @objc(open:mime:resolver:rejecter:)
    func open(_ encoded: String, mime: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let id = UUID().uuidString.lowercased()
        // The directory is rebuilt from the exact public identifier, never from caller input.
        let targetDirectory = root.appendingPathComponent(id, isDirectory: true)
        do {
            guard !disposed else { throw WmsDocumentError.notOwned }
            try prepare()
            var data = try WmsDocumentCore.decode(encoded, mime: mime, maxBytes: 20_971_520)
            defer { data.resetBytes(in: 0..<data.count) }
            try FileManager.default.createDirectory(at: targetDirectory, withIntermediateDirectories: false)
            let file = targetDirectory.appendingPathComponent(try WmsDocumentCore.exportFilename("document", mime: mime))
            try data.write(to: file, options: [.atomic, .completeFileProtection])
            let digest = documentDigest(data)
            _ = try WmsDocumentCore.verifiedFile(file, expected: digest)
            _ = try WmsDocumentCore.previewURL(file.absoluteString, id: id, root: root)
            let entry: DocumentPreview
            if mime == "application/pdf" {
                guard let pdf = PDFDocument(url: file), !pdf.isLocked, (1...10_000).contains(pdf.pageCount),
                      let first = pdf.page(at: 0)?.pageRef else { throw WmsDocumentError.invalidPayload }
                let (width, height) = try pageSize(first)
                entry = DocumentPreview(id: id, directory: targetDirectory, file: file, mime: mime,
                    bytes: data.count, pages: pdf.pageCount, width: width, height: height, digest: digest, pdf: pdf)
            } else {
                guard let source = CGImageSourceCreateWithURL(file as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
                      let type = CGImageSourceGetType(source), UTType(type as String)?.preferredMIMEType == mime,
                      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
                      let pixelWidth = properties[kCGImagePropertyPixelWidth] as? NSNumber,
                      let pixelHeight = properties[kCGImagePropertyPixelHeight] as? NSNumber
                else { throw WmsDocumentError.invalidPayload }
                var width = pixelWidth.intValue, height = pixelHeight.intValue
                guard width > 0, height > 0, Double(width) * Double(height) <= 40_000_000,
                      CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCache: false] as CFDictionary) != nil
                else { throw WmsDocumentError.invalidDimensions }
                let orientation = (properties[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1
                if (5...8).contains(orientation) { swap(&width, &height) }
                entry = DocumentPreview(id: id, directory: targetDirectory, file: file, mime: mime,
                    bytes: data.count, pages: 1, width: width, height: height, digest: digest, pdf: nil)
            }
            entries[id] = entry
            resolve(entry.metadata)
        } catch {
            erase(targetDirectory)
            reject("P18_PREVIEW_INVALID", "Không đọc được PDF/ảnh; tệp có thể bị khóa, không hợp lệ hoặc vượt giới hạn 20 MiB.", nil)
        }
    }

    @objc(render:page:width:resolver:rejecter:)
    func render(_ id: String, page number: NSNumber, width requested: NSNumber,
                resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let index = number.doubleValue, desiredWidth = requested.doubleValue
        guard !disposed, let entry = entries[id], let pdf = entry.pdf,
              index.isFinite, index.rounded() == index, index >= 1, index <= Double(entry.pages) else {
            reject("P18_PREVIEW_CLOSED", "Tệp hoặc trang không thuộc lượt xem này.", nil); return
        }
        let output = entry.directory.appendingPathComponent("page-" + UUID().uuidString.lowercased() + ".png")
        do {
            _ = try WmsDocumentCore.previewURL(entry.file.absoluteString, id: id, root: root)
            _ = try WmsDocumentCore.verifiedFile(entry.file, expected: entry.digest)
            guard let page = pdf.page(at: Int(index) - 1)?.pageRef else { throw WmsDocumentError.invalidPayload }
            let (width, height) = try pageSize(page)
            let size = try WmsDocumentCore.rasterSize(width: Double(width), height: Double(height), requestedWidth: desiredWidth)
            guard let context = CGContext(data: nil, width: size.width, height: size.height, bitsPerComponent: 8,
                bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { throw WmsDocumentError.invalidDimensions }
            let rect = CGRect(x: 0, y: 0, width: CGFloat(size.width), height: CGFloat(size.height))
            context.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
            context.fill(rect)
            context.concatenate(page.getDrawingTransform(.cropBox, rect: rect, rotate: 0, preserveAspectRatio: true))
            context.drawPDFPage(page)
            guard let image = context.makeImage() else { throw WmsDocumentError.invalidPayload }
            let data = NSMutableData()
            guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil)
            else { throw WmsDocumentError.invalidPayload }
            CGImageDestinationAddImage(destination, image, nil)
            guard CGImageDestinationFinalize(destination) else { throw WmsDocumentError.invalidPayload }
            try (data as Data).write(to: output, options: [.atomic, .completeFileProtection])
            _ = try WmsDocumentCore.previewURL(output.absoluteString, id: id, root: root)
            entry.rasters.append(output)
            while entry.rasters.count > 3 { try? FileManager.default.removeItem(at: entry.rasters.removeFirst()) }
            resolve(["uri": output.absoluteString, "width": size.width, "height": size.height])
        } catch {
            try? FileManager.default.removeItem(at: output)
            reject("P18_PDF_PAGE_FAILED", "Chưa render được trang PDF.", nil)
        }
    }

    @objc func close(_ id: String) {
        if let entry = entries.removeValue(forKey: id) { erase(entry.directory) }
    }

    @objc func invalidate() {
        worker.async {
            self.disposed = true
            self.entries.values.forEach { self.erase($0.directory) }
            self.entries.removeAll()
        }
    }
}
#endif
