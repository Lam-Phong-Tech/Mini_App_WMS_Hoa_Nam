package vn.info.lptech.wmshoanam.recovery

import android.util.Base64
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import java.security.SecureRandom
import java.util.UUID

class P14RecoveryEntropyModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "P14RecoveryEntropy"
  @ReactMethod
  fun createIdentity(promise: Promise) {
    try {
      val bytes = ByteArray(32)
      SecureRandom().nextBytes(bytes)
      val result = Arguments.createMap().apply {
        putString("operationId", UUID.randomUUID().toString())
        putString("proof", Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP))
      }
      promise.resolve(result)
    } catch (_: Exception) {
      promise.reject("RECOVERY_ENTROPY_UNAVAILABLE", "Không tạo được mã bảo vệ yêu cầu.")
    }
  }
}
class P14RecoveryEntropyPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(P14RecoveryEntropyModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
