package expo.modules.binzomedia

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/** Keeps permissioned private-call capture alive when its Activity is hidden.
 * This service never opens a camera, accepts a call, or restarts after a kill. */
class CallForegroundService : Service() {
  @Volatile private var callId: String? = null
  @Volatile private var video = false
  private var createdFor: String? = null

  override fun onCreate() {
    super.onCreate()
    createdFor = requested?.id
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val id = intent?.getStringExtra(CALL_ID)
    if (id == null || requested?.id != id) {
      if (requested == null) stopSelf()
      return START_NOT_STICKY
    }
    if (intent.action == END) {
      endFromSystem(id)
      return START_NOT_STICKY
    }
    val wanted = requested ?: return START_NOT_STICKY
    try {
      check(checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { "Microphone permission is required." }
      if (wanted.video) check(checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) { "Camera permission is required." }
      if (Build.VERSION.SDK_INT >= 26) {
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(
          NotificationChannel(CHANNEL, "Ongoing calls", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Voice and video calls in progress"
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            setSound(null, null)
          },
        )
      }
      val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
      val open = packageManager.getLaunchIntentForPackage(packageName)?.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      val end = Intent(this, CallForegroundService::class.java).setAction(END).setData(Uri.fromParts("binzo-call", id, null)).putExtra(CALL_ID, id)
      val notification = builder.setSmallIcon(android.R.drawable.sym_call_outgoing)
        .setContentTitle("BinzoLive call in progress")
        .setContentText("Tap to return to BinzoLive")
        .setCategory(Notification.CATEGORY_CALL).setVisibility(Notification.VISIBILITY_PRIVATE)
        .setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
        .setContentIntent(open?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) })
        .addAction(android.R.drawable.ic_menu_close_clear_cancel, "End call", PendingIntent.getService(this, 0, end, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        .build()
      if (Build.VERSION.SDK_INT >= 30) {
        val types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or if (wanted.video) ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA else 0
        startForeground(NOTIFICATION_ID, notification, types)
      } else startForeground(NOTIFICATION_ID, notification)
      callId = id
      video = wanted.video
      running = this
      wanted.timeout?.let(main::removeCallbacks)
      val callbacks = wanted.callbacks.toList(); wanted.callbacks.clear()
      callbacks.forEach { runCatching { it(null) } }
    } catch (error: Exception) {
      if (requested === wanted) requested = null
      wanted.timeout?.let(main::removeCallbacks)
      wanted.callbacks.toList().forEach { runCatching { it(error) } }; wanted.callbacks.clear()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
    return START_NOT_STICKY
  }

  private fun endFromSystem(id: String) {
    if (requested?.id != id) return
    requested?.timeout?.let(main::removeCallbacks)
    requested = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
    runCatching { onStopped?.invoke(id) }
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    callId?.let(::endFromSystem)
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    if (running === this) running = null
    val id = callId ?: createdFor
    if (id != null && requested?.id == id) {
      val pending = requested; requested = null
      pending?.timeout?.let(main::removeCallbacks)
      pending?.callbacks?.toList()?.forEach { runCatching { it(IllegalStateException("Call service stopped.")) } }
      runCatching { onStopped?.invoke(id) }
    }
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  companion object {
    private const val CHANNEL = "binzo_ongoing_calls"
    private const val NOTIFICATION_ID = 17242
    private const val CALL_ID = "binzo.callId"
    private const val END = "expo.modules.binzomedia.END_CALL"
    private val main = Handler(Looper.getMainLooper())
    private data class Request(val id: String, val video: Boolean, val callbacks: MutableList<(Exception?) -> Unit>, var timeout: Runnable? = null)
    private var requested: Request? = null
    @Volatile private var running: CallForegroundService? = null
    internal var onStopped: ((String) -> Unit)? = null

    internal fun isRunning(id: String, video: Boolean): Boolean = running?.let { it.callId == id && it.video == video } == true

    internal fun start(context: Context, id: String, video: Boolean, callback: (Exception?) -> Unit) {
      main.post {
        val old = requested
        if (old?.id == id && old.video == video) {
          if (isRunning(id, video)) runCatching { callback(null) }
          else old.callbacks.add(callback)
          return@post
        }
        old?.timeout?.let(main::removeCallbacks)
        old?.callbacks?.toList()?.forEach { runCatching { it(IllegalStateException("Call request replaced.")) } }
        val next = Request(id, video, mutableListOf(callback)); requested = next
        // Keep a failed/dropped startup from holding a server call indefinitely.
        // Cancel before Android's foreground-promotion deadline as well.
        next.timeout = Runnable {
          if (requested !== next || next.callbacks.isEmpty()) return@Runnable
          requested = null
          next.callbacks.toList().forEach { runCatching { it(IllegalStateException("Call service start timed out.")) } }; next.callbacks.clear()
          context.stopService(Intent(context, CallForegroundService::class.java))
        }
        main.postDelayed(next.timeout!!, 4000)
        try {
          val intent = Intent(context, CallForegroundService::class.java).putExtra(CALL_ID, id)
          if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
        } catch (error: Exception) {
          if (requested === next) requested = null
          next.timeout?.let(main::removeCallbacks)
          next.callbacks.toList().forEach { runCatching { it(error) } }; next.callbacks.clear()
        }
      }
    }

    internal fun stop(context: Context, id: String? = null) {
      main.post {
        val old = requested ?: return@post
        if (id != null && old.id != id) return@post
        requested = null
        old.timeout?.let(main::removeCallbacks)
        old.callbacks.toList().forEach { runCatching { it(IllegalStateException("Call request cancelled.")) } }; old.callbacks.clear()
        context.stopService(Intent(context, CallForegroundService::class.java))
      }
    }
  }
}
