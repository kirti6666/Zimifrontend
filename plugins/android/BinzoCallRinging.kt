package __PACKAGE__

import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.common.LifecycleState
import java.util.concurrent.ConcurrentHashMap

/** Foreground, server-verified call alerts. Background alerts remain owned by
 * Android's existing incoming-call notification channel. No caller data persists. */
internal object BinzoCallRinging : LifecycleEventListener {
  private val handler = Handler(Looper.getMainLooper())
  private var context: ReactApplicationContext? = null
  private var foreground = false
  private var authorizedInForeground = false
  private var callId: String? = null
  private var recipientId: String? = null
  private var expiresAt = 0L
  private var notificationHandoffUntil = 0L
  private var ringtone: Ringtone? = null
  private var vibrating = false
  private var focusHeld = false
  private var focusAttempted = false
  private var focusLost = false
  private var focusRequest: AudioFocusRequest? = null
  private var focusListener: AudioManager.OnAudioFocusChangeListener? = null
  private var focusGeneration = 0
  private val silenced = ConcurrentHashMap<String, Long>()
  private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
  private val check = object : Runnable {
    override fun run() {
      val app = context ?: return
      val id = callId ?: return
      if (System.currentTimeMillis() >= expiresAt || BinzoNotifications.owner(app) != recipientId ||
        BinzoNotifications.callEnded(app, id) || !BinzoNotifications.callAlertsEnabled(app)) { stop(app, id); return }
      val osOwnsRing = (app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).activeNotifications
        .any { it.notification.extras.getString(BinzoNotifications.CALL_ID) == id }
      if (!foreground || !authorizedInForeground || osOwnsRing || System.currentTimeMillis() < notificationHandoffUntil) stopSound(app)
      else playSound(app)
      handler.postDelayed(this, 500)
    }
  }

