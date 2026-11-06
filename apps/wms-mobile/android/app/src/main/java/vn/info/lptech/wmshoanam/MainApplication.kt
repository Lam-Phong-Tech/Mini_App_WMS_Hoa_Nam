package vn.info.lptech.wmshoanam

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.common.assets.ReactFontManager
import vn.info.lptech.wmshoanam.nfc.NfcPackage
import vn.info.lptech.wmshoanam.notifications.PushPackage
import vn.info.lptech.wmshoanam.security.SecureSessionPackage
import vn.info.lptech.wmshoanam.documents.P12DocumentsPackage
import vn.info.lptech.wmshoanam.recovery.P14RecoveryEntropyPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      // Debug APK reads Metro; release APK keeps developer support disabled.
      useDevSupport = BuildConfig.DEBUG,
      packageList =
        PackageList(this).packages.apply {
          // NFC dùng Android API trực tiếp, không có package npm để autolink.
          add(NfcPackage())
          add(PushPackage())
          // Refresh token tách khỏi MMKV, mã hoá bằng Android Keystore.
          add(SecureSessionPackage())
          add(P12DocumentsPackage())
          add(P14RecoveryEntropyPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // Isolated PDF service must never initialize React Native or session storage.
    val isolated = if (android.os.Build.VERSION.SDK_INT >= 28) android.os.Process.isIsolated()
      else !android.os.Process.isApplicationUid(android.os.Process.myUid())
    if (isolated || android.os.Process.myUid() != applicationInfo.uid) return
    ReactFontManager.getInstance().addCustomFont(this, "Inter", R.font.inter)
    loadReactNative(this)
  }
}
