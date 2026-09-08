package vn.info.lptech.wmshoanam.nfc

import android.app.Activity
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.Ndef
import android.nfc.tech.NdefFormatable
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.nio.charset.Charset

/**
 * Cầu nối NFC nhỏ, tự chủ: app chỉ ghi NDEF text payload do WMS cấp rồi đọc lại
 * chính thẻ đó. JS chỉ được phép confirm server sau khi Promise này trả về UID
 * và payload đã đọc lại khớp, nên không có mapping cho một lần chạm thất bại.
 */
class NfcModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context), LifecycleEventListener, NfcAdapter.ReaderCallback {

  private enum class Operation { READ, WRITE }

  private data class Pending(
    val operation: Operation,
    val payload: String?,
    val promise: Promise,
  )

  private val lock = Any()
  private val adapter: NfcAdapter? = NfcAdapter.getDefaultAdapter(context)
  private var pending: Pending? = null

  init {
    context.addLifecycleEventListener(this)
  }

  override fun getName(): String = "WmsNfc"

  @ReactMethod
  fun getStatus(promise: Promise) {
    val status = when {
      adapter == null -> "unsupported"
      !adapter.isEnabled -> "disabled"
      context.currentActivity == null -> "unavailable"
      else -> "available"
    }
    val result = Arguments.createMap()
    result.putString("status", status)
    promise.resolve(result)
  }

  @ReactMethod
  fun readTag(promise: Promise) = start(Operation.READ, null, promise)

  @ReactMethod
  fun writeNdefText(payload: String, promise: Promise) {
    if (payload.isBlank()) {
      promise.reject("NFC_EMPTY_PAYLOAD", "Dữ liệu ghi NFC trống.")
      return
    }
    start(Operation.WRITE, payload, promise)
  }

  @ReactMethod
  fun cancel() {
    cancelPending("NFC_CANCELLED", "Đã huỷ chờ chạm thẻ NFC.")
  }

  private fun start(operation: Operation, payload: String?, promise: Promise) {
    val nfc = adapter
    if (nfc == null) {
      promise.reject("NFC_UNSUPPORTED", "Thiết bị này không có NFC.")
      return
    }
    if (!nfc.isEnabled) {
      promise.reject("NFC_DISABLED", "NFC đang tắt. Hãy bật NFC trong cài đặt thiết bị.")
      return
    }
    val activity = context.currentActivity
    if (activity == null) {
      promise.reject("NFC_NO_ACTIVITY", "Không thể mở bộ đọc NFC khi màn hình chưa sẵn sàng.")
      return
    }
    synchronized(lock) {
      if (pending != null) {
        promise.reject("NFC_BUSY", "Đang chờ một lần chạm NFC khác.")
        return
      }
      pending = Pending(operation, payload, promise)
    }
    activity.runOnUiThread {
      try {
        nfc.enableReaderMode(activity, this, READER_FLAGS, null)
      } catch (error: Exception) {
        cancelPending("NFC_START_FAILED", error.message ?: "Không mở được bộ đọc NFC.")
      }
    }
  }

  override fun onTagDiscovered(tag: Tag) {
    // Claim trước khi xử lý: Android đôi lúc phát callback lần hai cho cùng thẻ.
    val request = synchronized(lock) {
      val claimed = pending
      pending = null
      claimed
    } ?: return

    disableReaderMode()
    try {
      val uid = uidOf(tag)
      if (uid.isBlank()) {
        throw NfcFailure("NFC_UID_UNAVAILABLE", "Không đọc được UID phần cứng của thẻ.")
      }
      when (request.operation) {
        Operation.READ -> {
          val result = Arguments.createMap()
          result.putString("hardwareUid", uid)
          readTextPayload(tag)?.let { result.putString("rawCode", it) }
          request.promise.resolve(result)
        }
        Operation.WRITE -> {
          val expected = request.payload ?: throw NfcFailure("NFC_EMPTY_PAYLOAD", "Dữ liệu ghi NFC trống.")
          writeTextPayload(tag, expected)
          val actual = readTextPayload(tag)
            ?: throw NfcFailure("NFC_VERIFY_FAILED", "Đã ghi nhưng không đọc lại được nội dung thẻ NFC.")
          if (actual != expected) {
            throw NfcFailure("NFC_VERIFY_FAILED", "Nội dung đọc lại không khớp dữ liệu WMS.")
          }
          val result = Arguments.createMap()
          result.putString("hardwareUid", uid)
          result.putString("writtenPayload", actual)
          request.promise.resolve(result)
        }
      }
    } catch (failure: NfcFailure) {
      request.promise.reject(failure.code, failure.message)
    } catch (error: Exception) {
      request.promise.reject("NFC_IO_ERROR", error.message ?: "Không đọc/ghi được thẻ NFC.", error)
    }
  }

