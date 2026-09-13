package vn.info.lptech.wmshoanam.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Persists only the refresh credential, encrypted with a non-exportable
 * Android Keystore AES key. The ciphertext is safe to keep in app-private
 * SharedPreferences; the key never enters JS or MMKV. */
class SecureSessionModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName(): String = "WmsSecureSession"

  @ReactMethod
  fun getRefreshToken(promise: Promise) {
    try {
      val encoded = preferences().getString(REFRESH_TOKEN_KEY, null)
      if (encoded.isNullOrBlank()) {
        promise.resolve(null)
        return
      }
      val bytes = Base64.decode(encoded, Base64.NO_WRAP)
      if (bytes.size <= GCM_IV_BYTES) throw IllegalStateException("Ciphertext không hợp lệ.")
      val iv = bytes.copyOfRange(0, GCM_IV_BYTES)
      val encrypted = bytes.copyOfRange(GCM_IV_BYTES, bytes.size)
      val cipher = Cipher.getInstance(CIPHER)
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(GCM_TAG_BITS, iv))
      promise.resolve(String(cipher.doFinal(encrypted), StandardCharsets.UTF_8))
    } catch (error: Exception) {
      // A ciphertext that cannot be read must never be retried as if the old
      // refresh token were valid. Remove it and require a new login instead.
      preferences().edit().remove(REFRESH_TOKEN_KEY).commit()
      promise.reject("SECURE_REFRESH_UNREADABLE", "Không đọc được phiên bảo mật. Đăng nhập lại.", error)
    }
  }

  @ReactMethod
  fun setRefreshToken(token: String, promise: Promise) {
    if (token.isBlank()) {
      promise.reject("SECURE_REFRESH_EMPTY", "Refresh token trống.")
      return
    }
    try {
      val cipher = Cipher.getInstance(CIPHER)
      // Android Keystore generates the GCM nonce. Passing a caller nonce while
      // `setRandomizedEncryptionRequired(true)` is enabled is rejected by
      // KeyMint (`NONCE ... CALLER_NONCE`), which previously made Login fail
      // after the server had already returned valid tokens.
      cipher.init(Cipher.ENCRYPT_MODE, key())
      val iv = cipher.iv
      val encrypted = cipher.doFinal(token.toByteArray(StandardCharsets.UTF_8))
      val packed = ByteArray(iv.size + encrypted.size)
      System.arraycopy(iv, 0, packed, 0, iv.size)
      System.arraycopy(encrypted, 0, packed, iv.size, encrypted.size)
      if (!preferences().edit().putString(REFRESH_TOKEN_KEY, Base64.encodeToString(packed, Base64.NO_WRAP)).commit()) {
        throw IllegalStateException("Không ghi được phiên bảo mật.")
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("SECURE_REFRESH_WRITE_FAILED", "Không lưu được phiên bảo mật.", error)
    }
  }

  @ReactMethod
  fun clearRefreshToken(promise: Promise) {
    try {
      if (!preferences().edit().remove(REFRESH_TOKEN_KEY).commit()) {
        throw IllegalStateException("Không xoá được phiên bảo mật.")
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("SECURE_REFRESH_CLEAR_FAILED", "Không xoá được phiên bảo mật.", error)
    }
  }

  private fun preferences() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore")
    store.load(null)
    val existing = store.getKey(KEY_ALIAS, null) as? SecretKey
    if (existing != null) return existing

    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setKeySize(256)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .build(),
    )
    return generator.generateKey()
  }

  private companion object {
    const val PREFS = "wms.secure.session"
    const val REFRESH_TOKEN_KEY = "refresh_token.v1"
    const val KEY_ALIAS = "wms.refresh-token.v1"
    const val CIPHER = "AES/GCM/NoPadding"
    const val GCM_IV_BYTES = 12
    const val GCM_TAG_BITS = 128
  }
}
