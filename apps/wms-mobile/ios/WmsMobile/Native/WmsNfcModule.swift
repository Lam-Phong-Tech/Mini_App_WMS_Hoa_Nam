import Foundation
import UIKit
import CoreNFC
import React

/// Uses the real tag identifier; NDEF-only sessions cannot supply the UID required
/// by WMS. All request state and CoreNFC delegate callbacks use the main queue.
@objc(WmsNfc)
final class WmsNfcModule: NSObject, NFCTagReaderSessionDelegate {
    private enum Operation {
        case read
        case write(payload: String, context: NfcWriteContext?)
    }

    private final class Request {
        let operation: Operation
        let session: NFCTagReaderSession
        let resolve: RCTPromiseResolveBlock
        let reject: RCTPromiseRejectBlock
        var processing = false
        var writeStarted = false
        var expiry: DispatchWorkItem?

        init(operation: Operation, session: NFCTagReaderSession,
             resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
            self.operation = operation
            self.session = session
            self.resolve = resolve
            self.reject = reject
        }
    }

    private var pending: Request?
    private var entitlementUnavailable = false

    override init() {
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(appDidEnterBackground),
                                               name: UIApplication.didEnterBackgroundNotification,
                                               object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc static func requiresMainQueueSetup() -> Bool { true }

    @objc var methodQueue: DispatchQueue { .main }

    @objc(copyIdentifier:resolver:rejecter:)
    func copyIdentifier(_ value: String, resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        onMain {
            UIPasteboard.general.string = value
            resolve(nil)
        }
    }

    @objc(getStatus:rejecter:)
    func getStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                   rejecter reject: @escaping RCTPromiseRejectBlock) {
        onMain {
            let status: String
            if !NFCTagReaderSession.readingAvailable {
                status = "unsupported"
            } else if self.entitlementUnavailable {
                self.reject(self.entitlementFailure, using: reject)
                return
            } else if !self.hasUsageDescription {
                self.reject(NfcFailure("NFC_CONFIG_UNAVAILABLE", "Bản cài này thiếu mô tả quyền NFC."), using: reject)
                return
            } else if UIApplication.shared.applicationState != .active {
                status = "unavailable"
            } else {
                // This is hardware availability, not proof of a signing entitlement.
                // CoreNFC validates TAG entitlement when a real session begins.
                status = "available"
            }
            resolve(["status": status])
        }
    }

    @objc(readTag:rejecter:)
    func readTag(_ resolve: @escaping RCTPromiseResolveBlock,
                 rejecter reject: @escaping RCTPromiseRejectBlock) {
        onMain { self.start(.read, resolve: resolve, reject: reject) }
    }

    @objc(writeNdefText:resolver:rejecter:)
    func writeNdefText(_ payload: String, resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        onMain {
            do {
                _ = try NfcRules.textRecord(payload)
                self.start(.write(payload: payload, context: nil), resolve: resolve, reject: reject)
            } catch {
                self.reject(error, using: reject)
            }
        }
    }

    @objc(writeNdefTextToTag:expectedUid:remainingMs:resolver:rejecter:)
    func writeNdefTextToTag(_ payload: String, expectedUid: String, remainingMs: Double,
                            resolver resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
        onMain {
            do {
                let context = try NfcRules.writeContext(payload: payload, expectedUID: expectedUid,
                                                       remainingMilliseconds: remainingMs,
                                                       nowUptime: ProcessInfo.processInfo.systemUptime)
                self.start(.write(payload: payload, context: context), resolve: resolve, reject: reject)
            } catch {
                self.reject(error, using: reject)
            }
        }
    }

    @objc func cancel() {
        onMain { self.cancelPending(code: "NFC_CANCELLED", message: "Đã huỷ chờ chạm thẻ NFC.") }
    }

    @objc func invalidate() {
        onMain {
            self.cancelPending(code: "NFC_DESTROYED", message: "Đã dừng NFC vì ứng dụng đóng.")
            NotificationCenter.default.removeObserver(self)
        }
    }

    @objc private func appDidEnterBackground() {
        cancelPending(code: "NFC_PAUSED", message: "Đã dừng NFC vì ứng dụng không còn ở trước.")
    }

    private var hasUsageDescription: Bool {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "NFCReaderUsageDescription") as? String
        else { return false }
        return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func onMain(_ work: @escaping () -> Void) {
        if Thread.isMainThread { work() } else { DispatchQueue.main.async(execute: work) }
    }

