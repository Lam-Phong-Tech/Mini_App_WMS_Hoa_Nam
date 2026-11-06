package vn.info.lptech.wmshoanam.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import vn.info.lptech.wmshoanam.MainActivity
import vn.info.lptech.wmshoanam.R
import vn.info.lptech.wmshoanam.BuildConfig

object PushPayload {
 private val uuid=Regex("^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$")
 fun valid(p:JSONObject,click:Boolean=false):Boolean=try{
  val keys=p.keys().asSequence().toSet()
  val fields=setOf("contract","delivery_id","recipient_id","registration_id","binding_version","expires_at")
  keys==fields&&keys.all{p.get(it) is String}&&p.getString("contract")=="notification-delivery-v1"&&
   listOf("delivery_id","recipient_id","registration_id").all{uuid.matches(p.getString(it))}&&
   Regex("^[1-9][0-9]*$").matches(p.getString("binding_version"))&&p.getString("binding_version").toLong()<=9007199254740991L&&
   java.time.OffsetDateTime.parse(p.getString("expires_at")).toInstant().toEpochMilli().let{click||it>System.currentTimeMillis()}
 }catch(_:Exception){false}
}
class HnMessagingService:FirebaseMessagingService(){
 override fun onNewToken(token:String){try{PushStore.rotated(this,token);PushModule.emit("HnNotificationToken",JSONObject(),true)}catch(_:Exception){/* No token or provider error is logged. */}}
 override fun onMessageReceived(message:RemoteMessage){try{
  if(!BuildConfig.HN_NOTIFICATION_DEV_TEST||message.notification!=null||!PushStore.consent(this))return
  val p=JSONObject(message.data as Map<*,*>);if(!PushPayload.valid(p)||!PushStore.claim(this,p))return
  if(PushModule.emit("HnNotificationMessage",p,true))return
  if(Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(this,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return
  val manager=getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  if(!manager.areNotificationsEnabled())return
  if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(NotificationChannel("hn_operations_v1","Thông báo nghiệp vụ",NotificationManager.IMPORTANCE_DEFAULT))
  val intent=Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("hn_notification_payload",p.toString())
  val pending=PendingIntent.getActivity(this,p.getString("delivery_id").hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  manager.notify("hn:"+p.getString("recipient_id"),0,NotificationCompat.Builder(this,"hn_operations_v1").setSmallIcon(R.drawable.ic_notification).setContentTitle("Hoa Nam Scanner").setContentText("Bạn có thông báo nghiệp vụ mới.").setContentIntent(pending).setAutoCancel(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).build())
 }catch(_:Exception){/* Fail closed; P13 remains available. */}}
 companion object{
  fun acceptClick(c:Context,intent:Intent?){try{val raw=intent?.getStringExtra("hn_notification_payload")?:return;intent.removeExtra("hn_notification_payload");val p=JSONObject(raw);if(!PushPayload.valid(p,true))return;val b=JSONObject().put("registrationId",p.getString("registration_id")).put("bindingVersion",p.getString("binding_version").toLong());if(!PushStore.matches(PushStore.binding(c),b))return;PushStore.click(c,p);PushModule.emit("HnNotificationClick",p,true)}catch(_:Exception){}}
 }
}