  private fun writeTextPayload(tag: Tag, payload: String) {
    val message = NdefMessage(arrayOf(NdefRecord.createTextRecord("vi", payload)))
    val ndef = Ndef.get(tag)
    if (ndef != null) {
      try {
        ndef.connect()
        if (!ndef.isWritable) throw NfcFailure("NFC_READ_ONLY", "Thẻ NFC đã bị khoá, không thể ghi.")
        if (ndef.maxSize < message.toByteArray().size) {
          throw NfcFailure("NFC_TAG_TOO_SMALL", "Thẻ NFC không đủ dung lượng cho dữ liệu sản phẩm.")
        }
        ndef.writeNdefMessage(message)
        return
      } finally {
        try { ndef.close() } catch (_: Exception) { }
      }
    }

    val formattable = NdefFormatable.get(tag)
      ?: throw NfcFailure("NFC_UNSUPPORTED_TAG", "Thẻ này không hỗ trợ ghi NDEF.")
    try {
      formattable.connect()
      formattable.format(message)
    } finally {
      try { formattable.close() } catch (_: Exception) { }
    }
  }

  private fun readTextPayload(tag: Tag): String? {
    val ndef = Ndef.get(tag) ?: return null
    val message = try {
      ndef.connect()
      ndef.ndefMessage
    } finally {
      try { ndef.close() } catch (_: Exception) { }
    } ?: return null

    return message.records.firstNotNullOfOrNull { parseTextRecord(it) }
  }

  private fun parseTextRecord(record: NdefRecord): String? {
    if (record.tnf != NdefRecord.TNF_WELL_KNOWN || !record.type.contentEquals(NdefRecord.RTD_TEXT)) return null
    val bytes = record.payload
    if (bytes.isEmpty()) return null
    val languageLength = bytes[0].toInt() and 0x3f
    if (bytes.size <= languageLength + 1) return null
    val charset = if ((bytes[0].toInt() and 0x80) == 0) Charsets.UTF_8 else Charset.forName("UTF-16")
    return String(bytes, languageLength + 1, bytes.size - languageLength - 1, charset)
  }

  private fun uidOf(tag: Tag): String = tag.id.joinToString("") { byte -> "%02X".format(byte.toInt() and 0xff) }

  private fun disableReaderMode() {
    val activity: Activity = context.currentActivity ?: return
    activity.runOnUiThread {
      try { adapter?.disableReaderMode(activity) } catch (_: Exception) { }
    }
  }

  private fun cancelPending(code: String, message: String) {
    val request = synchronized(lock) {
      val cancelled = pending
      pending = null
      cancelled
    }
    disableReaderMode()
    request?.promise?.reject(code, message)
  }

  override fun onHostResume() = Unit
  override fun onHostPause() = cancelPending("NFC_PAUSED", "Đã dừng quét NFC vì màn hình không còn ở trước.")
  override fun onHostDestroy() = cancelPending("NFC_DESTROYED", "Đã dừng quét NFC vì ứng dụng đóng.")

  private data class NfcFailure(val code: String, override val message: String) : Exception(message)

  companion object {
    private const val READER_FLAGS =
      NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or
        NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V or
        // Không dùng FLAG_READER_SKIP_NDEF_CHECK: sau khi ghi, app phải có
        // công nghệ Ndef để đọc lại payload xác minh trước khi gọi WMS.
        NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS
  }
}