    private func start(_ operation: Operation, resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
        guard NFCTagReaderSession.readingAvailable else {
            self.reject(NfcFailure("NFC_UNSUPPORTED", "Thiết bị này không hỗ trợ bộ đọc NFC."), using: reject)
            return
        }
        guard hasUsageDescription else {
            self.reject(NfcFailure("NFC_CONFIG_UNAVAILABLE", "Bản cài này thiếu mô tả quyền NFC."), using: reject)
            return
        }
        guard !entitlementUnavailable else {
            self.reject(entitlementFailure, using: reject)
            return
        }
        guard UIApplication.shared.applicationState == .active else {
            self.reject(NfcFailure("NFC_NO_ACTIVITY", "Chỉ mở được bộ đọc NFC khi ứng dụng ở trước."), using: reject)
            return
        }
        guard pending == nil else {
            self.reject(NfcFailure("NFC_BUSY", "Đang chờ một lần chạm NFC khác."), using: reject)
            return
        }

        var polling: NFCTagReaderSession.PollingOption = [.iso14443, .iso15693]
        // FeliCa polling requires configured system codes. Do not invent a list
        // or prevent common MIFARE/ISO15693 tags working by enabling it blindly.
        if let codes = Bundle.main.object(forInfoDictionaryKey:
            "com.apple.developer.nfc.readersession.felica.systemcodes") as? [String], !codes.isEmpty {
            polling.insert(.iso18092)
        }
        guard let session = NFCTagReaderSession(pollingOption: polling, delegate: self, queue: .main) else {
            self.reject(NfcFailure("NFC_START_FAILED", "Không tạo được phiên đọc NFC trên thiết bị này."), using: reject)
            return
        }
        let request = Request(operation: operation, session: session, resolve: resolve, reject: reject)
        pending = request
        switch operation {
        case .read:
            session.alertMessage = "Giữ một thẻ NFC gần đầu iPhone để đọc."
        case .write(_, let context):
            session.alertMessage = "Giữ đúng một thẻ NFC gần đầu iPhone đến khi xác minh xong."
            if let context = context {
                let expiry = DispatchWorkItem { [weak self, weak request] in
                    guard let self = self, let request = request,
                          self.current(session) === request, !request.writeStarted else { return }
                    self.fail(session, NfcFailure("NFC_RESERVATION_EXPIRED", "Giữ chỗ đã hết hạn; chưa ghi chip."))
                }
                request.expiry = expiry
                let delay = max(0, context.deadlineUptime - ProcessInfo.processInfo.systemUptime)
                // CoreNFC sessions are bounded independently. A longer remaining
                // TTL must not be labelled expired at the session's own timeout.
                if delay <= 60 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: expiry)
                }
            }
        }
        session.begin()
    }

    private func current(_ session: NFCTagReaderSession) -> Request? {
        guard let request = pending, request.session === session else { return nil }
        return request
    }

    func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {}

    func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
        guard let request = current(session) else { return }
        pending = nil
        request.expiry?.cancel()
        let failure = failureForRequest(error, request: request)
        request.reject(failure.code, failure.message, error)
    }

    func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        guard let request = current(session), !request.processing else { return }
        guard tags.count == 1, let tag = tags.first else {
            fail(session, NfcFailure("NFC_MULTIPLE_TAGS", "Chỉ giữ một thẻ NFC gần iPhone rồi thử lại."))
            return
        }
        request.processing = true
        do {
            let (uid, ndefTag) = try tagIdentity(tag)
            if case .write(_, let context?) = request.operation {
                try NfcRules.validateIdentity(uid, context: context,
                                              nowUptime: ProcessInfo.processInfo.systemUptime)
            }
            session.connect(to: tag) { [weak self] error in
                guard let self = self, self.current(session) === request else { return }
                if let error = error { self.fail(session, error); return }
                self.queryTag(ndefTag, uid: uid, request: request)
            }
        } catch {
            fail(session, error)
        }
    }

    private func tagIdentity(_ tag: NFCTag) throws -> (String, NFCNDEFTag) {
        switch tag {
        case .miFare(let chip):
            return (try NfcRules.hardwareUID(chip.identifier), chip)
        case .iso7816(let chip):
            return (try NfcRules.hardwareUID(chip.identifier), chip)
        case .iso15693(let chip):
            return (try NfcRules.hardwareUID(chip.identifier, order: .coreNfcISO15693), chip)
        case .feliCa(let chip):
            return (try NfcRules.hardwareUID(chip.currentIDm), chip)
        @unknown default:
            throw NfcFailure("NFC_UNSUPPORTED_TAG", "Loại thẻ này không cung cấp UID NFC được hỗ trợ.")
        }
    }

    private func queryTag(_ tag: NFCNDEFTag, uid: String, request: Request) {
        let session = request.session
        tag.queryNDEFStatus { [weak self] status, capacity, error in
            guard let self = self, self.current(session) === request else { return }
            if let error = error { self.fail(session, error); return }
            switch request.operation {
            case .read:
                if status == .notSupported {
                    self.succeed(session, ["hardwareUid": uid, "hasNdefData": false])
                } else {
                    self.readRecords(tag, request: request) { result in
                        do {
                            let records = try result.get()
                            var value: [String: Any] = ["hardwareUid": uid,
                                "hasNdefData": try NfcRules.hasNdefData(records)]
                            for record in records {
                                if let text = try NfcRules.text(in: record) {
                                    value["rawCode"] = text
                                    break
                                }
                            }
                            self.succeed(session, value)
                        } catch { self.fail(session, error) }
                    }
                }
            case .write(let payload, let context):
                guard status == .readWrite else {
                    let error = status == .readOnly
                        ? NfcFailure("NFC_READ_ONLY", "Thẻ NFC đã bị khoá, không thể ghi.")
                        : NfcFailure("NFC_UNSUPPORTED_TAG", "Thẻ này không hỗ trợ ghi NDEF trên iPhone.")
                    self.fail(session, error)
                    return
                }
                do {
                    let record = try NfcRules.textRecord(payload)
                    let nativeRecord = NFCNDEFPayload(format: .nfcWellKnown, type: record.type,
                                                     identifier: Data(), payload: record.payload)
                    let message = NFCNDEFMessage(records: [nativeRecord])
                    guard message.length <= capacity else {
                        throw NfcFailure("NFC_TAG_TOO_SMALL", "Thẻ NFC không đủ dung lượng cho dữ liệu sản phẩm.")
                    }
                    if context != nil {
                        self.readRecords(tag, request: request) { result in
                            do {
                                try NfcRules.validateExistingRecords(try result.get(), expectedPayload: payload)
                                self.write(message, payload: payload, uid: uid, tag: tag, request: request)
                            } catch { self.fail(session, error) }
                        }
                    } else {
                        self.write(message, payload: payload, uid: uid, tag: tag, request: request)
                    }
                } catch { self.fail(session, error) }
            }
        }
    }

    private func readRecords(_ tag: NFCNDEFTag, request: Request,
                             completion: @escaping (Result<[NfcRecord], Error>) -> Void) {
        let session = request.session
        tag.readNDEF { [weak self] message, error in
            guard let self = self, self.current(session) === request else { return }
            if let error = error {
                if let nfcError = error as? NFCReaderError,
                   nfcError.code == .ndefReaderSessionErrorZeroLengthMessage {
                    completion(.success([]))
                } else {
                    completion(.failure(error))
                }
                return
            }
            guard let message = message else {
                completion(.failure(NfcFailure("NFC_IO_ERROR", "Không đọc được trạng thái dữ liệu của thẻ NFC.")))
                return
            }
            completion(.success(message.records.map {
                NfcRecord(typeNameFormat: $0.typeNameFormat.rawValue, type: $0.type, payload: $0.payload)
            }))
        }
    }

    private func write(_ message: NFCNDEFMessage, payload: String, uid: String,
                       tag: NFCNDEFTag, request: Request) {
        let session = request.session
        guard current(session) === request else { return }
        do {
            if case .write(_, let context?) = request.operation {
                try NfcRules.validateIdentity(uid, context: context,
                                              nowUptime: ProcessInfo.processInfo.systemUptime)
            }
            guard tag.isAvailable else {
                throw NfcFailure("NFC_IO_ERROR", "Thẻ đã rời khỏi vùng NFC; chưa bắt đầu ghi.")
            }
            request.writeStarted = true
            request.expiry?.cancel()
            tag.writeNDEF(message) { [weak self] error in
                guard let self = self, self.current(session) === request else { return }
                if let error = error { self.fail(session, error); return }
                // Fresh RF read, never return the requested payload as if verified.
                self.readRecords(tag, request: request) { result in
                    do {
                        let actual = try NfcRules.verifiedReadback(try result.get(), expectedPayload: payload)
                        self.succeed(session, ["hardwareUid": uid, "writtenPayload": actual])
                    } catch {
                        self.fail(session, NfcFailure("NFC_VERIFY_FAILED",
                            "Đã gửi lệnh ghi nhưng chưa xác minh được nội dung đọc lại. Hãy đọc lại thẻ trước khi thử tiếp."))
                    }
                }
            }
        } catch { fail(session, error) }
    }

    private func succeed(_ session: NFCTagReaderSession, _ value: [String: Any]) {
        guard let request = current(session) else { return }
        pending = nil
        request.expiry?.cancel()
        session.alertMessage = "Đã đọc và xác minh thẻ NFC."
        session.invalidate()
        request.resolve(value)
    }

    private func fail(_ session: NFCTagReaderSession, _ error: Error) {
        guard let request = current(session) else { return }
        pending = nil
        request.expiry?.cancel()
        let failure = failureForRequest(error, request: request)
        session.invalidate(errorMessage: failure.message)
        request.reject(failure.code, failure.message, error)
    }

    private func cancelPending(code: String, message: String) {
        guard let request = pending else { return }
        pending = nil
        request.expiry?.cancel()
        request.session.invalidate()
        let explanation = request.writeStarted
            ? message + " Lệnh ghi đã bắt đầu; cần đọc lại thẻ để biết kết quả, không tự xác nhận ghi."
            : message
        request.reject(request.writeStarted ? "NFC_VERIFY_FAILED" : code, explanation, nil)
    }

    private var entitlementFailure: NfcFailure {
        NfcFailure("NFC_ENTITLEMENT_UNAVAILABLE",
                   "Bản ký iOS này chưa được cấp quyền đọc/ghi NFC (TAG). Không thể quét hoặc ghi thẻ.")
    }

    private func reject(_ error: Error, using reject: RCTPromiseRejectBlock) {
        let failure = mappedFailure(error)
        reject(failure.code, failure.message, error)
    }

    private func failureForRequest(_ error: Error, request: Request) -> NfcFailure {
        let failure = mappedFailure(error)
        guard request.writeStarted, failure.code != "NFC_VERIFY_FAILED" else { return failure }
        return NfcFailure("NFC_VERIFY_FAILED", failure.message +
            " Lệnh ghi đã bắt đầu; cần đọc lại thẻ để biết kết quả, không tự xác nhận ghi.")
    }

    private func mappedFailure(_ error: Error) -> NfcFailure {
        if let failure = error as? NfcFailure { return failure }
        guard let failure = error as? NFCReaderError else {
            return NfcFailure("NFC_IO_ERROR", "Không đọc/ghi được thẻ NFC. Hãy giữ thẻ gần iPhone rồi thử lại.")
        }
        switch failure.code {
        case .readerErrorSecurityViolation:
            entitlementUnavailable = true
            return entitlementFailure
        case .readerErrorUnsupportedFeature:
            return NfcFailure("NFC_UNSUPPORTED", "Thiết bị này không hỗ trợ thao tác NFC được yêu cầu.")
        case .readerSessionInvalidationErrorUserCanceled:
            return NfcFailure("NFC_CANCELLED", "Đã huỷ chờ chạm thẻ NFC.")
        case .readerSessionInvalidationErrorSessionTimeout:
            return NfcFailure("NFC_SCAN_TIMEOUT", "Hết thời gian chờ chạm thẻ NFC. Hãy thử lại.")
        case .readerSessionInvalidationErrorSystemIsBusy:
            return NfcFailure("NFC_BUSY", "Bộ đọc NFC đang được dùng. Hãy thử lại sau.")
        case .ndefReaderSessionErrorTagNotWritable:
            return NfcFailure("NFC_READ_ONLY", "Thẻ NFC đã bị khoá, không thể ghi.")
        case .ndefReaderSessionErrorTagSizeTooSmall:
            return NfcFailure("NFC_TAG_TOO_SMALL", "Thẻ NFC không đủ dung lượng cho dữ liệu sản phẩm.")
        default:
            return NfcFailure("NFC_IO_ERROR", "Không đọc/ghi được thẻ NFC. Hãy giữ thẻ gần iPhone rồi thử lại.")
        }
    }
}
