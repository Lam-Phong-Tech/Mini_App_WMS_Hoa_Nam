package vn.info.lptech.wmshoanam.documents

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Base64
import java.io.File
import java.security.MessageDigest
import com.facebook.react.bridge.*

/** Local bytes only. No HTTP, auth token, storage permission or background download. */
class P12DocumentsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var pending: Promise? = null
  private var bytes: ByteArray? = null
  private val allowedUris = mutableSetOf<String>()
  private val requestCode = 1212
  override fun getName() = "P12Documents"
  private val listener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, code: Int, result: Int, intent: Intent?) {
      if (code != requestCode) return
      val promise = pending ?: return
      val payload = bytes
      pending = null
      bytes = null
      if (result != Activity.RESULT_OK || intent?.data == null || payload == null) {
        promise.reject("P12_SAVE_CANCELLED", "Đã hủy chọn vị trí lưu.")
        return
      }
      val uri = intent.data!!
      Thread {
        try {
          require(uri.scheme == "content")
          context.contentResolver.openOutputStream(uri, "w")?.use { it.write(payload); it.flush() }
            ?: throw IllegalStateException("Không mở được vị trí lưu.")
          val count = context.contentResolver.openInputStream(uri)?.use { stream ->
            var n = 0; val buffer = ByteArray(8192)
            while (true) { val read = stream.read(buffer); if (read < 0) break; n += read }
            n
          } ?: throw IllegalStateException("Không kiểm tra được tệp đã lưu.")
          require(count == payload.size)
          synchronized(allowedUris) { allowedUris.add(uri.toString()) }
          promise.resolve(Arguments.createMap().apply { putString("uri", uri.toString()); putInt("bytes", count) })
        } catch (_: Exception) { promise.reject("P12_SAVE_FAILED", "Không xác minh được tệp đã lưu.") }
        finally { payload.fill(0) }
      }.start()
    }
  }
  init { context.addActivityEventListener(listener) }
  @ReactMethod fun hashFile(value: String, promise: Promise) {
    Thread {
      try {
        val uri = Uri.parse(value)
        require(uri.scheme in listOf("content", "file"))
        val stream = if (uri.scheme == "content") context.contentResolver.openInputStream(uri)
          else File(requireNotNull(uri.path)).inputStream()
        val digest = MessageDigest.getInstance("SHA-256")
        var total = 0L
        stream?.use { input ->
          val buffer = ByteArray(65536)
          while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            total += count
            require(total <= 314572800L)
            digest.update(buffer, 0, count)
          }
          buffer.fill(0)
        } ?: throw IllegalStateException("Không đọc được tệp nguồn.")
        require(total > 0)
        val hash = digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
        promise.resolve(Arguments.createMap().apply { putString("sha256", hash); putDouble("bytes", total.toDouble()) })
      } catch (_: Exception) { promise.reject("P18_HASH_FAILED", "Không xác minh được bytes tệp nguồn.") }
    }.start()
  }
  @ReactMethod fun save(encoded: String, name: String, mime: String, promise: Promise) {
    if (pending != null) { promise.reject("P12_SAVE_BUSY", "Đang chọn vị trí lưu."); return }
    val activity = context.currentActivity
    if (activity == null || mime !in listOf("application/pdf", "image/png", "image/jpeg", "image/webp")) {
      promise.reject("P12_SAVE_UNAVAILABLE", "Không thể lưu tệp này."); return
    }
    try {
      val decoded = Base64.decode(encoded, Base64.DEFAULT)
      require(decoded.isNotEmpty())
      val valid = when (mime) {
        "application/pdf" -> decoded.take(5).toByteArray().toString(Charsets.US_ASCII) == "%PDF-"
        "image/png" -> decoded.take(8).toByteArray().contentEquals(byteArrayOf(-119,80,78,71,13,10,26,10))
        "image/jpeg" -> decoded.size >= 3 && decoded[0] == (-1).toByte() && decoded[1] == (-40).toByte() && decoded[2] == (-1).toByte()
        else -> decoded.size >= 12 && decoded.copyOfRange(0,4).toString(Charsets.US_ASCII) == "RIFF" && decoded.copyOfRange(8,12).toString(Charsets.US_ASCII) == "WEBP"
      }
      require(valid)
      pending = promise; bytes = decoded
      val filename = name.substringAfterLast('/').substringAfterLast('\\').filter { it >= ' ' }.ifBlank { "chung-tu" }
      activity.startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE); type = mime; putExtra(Intent.EXTRA_TITLE, filename)
      }, requestCode)
    } catch (_: Exception) { bytes?.fill(0); bytes=null; pending=null; promise.reject("P12_SAVE_FAILED", "Bytes tài liệu hoặc vị trí lưu chưa hợp lệ.") }
  }
  @ReactMethod fun open(value: String, promise: Promise) {
    if (!synchronized(allowedUris) { allowedUris.contains(value) }) { promise.reject("P12_FILE_NOT_OWNED", "Tệp chưa được xác minh trong lượt lưu này."); return }
    try {
      val uri = Uri.parse(value)
      context.startActivity(Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, context.contentResolver.getType(uri))
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      })
      promise.resolve(true)
    } catch (_: Exception) { promise.reject("P12_OPEN_FAILED", "Thiết bị chưa có ứng dụng phù hợp để mở tệp này.") }
  }
  @ReactMethod fun cancel() {
    pending?.reject("P12_SAVE_CANCELLED", "Đã đóng lượt lưu chứng từ.")
    pending=null; bytes?.fill(0); bytes=null
    synchronized(allowedUris) { allowedUris.clear() }
  }
  override fun invalidate() {
    context.removeActivityEventListener(listener); pending?.reject("P12_SAVE_CANCELLED", "Đã đóng trình lưu.")
    bytes?.fill(0); bytes=null; pending=null; synchronized(allowedUris) { allowedUris.clear() }
    super.invalidate()
  }
}