  fun attach(app: ReactApplicationContext) {
    handler.post {
      context?.removeLifecycleEventListener(this)
      context = app; foreground = app.lifecycleState == LifecycleState.RESUMED
      app.addLifecycleEventListener(this)
    }
  }
  fun detach(app: ReactApplicationContext) {
    handler.post {
      if (context !== app) return@post
      reset(app); app.removeLifecycleEventListener(this); context = null
    }
  }
  fun start(app: Context, id: String, recipient: String, remainingMs: Long) {
    if (!BinzoNotificationPolicy.validId(id) || remainingMs <= 0) return
    handler.post {
      // A queued verification must not cross accounts or revive terminal FCM.
      if (BinzoNotifications.owner(app) != recipient || BinzoNotifications.callEnded(app, id) || !BinzoNotifications.callAlertsEnabled(app)) return@post
      if (callId != id) { stopSound(app); focusAttempted = false; focusLost = false; callId = id; expiresAt = System.currentTimeMillis() + remainingMs.coerceAtMost(180_000) }
      else expiresAt = minOf(expiresAt, System.currentTimeMillis() + remainingMs.coerceAtMost(180_000))
      recipientId = recipient
      authorizedInForeground = foreground
      silenced.remove(id); handler.removeCallbacks(check); check.run()
    }
  }
  fun stop(app: Context, id: String?) {
    if (id != null && !BinzoNotificationPolicy.validId(id)) return
    // Suppress a concurrently building push before the main-thread stop runs.
    if (id != null) silenced[id] = System.currentTimeMillis() + 180_000
    handler.post {
      if (id != null) {
        silenced[id] = if (callId == id) expiresAt else System.currentTimeMillis() + 60_000
        while (silenced.size > 32) silenced.remove(silenced.keys.first())
      }
      if (id == null || callId == id) {
        callId?.let { silenced[it] = expiresAt }
        callId = null; recipientId = null; expiresAt = 0; authorizedInForeground = false; handler.removeCallbacks(check); stopSound(app)
      }
      BinzoNotifications.closeRing(app, id)
    }
  }
  fun reset(app: Context) { stop(app, null); handler.post { silenced.clear() } }
  fun suppressed(id: String): Boolean = (silenced[id] ?: 0) > System.currentTimeMillis()
  fun notificationWillRing(app: Context, id: String) {
    handler.post {
      if (callId == id) { notificationHandoffUntil = System.currentTimeMillis() + 1000; stopSound(app) }
    }
  }
  private fun vibrator(app: Context) = app.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
  private fun silenceSound(app: Context) {
    runCatching { ringtone?.stop() }; ringtone = null
    if (vibrating) runCatching { vibrator(app)?.cancel() }
    vibrating = false
  }
  private fun stopSound(app: Context) { silenceSound(app); abandonFocus(app) }
  @Suppress("DEPRECATION")
  private fun acquireFocus(app: Context): Boolean {
    if (focusLost) return false
    if (focusHeld) return true
    if (focusAttempted) return false
    focusAttempted = true
    val audio = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val generation = ++focusGeneration
    val listener = AudioManager.OnAudioFocusChangeListener { change ->
      handler.post {
        if (generation != focusGeneration) return@post
        if (change == AudioManager.AUDIOFOCUS_GAIN) focusLost = false
        else {
          focusLost = true
          context?.let(::silenceSound)
          if (change == AudioManager.AUDIOFOCUS_LOSS) context?.let(::abandonFocus)
        }
      }
    }
    focusListener = listener
    val result = if (Build.VERSION.SDK_INT >= 26) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        .setAudioAttributes(attributes).setOnAudioFocusChangeListener(listener, handler).build()
      focusRequest = request; audio.requestAudioFocus(request)
    } else audio.requestAudioFocus(listener, AudioManager.STREAM_RING, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
    focusHeld = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    if (!focusHeld) focusLost = true
    return focusHeld
  }
  @Suppress("DEPRECATION")
  private fun abandonFocus(app: Context) {
    if (!focusHeld && focusRequest == null && focusListener == null) return
    focusGeneration++
    val audio = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    runCatching {
      if (Build.VERSION.SDK_INT >= 26) focusRequest?.let { audio.abandonAudioFocusRequest(it) }
      else focusListener?.let { audio.abandonAudioFocus(it) }
    }
    focusHeld = false; focusRequest = null; focusListener = null
    if (!focusLost) focusAttempted = false
  }
  private fun playSound(app: Context) {
    runCatching {
      BinzoNotifications.channel(app)
      val manager = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val channel = if (Build.VERSION.SDK_INT >= 26) manager.getNotificationChannel(BinzoNotifications.CHANNEL) else null
      val audio = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      // Manual foreground audio must not bypass the same account/app/channel
      // choices as a push, or DND. Android owns any permitted DND exceptions.
      if (!BinzoNotifications.callAlertsEnabled(app) || !manager.areNotificationsEnabled() ||
        manager.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL ||
        audio.mode != AudioManager.MODE_NORMAL ||
        audio.ringerMode == AudioManager.RINGER_MODE_SILENT || channel != null && channel.importance < NotificationManager.IMPORTANCE_DEFAULT) {
        stopSound(app); return
      }
      val sound = if (Build.VERSION.SDK_INT >= 26) channel?.sound else RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      if (audio.ringerMode == AudioManager.RINGER_MODE_NORMAL && sound != null && audio.getStreamVolume(AudioManager.STREAM_RING) > 0) {
        if (!acquireFocus(app)) { silenceSound(app); return }
        val tone = ringtone ?: RingtoneManager.getRingtone(app, sound)?.also {
          it.audioAttributes = attributes
          if (Build.VERSION.SDK_INT >= 28) it.isLooping = true
          ringtone = it
        }
        if (tone?.isPlaying == false) tone.play()
      } else { ringtone?.stop(); ringtone = null; abandonFocus(app) }
      val shouldVibrate = channel?.shouldVibrate() ?: true
      if (shouldVibrate && !vibrating) {
        val pattern = longArrayOf(0, 300, 200, 300, 2000)
        if (Build.VERSION.SDK_INT >= 26) vibrator(app)?.vibrate(VibrationEffect.createWaveform(pattern, 0), attributes)
        else vibrator(app)?.vibrate(pattern, 0, attributes)
        vibrating = true
      } else if (!shouldVibrate && vibrating) { vibrator(app)?.cancel(); vibrating = false }
    }
  }
  override fun onHostResume() { foreground = true; focusAttempted = false; focusLost = false }
  override fun onHostPause() { foreground = false; authorizedInForeground = false; handler.removeCallbacks(check); context?.let(::stopSound) }
  override fun onHostDestroy() { context?.let { stop(it, null) } }
}
