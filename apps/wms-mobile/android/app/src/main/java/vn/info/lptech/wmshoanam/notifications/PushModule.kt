package vn.info.lptech.wmshoanam.notifications

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.common.LifecycleState
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailabilityLight
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.UUID
import vn.info.lptech.wmshoanam.BuildConfig

class PushModule(private val ctx:ReactApplicationContext):ReactContextBaseJavaModule(ctx){
 init{active=WeakReference(ctx)}
 override fun getName()="HnNotificationPush"
 private fun status():String{
  if(!BuildConfig.HN_NOTIFICATION_DEV_TEST||ctx.packageName!="vn.info.lptech.wmshoanam")return "not-configured"
  val app=try{FirebaseApp.getInstance()}catch(_:Exception){return "not-configured"}
  if(app.options.projectId!="hoa-nam-scanner-devtest"||app.options.applicationId!="1:57106079765:android:5e2e41442dc487ff60ee1c")return "not-configured"
  if(GoogleApiAvailabilityLight.getInstance().isGooglePlayServicesAvailable(ctx)!=ConnectionResult.SUCCESS)return "unsupported"
  if(Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(ctx,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return "default"
  val n=ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  return if(n.areNotificationsEnabled())"granted" else "denied"
 }
 @ReactMethod fun support(p:Promise){p.resolve(status())}
 @ReactMethod fun identity(p:Promise){safe(p){jsonMap(PushStore.identity(ctx))}}
 @ReactMethod fun token(p:Promise){if(status()!="granted"){p.reject("PUSH_UNAVAILABLE","Thông báo thiết bị chưa sẵn sàng.");return};FirebaseMessaging.getInstance().token.addOnCompleteListener{t->if(t.isSuccessful){try{PushStore.rotated(ctx,t.result);p.resolve(t.result)}catch(_:Exception){p.reject("PUSH_STORAGE_FAILED","Không lưu được thông báo thiết bị.")}}else p.reject("PUSH_TOKEN_UNAVAILABLE","Chưa lấy được token thông báo.")}}
 @ReactMethod fun getBinding(p:Promise){safe(p){PushStore.binding(ctx)?.let{jsonMap(it)}}}
 @ReactMethod fun storeBinding(b:ReadableMap,p:Promise){safe(p){val j=binding(b);PushStore.store(ctx,j);null}}
 @ReactMethod fun clearBinding(b:ReadableMap,p:Promise){safe(p){PushStore.clear(ctx,binding(b))}}
 @ReactMethod fun newRequestKey(p:Promise){p.resolve(UUID.randomUUID().toString())}
 @ReactMethod fun consumeClick(p:Promise){safe(p){PushStore.consumeClick(ctx)?.let{jsonMap(it)}}}
 @ReactMethod fun readTestIntent(p:Promise){safe(p){PushStore.readTestIntent(ctx)?.let{jsonMap(it)}}}
 @ReactMethod fun storeTestIntent(v:ReadableMap,p:Promise){safe(p){val id=v.getString("requestKey")?:error("Request key required");UUID.fromString(id);val b=binding(v.getMap("binding")?:error("Binding required"));PushStore.storeTestIntent(ctx,JSONObject().put("requestKey",id).put("binding",b));null}}
 @ReactMethod fun addListener(name:String){}
 @ReactMethod fun removeListeners(count:Int){}
 private fun binding(b:ReadableMap):JSONObject{val id=b.getString("registrationId")?:error("Binding required");require(Regex("^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$").matches(id));val v=b.getDouble("bindingVersion");require(v>=1&&v<=9007199254740991.0&&v%1==0.0);return JSONObject().put("registrationId",id).put("bindingVersion",v.toLong())}
 private fun safe(p:Promise,call:()->Any?){try{p.resolve(call())}catch(_:Exception){p.reject("PUSH_STORAGE_UNAVAILABLE","Chưa đọc được cấu hình thông báo thiết bị.")}}
 companion object{
  private var active:WeakReference<ReactApplicationContext>?=null
  private fun plain(j:JSONObject):Map<String,Any?> = j.keys().asSequence().associateWith{key->val v=j.get(key);when(v){is JSONObject->plain(v);is Number->v.toDouble();JSONObject.NULL->null;else->v}}
  fun jsonMap(j:JSONObject):WritableMap=Arguments.makeNativeMap(plain(j))
  fun emit(name:String,p:JSONObject,foregroundOnly:Boolean):Boolean{val c=active?.get()?:return false;if(!c.hasActiveReactInstance()||(foregroundOnly&&c.lifecycleState!=LifecycleState.RESUMED))return false;c.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(name,jsonMap(p));return true}
 }
}
