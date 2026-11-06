package vn.info.lptech.wmshoanam.notifications

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** App-private metadata; installation proof and pending FCM token use Keystore AES/GCM. */
object PushStore {
 private fun prefs(c:Context)=c.getSharedPreferences("hn_push_v1",Context.MODE_PRIVATE)
 private fun key():SecretKey{val store=KeyStore.getInstance("AndroidKeyStore");store.load(null);(store.getKey("hn_push_v1",null) as? SecretKey)?.let{return it};val g=KeyGenerator.getInstance("AES","AndroidKeyStore");g.init(KeyGenParameterSpec.Builder("hn_push_v1",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());return g.generateKey()}
 private fun encrypt(value:String):String{val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());return Base64.encodeToString(cipher.iv+cipher.doFinal(value.toByteArray(Charsets.UTF_8)),Base64.NO_WRAP)}
 private fun decrypt(value:String):String{val bytes=Base64.decode(value,Base64.NO_WRAP);require(bytes.size>12);val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12)));return String(cipher.doFinal(bytes.copyOfRange(12,bytes.size)),Charsets.UTF_8)}
 private fun commit(edit:android.content.SharedPreferences.Editor){check(edit.commit()){"Notification storage unavailable"}}
 @Synchronized fun identity(c:Context):JSONObject{val p=prefs(c);val stored=p.getString("identity",null);if(stored!=null)return JSONObject(decrypt(stored));val bytes=ByteArray(32);SecureRandom().nextBytes(bytes);val i=JSONObject().put("installationId",UUID.randomUUID().toString()).put("proof",Base64.encodeToString(bytes,Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING));commit(p.edit().putString("identity",encrypt(i.toString())));return i}
 @Synchronized fun binding(c:Context):JSONObject?=prefs(c).getString("binding",null)?.let{JSONObject(it)}
 fun matches(a:JSONObject?,b:JSONObject):Boolean=a!=null&&a.optString("registrationId")==b.optString("registrationId")&&a.optLong("bindingVersion")==b.optLong("bindingVersion")
 @Synchronized fun store(c:Context,b:JSONObject){val p=prefs(c);val v=b.getLong("bindingVersion");val old=binding(c);if(v>p.getLong("cleared_version",0)&&(old==null||v>old.getLong("bindingVersion")||matches(old,b))){commit(p.edit().putString("binding",b.toString()).putBoolean("pending_token_sync",false).putBoolean("consent",true))}}
 @Synchronized fun clear(c:Context,b:JSONObject):Boolean{if(!matches(binding(c),b))return false;commit(prefs(c).edit().remove("binding").putLong("cleared_version",b.getLong("bindingVersion")).putBoolean("consent",false));return true}
 @Synchronized fun rotated(c:Context,token:String){commit(prefs(c).edit().putString("pending_token",encrypt(token)).putBoolean("pending_token_sync",true))}
 @Synchronized fun consent(c:Context):Boolean=prefs(c).getBoolean("consent",false)
 @Synchronized fun claim(c:Context,p:JSONObject):Boolean{val b=JSONObject().put("registrationId",p.getString("registration_id")).put("bindingVersion",p.getString("binding_version").toLong());if(!matches(binding(c),b))return false;val prefs=prefs(c);val now=System.currentTimeMillis();val key="seen:"+p.getString("delivery_id");if(prefs.contains(key))return false;val e=prefs.edit();prefs.all.forEach{(k,v)->if(k.startsWith("seen:")&&v is Long&&v<=now)e.remove(k)};commit(e.putLong(key,java.time.OffsetDateTime.parse(p.getString("expires_at")).toInstant().toEpochMilli()));return true}
 @Synchronized fun click(c:Context,p:JSONObject){commit(prefs(c).edit().putString("click",p.toString()))}
 @Synchronized fun consumeClick(c:Context):JSONObject?{val p=prefs(c);val value=p.getString("click",null);commit(p.edit().remove("click"));return value?.let{JSONObject(it)}}
 @Synchronized fun readTestIntent(c:Context):JSONObject?=prefs(c).getString("test_intent",null)?.let{JSONObject(it)}
 @Synchronized fun storeTestIntent(c:Context,v:JSONObject){commit(prefs(c).edit().putString("test_intent",v.toString()))}
}
