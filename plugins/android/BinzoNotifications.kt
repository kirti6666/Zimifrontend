package __PACKAGE__

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ViewManager
import expo.modules.notifications.notifications.model.Notification as ExpoNotification
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.notifications.model.NotificationResponse
import expo.modules.notifications.notifications.model.RemoteNotificationContent
import expo.modules.notifications.notifications.model.triggers.FirebaseNotificationTrigger
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.delegates.ExpoHandlingDelegate
import expo.modules.notifications.service.delegates.ExpoPresentationDelegate
import expo.modules.notifications.service.interfaces.HandlingDelegate
import expo.modules.notifications.service.interfaces.PresentationDelegate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

internal object BinzoNotifications {
  const val CHANNEL = "incoming-calls-v2"
  const val EXPIRE = "com.binzolive.notifications.EXPIRE_CALL"
  const val CALL_ID = "binzo.callId"
  private fun settings(context: Context) = context.getSharedPreferences("binzo-notifications-v1", Context.MODE_PRIVATE)
  private fun endedCalls(context: Context) = context.getSharedPreferences("binzo-ended-calls-v1", Context.MODE_PRIVATE)
  fun owner(context: Context): String? = settings(context).getString("owner", null)
  fun envelope(context: Context, notification: ExpoNotification): BinzoNotificationPolicy.Envelope? {
    val data = (notification.notificationRequest.trigger as? FirebaseNotificationTrigger)?.remoteMessage?.data ?: return null
    val prefs = settings(context)
    val envelope = BinzoNotificationPolicy.validate(data, prefs.getString("owner", null), prefs.getBoolean("enabled", false),
      BinzoNotificationPolicy.categories.filter { prefs.getBoolean(it, false) }.toSet(), System.currentTimeMillis()) ?: return null
    if (envelope.incoming && endedCalls(context).getLong("${owner(context)}:${envelope.targetId}", 0) > System.currentTimeMillis()) return null
    return envelope
  }
  fun remote(notification: ExpoNotification) = notification.notificationRequest.trigger is FirebaseNotificationTrigger
  @Synchronized fun setAccount(context: Context, owner: String?, enabled: Boolean, categories: ReadableMap) {
    val prefs = settings(context)
    val oldOwner = prefs.getString("owner", null)
    val edit = prefs.edit().clear().putString("owner", owner).putBoolean("enabled", enabled)
    BinzoNotificationPolicy.categories.forEach { key -> edit.putBoolean(key, categories.hasKey(key) && !categories.isNull(key) && categories.getBoolean(key)) }
    check(edit.commit()) { "Could not save notification settings" }
    if (oldOwner != owner) (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancelAll()
    else if (!enabled || !categories.hasKey("calls") || !categories.getBoolean("calls")) dismiss(context, null)
  }
  fun channel(context: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val channel = NotificationChannel(CHANNEL, "Incoming calls", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Incoming voice and video calls"
      lockscreenVisibility = Notification.VISIBILITY_PRIVATE
      setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
      enableVibration(true);vibrationPattern = longArrayOf(0, 300, 200, 300)
    }
    (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
  }
  private fun timeoutIntent(context: Context, id: String): PendingIntent = PendingIntent.getBroadcast(context, id.hashCode(),
    Intent(context, BinzoNotificationsService::class.java).setAction(EXPIRE).putExtra(CALL_ID, id), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  fun timeout(context: Context, id: String, remaining: Long) {
    if (Build.VERSION.SDK_INT < 26) (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + remaining, timeoutIntent(context, id))
  }
  @Synchronized fun dismiss(context: Context, id: String?) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val tombstones = endedCalls(context)
    val edit = tombstones.edit()
    val now = System.currentTimeMillis()
    tombstones.all.filterValues { it is Long && it <= now }.keys.forEach { edit.remove(it) }
    if (id != null) edit.putLong("${owner(context)}:$id", now + 180_000)
    manager.activeNotifications.filter { it.notification.extras.getString(CALL_ID)?.let { call -> id == null || call == id } == true }.forEach { manager.cancel(it.tag, it.id) }
    edit.commit()
    if (id != null && Build.VERSION.SDK_INT < 26) (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(timeoutIntent(context, id))
  }
}

/** Keeps Expo's pending-intent and cold-launch response path intact. */
class BinzoNotificationsService : NotificationsService() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action == BinzoNotifications.EXPIRE) {
      intent.getStringExtra(BinzoNotifications.CALL_ID)?.takeIf { BinzoNotificationPolicy.validId(it) }?.let { BinzoNotifications.dismiss(context, it) };return
    }
    super.onReceive(context, intent)
  }
  override fun getHandlingDelegate(context: Context): HandlingDelegate {
    val delegate = ExpoHandlingDelegate(context)
    return object : HandlingDelegate {
      override fun handleNotification(notification: ExpoNotification) {
        if (BinzoNotifications.remote(notification)) {
          val envelope = BinzoNotifications.envelope(context, notification) ?: return
          if (envelope.ended) { BinzoNotifications.dismiss(context, envelope.targetId);return }
          // Expo 57 deliberately skips its JS presentation handler for data-only
          // notifications in the foreground. Present our validated envelope here;
          // retain the normal listener dispatch below for received/tap events.
          val content = notification.notificationRequest.content
          if (content is RemoteNotificationContent && content.isDataOnly && delegate.isAppInForeground()) NotificationsService.present(context, notification)
        }
        delegate.handleNotification(notification)
      }
      override fun handleNotificationResponse(response: NotificationResponse) {
        BinzoNotifications.envelope(context, response.notification)?.takeIf { it.incoming }?.let { BinzoNotifications.dismiss(context, it.targetId) }
        delegate.handleNotificationResponse(response)
      }
      override fun handleNotificationsDropped() = delegate.handleNotificationsDropped()
    }
  }
  override fun getPresentationDelegate(context: Context): PresentationDelegate = object : ExpoPresentationDelegate(context) {
    override fun presentNotification(notification: ExpoNotification, behavior: NotificationBehaviorRecord?) {
      if (behavior?.shouldPresentAlert == false) return
      if (BinzoNotifications.remote(notification)) {
        val envelope = BinzoNotifications.envelope(context, notification) ?: return
        if (envelope.ended) { BinzoNotifications.dismiss(context, envelope.targetId);return }
        if (envelope.incoming) BinzoNotifications.channel(context)
      }
      CoroutineScope(Dispatchers.IO).launch {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return@launch
        val result = createNotification(notification, behavior)
        synchronized(BinzoNotifications) {
          // Recheck after asynchronous icon loading and serialize presentation
          // with logout/category changes and terminal call controls.
          if (BinzoNotifications.remote(notification) && BinzoNotifications.envelope(context, notification)?.let { !it.ended } != true) return@launch
          // Permission can be revoked while a remote image is loading.
          runCatching { NotificationManagerCompat.from(context).notify(notification.notificationRequest.identifier, getNotifyId(notification.notificationRequest), result) }
        }
      }
    }
    override suspend fun createNotification(notification: ExpoNotification, notificationBehavior: NotificationBehaviorRecord?): Notification {
      val result = super.createNotification(notification, notificationBehavior)
      val envelope = BinzoNotifications.envelope(context, notification)
      if (envelope?.incoming != true || notificationBehavior?.shouldPlaySound == false) return result
      val remaining = (envelope.expiresAt!! - System.currentTimeMillis()).coerceIn(1, 180_000)
      val builder = Notification.Builder.recoverBuilder(context, result).setCategory(Notification.CATEGORY_CALL).setOngoing(true).setAutoCancel(true).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE)
      if (Build.VERSION.SDK_INT >= 26) builder.setChannelId(BinzoNotifications.CHANNEL).setTimeoutAfter(remaining)
      else builder.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
      val ringing = builder.build()
      ringing.flags = ringing.flags or Notification.FLAG_INSISTENT
      ringing.extras.putString(BinzoNotifications.CALL_ID, envelope.targetId)
      BinzoNotifications.timeout(context, envelope.targetId!!, remaining)
      return ringing
    }
  }
}

class BinzoNotificationsModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "BinzoNotifications"
  override fun getConstants(): Map<String, Any> = mapOf("protocol" to BinzoNotificationPolicy.PROTOCOL)
  @ReactMethod fun setAccount(accountId: String?, enabled: Boolean, categories: ReadableMap, promise: Promise) {
    try { val owner = accountId?.takeIf { BinzoNotificationPolicy.validId(it) };BinzoNotifications.setAccount(reactApplicationContext, owner, enabled && owner != null, categories);BinzoNotifications.channel(reactApplicationContext);promise.resolve(null) }
    catch (_: Exception) { promise.reject("NOTIFICATIONS_SETTINGS", "Notification settings could not be saved.") }
  }
  @ReactMethod fun dismissCall(callId: String?, promise: Promise) {
    try { if (callId == null || BinzoNotificationPolicy.validId(callId)) BinzoNotifications.dismiss(reactApplicationContext, callId);promise.resolve(null) }
    catch (_: Exception) { promise.reject("NOTIFICATIONS_DISMISS", "The call notification could not be dismissed.") }
  }
}
class BinzoNotificationsPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext) = listOf(BinzoNotificationsModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
