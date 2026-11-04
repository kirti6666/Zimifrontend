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
  private var createdFor: Request? = null
  @Volatile private var owned: Request? = null

  override fun onCreate() {
    super.onCreate()
    createdFor = requested
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val id = intent?.getStringExtra(CALL_ID)
    val lease = intent?.getStringExtra(LEASE)
    if (id == null || lease == null || requested?.lease != lease || requested?.id != id) {
      if (requested == null) stopSelf()
      return START_NOT_STICKY
    }
    if (intent.action == END) {
      endFromSystem(id, lease)
      return START_NOT_STICKY
    }
    val wanted = requested ?: return START_NOT_STICKY
    owned = wanted
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
      val end = Intent(this, CallForegroundService::class.java).setAction(END).setData(Uri.fromParts("binzo-call", lease, null)).putExtra(CALL_ID, id).putExtra(LEASE, lease)
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
      wanted.promoted = true
      wanted.timeout?.let(main::removeCallbacks)
      val callbacks = wanted.callbacks.toList(); wanted.callbacks.clear()
      callbacks.forEach { runCatching { it(null) } }
    } catch (error: Exception) {
      if (requested === wanted) requested = null
      rememberCancelled(wanted.lease)
      wanted.timeout?.let(main::removeCallbacks)
      wanted.callbacks.toList().forEach { runCatching { it(error) } }; wanted.callbacks.clear()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
    return START_NOT_STICKY
  }

  private fun endFromSystem(id: String, lease: String) {
    if (requested?.lease != lease) return
    rememberCancelled(lease)
    requested?.timeout?.let(main::removeCallbacks)
    requested = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
    runCatching { onStopped?.invoke(id, lease) }
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    val request = owned ?: createdFor
    if (request != null && requested === request) endFromSystem(request.id, request.lease)
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    if (running === this) running = null
    val request = owned ?: createdFor
    val id = request?.id
    if (id != null && requested === request) {
      rememberCancelled(request.lease)
      val pending = requested; requested = null
      pending?.timeout?.let(main::removeCallbacks)
      pending?.callbacks?.toList()?.forEach { runCatching { it(IllegalStateException("Call service stopped.")) } }
      runCatching { onStopped?.invoke(id, request.lease) }
    }
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  companion object {
    private const val CHANNEL = "binzo_ongoing_calls"
    private const val NOTIFICATION_ID = 17242
    private const val CALL_ID = "binzo.callId"
    private const val LEASE = "binzo.callLease"
    private const val END = "expo.modules.binzomedia.END_CALL"
    private val main = Handler(Looper.getMainLooper())
    private data class Request(val id: String, val video: Boolean, val lease: String, val callbacks: MutableList<(Exception?) -> Unit>, var timeout: Runnable? = null, @Volatile var promoted: Boolean = false)
    @Volatile private var requested: Request? = null
    @Volatile private var running: CallForegroundService? = null
    // A synchronous end can reach main before an async begin is dispatched.
    // Remember retired leases so that late begin cannot revive capture.
    private val cancelled = LinkedHashMap<String, Long>()
    internal var onStopped: ((String, String) -> Unit)? = null

    internal fun isRunning(lease: String): Boolean = requested?.let { it.lease == lease && it.promoted && running?.owned === it } == true

    internal fun start(context: Context, id: String, video: Boolean, lease: String, callback: (Exception?) -> Unit) {
      main.post {
        pruneCancelled()
        if (cancelled.containsKey(lease)) {
          runCatching { callback(IllegalStateException("Call request cancelled.")) }
          return@post
        }
        val old = requested
        if (old?.lease == lease && old.id == id && old.video == video) {
          if (isRunning(lease)) runCatching { callback(null) }
          else old.callbacks.add(callback)
          return@post
        }
        if (old != null) rememberCancelled(old.lease)
        old?.timeout?.let(main::removeCallbacks)
        old?.callbacks?.toList()?.forEach { runCatching { it(IllegalStateException("Call request replaced.")) } }
        val next = Request(id, video, lease, mutableListOf(callback)); requested = next
        // Keep a failed/dropped startup from holding a server call indefinitely.
        // Cancel before Android's foreground-promotion deadline as well.
        next.timeout = Runnable {
          if (requested !== next || next.callbacks.isEmpty()) return@Runnable
          rememberCancelled(next.lease)
          requested = null
          next.callbacks.toList().forEach { runCatching { it(IllegalStateException("Call service start timed out.")) } }; next.callbacks.clear()
          context.stopService(Intent(context, CallForegroundService::class.java))
        }
        main.postDelayed(next.timeout!!, 4000)
        try {
          val intent = Intent(context, CallForegroundService::class.java).putExtra(CALL_ID, id).putExtra(LEASE, lease)
          if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
        } catch (error: Exception) {
          if (requested === next) requested = null
          rememberCancelled(next.lease)
          next.timeout?.let(main::removeCallbacks)
          next.callbacks.toList().forEach { runCatching { it(error) } }; next.callbacks.clear()
        }
      }
    }

    internal fun stop(context: Context, lease: String? = null) {
      main.post {
        if (lease != null) rememberCancelled(lease)
        val old = requested ?: return@post
        if (lease != null && old.lease != lease) return@post
        rememberCancelled(old.lease)
        requested = null
        old.timeout?.let(main::removeCallbacks)
        old.callbacks.toList().forEach { runCatching { it(IllegalStateException("Call request cancelled.")) } }; old.callbacks.clear()
        context.stopService(Intent(context, CallForegroundService::class.java))
      }
    }

    private fun rememberCancelled(lease: String) {
      pruneCancelled()
      cancelled[lease] = android.os.SystemClock.elapsedRealtime()
      while (cancelled.size > 256) cancelled.remove(cancelled.keys.first())
    }

    private fun pruneCancelled() {
      val oldest = android.os.SystemClock.elapsedRealtime() - 600000
      val expired = cancelled.entries.iterator()
      while (expired.hasNext()) if (expired.next().value < oldest) expired.remove()
    }
  }
}
