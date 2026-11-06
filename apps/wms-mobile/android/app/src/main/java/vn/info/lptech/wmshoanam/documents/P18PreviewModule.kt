package vn.info.lptech.wmshoanam.documents

import android.content.*
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.*
import android.util.Base64
import com.facebook.react.bridge.*
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/** Private, temporary, read-only bytes. No URL, token, external storage, or file picker. */
class P18PreviewModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private data class Preview(val id: String, val dir: File, val file: File, val mime: String, val pages: Int, val width: Int, val height: Int, val renderTicket: AtomicInteger = AtomicInteger())
  private val previews = ConcurrentHashMap<String, Preview>()
  private val main = Handler(Looper.getMainLooper())
  @Volatile private var disposed = false
  override fun getName() = "P18Preview"
  private fun erase(dir: File) { dir.listFiles()?.filter { it.isFile }?.forEach { it.delete() }; dir.delete() }
  init {
    // No session can adopt previews left by a previous process.
    File(context.cacheDir, "p18-previews").listFiles()?.filter { it.isDirectory && it.name.matches(Regex("[a-f0-9-]{36}")) }?.forEach { erase(it) }
  }
  private fun pdf(file: File, page: Int, width: Int, output: File?, done: (Bundle) -> Unit, failed: () -> Unit) {
    main.post {
      val finished = AtomicBoolean(false)
      var bound = false
      lateinit var connection: ServiceConnection
      lateinit var timeout: Runnable
      fun finish(result: Bundle?) {
        if (!finished.compareAndSet(false, true)) return
        main.removeCallbacks(timeout)
        if (bound) try { context.unbindService(connection) } catch (_: Exception) { }
        if (!disposed && result?.getBoolean("ok") == true) done(result) else failed()
      }
      val reply = Messenger(object : Handler(Looper.getMainLooper()) {
        override fun handleMessage(message: Message) { finish(message.data) }
      })
      connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
          if (finished.get()) return
          var input: ParcelFileDescriptor? = null
          var target: ParcelFileDescriptor? = null
          try {
            input = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
            if (output != null) target = ParcelFileDescriptor.open(output, ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_TRUNCATE or ParcelFileDescriptor.MODE_WRITE_ONLY)
            val data = Bundle().apply {
              putParcelable("input", input); putParcelable("output", target)
              putInt("page", page); putInt("width", width)
            }
            Messenger(binder).send(Message.obtain(null, 1).apply { this.data = data; replyTo = reply })
          } catch (_: Exception) { finish(null) }
          finally { try { input?.close() } catch (_: Exception) { }; try { target?.close() } catch (_: Exception) { } }
        }
        override fun onServiceDisconnected(name: ComponentName) { finish(null) }
        override fun onBindingDied(name: ComponentName) { finish(null) }
        override fun onNullBinding(name: ComponentName) { finish(null) }
      }
      timeout = Runnable { finish(null) }
      main.postDelayed(timeout, 20000)
      try {
        bound = context.bindService(Intent(context, P18PdfService::class.java), connection, Context.BIND_AUTO_CREATE)
        if (!bound) finish(null)
      } catch (_: Exception) { finish(null) }
    }
  }
  @ReactMethod fun open(encoded: String, mime: String, promise: Promise) {
    Thread {
      val id = UUID.randomUUID().toString()
      val dir = File(File(context.cacheDir, "p18-previews"), id)
      var payload: ByteArray? = null
      try {
        check(!disposed && encoded.length <= 27962028)
        require(mime in listOf("application/pdf", "image/png", "image/jpeg", "image/webp"))
        payload = Base64.decode(encoded, Base64.DEFAULT)
        require(payload.isNotEmpty() && payload.size <= 20971520)
        check(dir.mkdirs())
        val file = File(dir, "document")
        file.writeBytes(payload)
        val byteCount = payload.size
        if (mime == "application/pdf") {
          require(payload.size >= 5 && payload.copyOfRange(0, 5).toString(Charsets.US_ASCII) == "%PDF-")
          pdf(file, 0, 1000, null, { data ->
            if (disposed) { erase(dir); promise.reject("P18_PREVIEW_CLOSED", "Đã đóng bộ xem.") }
            else {
              val preview = Preview(id, dir, file, mime, data.getInt("pages"), data.getInt("width"), data.getInt("height"))
              previews[id] = preview
              promise.resolve(info(preview, byteCount))
            }
          }, { erase(dir); promise.reject("P18_PDF_UNAVAILABLE", "Không đọc được PDF, tệp có thể bị khóa hoặc không hợp lệ.") })
        } else {
          val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
          BitmapFactory.decodeFile(file.absolutePath, options)
          require(options.outMimeType == mime && options.outWidth > 0 && options.outHeight > 0 && options.outWidth.toLong() * options.outHeight <= 40000000L)
          check(!disposed)
          val preview = Preview(id, dir, file, mime, 1, options.outWidth, options.outHeight)
          previews[id] = preview
          promise.resolve(info(preview, byteCount))
        }
      } catch (_: Exception) { erase(dir); promise.reject("P18_PREVIEW_INVALID", "Chưa thể xem tệp này trong ứng dụng (tối đa 20 MiB).") }
      finally { payload?.fill(0) }
    }.start()
  }
  private fun info(preview: Preview, bytes: Int) = Arguments.createMap().apply {
    putString("id", preview.id); putString("mime", preview.mime); putInt("pages", preview.pages)
    putInt("width", preview.width); putInt("height", preview.height); putInt("bytes", bytes)
    if (preview.mime != "application/pdf") putString("uri", Uri.fromFile(preview.file).toString())
  }
  @ReactMethod fun render(id: String, page: Int, width: Int, promise: Promise) {
    val preview = previews[id]
    if (disposed || preview == null || preview.mime != "application/pdf" || page !in 1..preview.pages) {
      promise.reject("P18_PREVIEW_CLOSED", "Tệp hoặc trang không thuộc lượt xem này."); return
    }
    val output = File(preview.dir, "page-${UUID.randomUUID()}.png")
    val ticket = preview.renderTicket.incrementAndGet()
    pdf(preview.file, page - 1, width, output, { data ->
      if (previews[id] !== preview || disposed || preview.renderTicket.get() != ticket) { output.delete(); promise.reject("P18_PREVIEW_CLOSED", "Đã đóng hoặc đổi trang xem.") }
      else {
        preview.dir.listFiles()?.filter { it.name.startsWith("page-") && it != output }?.forEach { it.delete() }
        promise.resolve(Arguments.createMap().apply { putString("uri", Uri.fromFile(output).toString()); putInt("width", data.getInt("width")); putInt("height", data.getInt("height")) })
      }
    }, { output.delete(); promise.reject("P18_PDF_PAGE_FAILED", "Chưa render được trang PDF.") })
  }
  @ReactMethod fun close(id: String) { previews.remove(id)?.let { erase(it.dir) } }
  override fun invalidate() {
    disposed = true
    previews.values.forEach { erase(it.dir) }; previews.clear()
    super.invalidate()
  }
}
