package vn.info.lptech.wmshoanam.documents

import android.app.Service
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.*
import kotlin.math.min
import kotlin.math.sqrt

/** Isolated UID: receives only explicit document/output descriptors, no app files or auth. */
class P18PdfService : Service() {
  private lateinit var worker: HandlerThread
  private lateinit var messenger: Messenger
  override fun onCreate() {
    super.onCreate()
    worker = HandlerThread("p18-pdf").apply { start() }
    messenger = Messenger(object : Handler(worker.looper) {
      @Suppress("DEPRECATION")
      override fun handleMessage(message: Message) {
        val input = message.data.getParcelable<ParcelFileDescriptor>("input")
        val output = message.data.getParcelable<ParcelFileDescriptor>("output")
        val result = Bundle()
        try {
          require(input != null)
          PdfRenderer(input).use { renderer ->
            require(renderer.pageCount in 1..10000)
            val index = message.data.getInt("page", 0)
            require(index in 0 until renderer.pageCount)
            renderer.openPage(index).use { page ->
              require(page.width > 0 && page.height > 0)
              result.putInt("pages", renderer.pageCount)
              result.putInt("width", page.width)
              result.putInt("height", page.height)
              if (output != null) {
                val desired = message.data.getInt("width", 1000).coerceIn(200, 1800)
                val ratio = min(desired.toDouble() / page.width, min(4096.0 / page.height, sqrt(4000000.0 / (page.width.toDouble() * page.height))))
                val width = (page.width * ratio).toInt().coerceAtLeast(1)
                val height = (page.height * ratio).toInt().coerceAtLeast(1)
                val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                try {
                  bitmap.eraseColor(Color.WHITE)
                  page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                  ParcelFileDescriptor.AutoCloseOutputStream(output).use { stream ->
                    check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream))
                    stream.flush()
                  }
                  result.putInt("width", width)
                  result.putInt("height", height)
                } finally { bitmap.recycle() }
              }
            }
          }
          result.putBoolean("ok", true)
        } catch (_: Throwable) {
          result.putBoolean("ok", false)
        } finally {
          try { input?.close() } catch (_: Exception) { }
          try { output?.close() } catch (_: Exception) { }
        }
        try { message.replyTo?.send(Message.obtain(null, 1).apply { data = result }) } catch (_: Exception) { }
      }
    })
  }
  override fun onBind(intent: Intent): IBinder = messenger.binder
  override fun onDestroy() { worker.quitSafely(); super.onDestroy() }
}
