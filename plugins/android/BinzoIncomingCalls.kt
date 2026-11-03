package __PACKAGE__

import android.app.Activity
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Person
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.UUID
import expo.modules.notifications.notifications.model.Notification as ExpoNotification

/** A native ringing surface and owner-bound navigation hints, never call authority. */
internal object BinzoIncomingCalls {
  const val EVENT = "BinzoIncomingCallAction"
  const val RECIPIENT = "binzo.recipientId"
  private const val ACTION = "binzo.incomingAction"
  private val main = Handler(Looper.getMainLooper())
  private var screen: WeakReference<BinzoIncomingCallActivity>? = null
  private var react: WeakReference<ReactApplicationContext>? = null
  private fun prefs(context: Context) = context.getSharedPreferences("binzo-incoming-calls-v1", Context.MODE_PRIVATE)

  fun attach(context: ReactApplicationContext) { react = WeakReference(context) }
  fun detach(context: ReactApplicationContext) { if (react?.get() === context) react = null }
  fun attach(activity: BinzoIncomingCallActivity) { screen = WeakReference(activity) }
  fun detach(activity: BinzoIncomingCallActivity) { if (screen?.get() === activity) screen = null }
  private fun json(value: String?): JSONObject? = runCatching { value?.let(::JSONObject) }.getOrNull()
  private fun text(value: String?, fallback: String): String = value?.replace(Regex("[\\p{Cntrl}]"), " ")?.trim()?.take(100)?.takeIf { it.isNotEmpty() } ?: fallback
  private fun valid(context: Context, value: JSONObject, action: String = "open"): Boolean =
    BinzoNotifications.validCallAction(context, value.optString("callId"), value.optString("recipientId"), value.optString("expiresAt"), action)
  private fun map(value: JSONObject): Map<String, Any> = listOf("actionId", "action", "recipientId", "callId", "expiresAt", "callerName", "callKind").associateWith { value.optString(it) }
  private fun emit(event: Map<String, Any>) {
    react?.get()?.takeIf { it.hasActiveReactInstance() }?.let { context ->
      runCatching { context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(EVENT, Arguments.makeNativeMap(event)) }
    }
  }

  fun remember(context: Context, notification: ExpoNotification): JSONObject? = synchronized(BinzoNotifications) {
    val envelope = BinzoNotifications.envelope(context, notification)?.takeIf { it.incoming } ?: return@synchronized null
    val data = BinzoNotifications.data(notification) ?: return@synchronized null
    val selected = json(prefs(context).getString("pending", null))
    if (selected != null && selected.optString("callId") == envelope.targetId && selected.optString("action") in setOf("answer", "decline") && valid(context, selected, selected.optString("action"))) return@synchronized null
    val value = JSONObject().put("recipientId", data["recipientId"]).put("callId", envelope.targetId).put("expiresAt", data["expiresAt"])
      .put("callerName", text(data["callerName"] ?: data["senderName"], "Incoming caller"))
      .put("callKind", if (data["callKind"] == "audio" || data["callKind"] == "voice") "audio" else "video")
    val store = prefs(context)
    val edit = store.edit()
    // Keep only a bounded set of live, validated call hints. No credentials or
    // arbitrary push payload fields are copied to Android preferences.
    val live = store.all.filterKeys { it.startsWith("ring:") }.filter { (_, row) -> json(row as? String)?.let { valid(context, it) } == true }
    store.all.keys.filter { it.startsWith("ring:") && !live.containsKey(it) }.forEach { edit.remove(it) }
    live.entries.sortedBy { json(it.value as? String)?.optString("expiresAt") }.take((live.size - 15).coerceAtLeast(0)).forEach { edit.remove(it.key) }
    edit.putString("ring:${envelope.targetId}", value.toString()).commit()
    value
  }
  fun current(context: Context, id: String, recipient: String?): JSONObject? = synchronized(BinzoNotifications) {
    if (!BinzoNotificationPolicy.validId(id)) return@synchronized null
    val value = json(prefs(context).getString("ring:$id", null)) ?: return@synchronized null
    if (value.optString("recipientId") != recipient || !valid(context, value)) {
      prefs(context).edit().remove("ring:$id").commit(); return@synchronized null
    }
    value
  }
  fun pending(context: Context): Map<String, Any>? = synchronized(BinzoNotifications) {
    val value = json(prefs(context).getString("pending", null)) ?: return@synchronized null
    if (value.optString("actionId").isEmpty() || !valid(context, value, value.optString("action"))) {
      prefs(context).edit().remove("pending").commit(); return@synchronized null
    }
    map(value)
  }
  fun clear(context: Context, actionId: String) = synchronized(BinzoNotifications) {
    val store = prefs(context)
    if (json(store.getString("pending", null))?.optString("actionId") == actionId) store.edit().remove("pending").commit()
  }
  fun queue(context: Context, id: String, recipient: String?, action: String): Boolean = synchronized(BinzoNotifications) {
    if (action !in setOf("open", "answer", "decline")) return@synchronized false
    val value = current(context, id, recipient) ?: return@synchronized false
    // A re-created native activity must not replace an explicit answer/decline
    // with an incidental open. Exact action acknowledgments cannot clear newer actions.
    val previous = json(prefs(context).getString("pending", null))
    if (action == "open" && previous?.optString("callId") == id && valid(context, previous, previous.optString("action"))) return@synchronized true
    value.put("actionId", UUID.randomUUID().toString()).put("action", action)
    if (!prefs(context).edit().putString("pending", value.toString()).commit()) return@synchronized false
    val event = map(value)
    main.post {
      if (pending(context)?.get("actionId") != event["actionId"]) return@post
      emit(event)
    }
    true
  }
  fun dismiss(context: Context, id: String?) = synchronized(BinzoNotifications) {
    val store = prefs(context); val edit = store.edit()
    val pending = json(store.getString("pending", null))
    val terminal = BinzoNotificationPolicy.terminalCallAction(pending?.optString("callId"), pending?.optString("recipientId"), id)
    if (id == null) edit.clear() else {
      edit.remove("ring:$id")
      if (pending?.optString("callId") == id) edit.remove("pending")
    }
    edit.commit()
    main.post {
      screen?.get()?.closeIfMatches(id)
      // This also closes a warm RN ringing overlay while offline. Identity is
      // captured before logout/terminal cleanup removes its native pending row.
      if (terminal != null) emit(terminal)
    }
  }
  private fun intent(context: Context, id: String, recipient: String, action: String): Intent =
    Intent(context, BinzoIncomingCallActivity::class.java).setData(Uri.parse("binzolive-incoming://call/$id/$action"))
      .putExtra(BinzoNotifications.CALL_ID, id).putExtra(RECIPIENT, recipient).putExtra(ACTION, action)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
  private fun pendingIntent(context: Context, value: JSONObject, action: String): PendingIntent = PendingIntent.getActivity(context,
    (value.optString("callId") + ":" + action).hashCode(), intent(context, value.optString("callId"), value.optString("recipientId"), action),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  fun notification(context: Context, notification: ExpoNotification): Notification? {
    val value = remember(context, notification) ?: return null
    if (BinzoCallRinging.suppressed(value.optString("callId"))) return null
    BinzoNotifications.channel(context)
    val remaining = (BinzoNotificationPolicy.expiry(value.optString("expiresAt"))!! - System.currentTimeMillis()).coerceIn(1, 180_000)
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, BinzoNotifications.CHANNEL) else Notification.Builder(context)
    val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName).takeIf { it != 0 } ?: context.applicationInfo.icon
    val open = pendingIntent(context, value, "open")
    val answer = pendingIntent(context, value, "answer")
    val decline = pendingIntent(context, value, "decline")
    builder.setSmallIcon(icon).setContentTitle(value.optString("callerName"))
      .setContentText(if (value.optString("callKind") == "audio") "Incoming voice call" else "Incoming video call")
      .setContentIntent(open).setCategory(Notification.CATEGORY_CALL).setOngoing(true).setAutoCancel(false)
      .setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE).setPriority(Notification.PRIORITY_MAX)
      .setColor(Color.rgb(236, 7, 133))
    if (Build.VERSION.SDK_INT >= 31) builder.setStyle(Notification.CallStyle.forIncomingCall(
      Person.Builder().setName(value.optString("callerName")).setImportant(true).build(), decline, answer).setIsVideo(value.optString("callKind") == "video"))
    else {
      builder.addAction(Notification.Action.Builder(null, "Decline", decline).build())
      builder.addAction(Notification.Action.Builder(null, "Answer", answer).build())
    }
    // Android 14 can withhold this special access. The same CallStyle heads-up
    // notification and explicit actions remain usable without it.
    if (Build.VERSION.SDK_INT < 34 || manager.canUseFullScreenIntent()) builder.setFullScreenIntent(open, true)
    if (Build.VERSION.SDK_INT >= 26) builder.setTimeoutAfter(remaining)
    else builder.setSound(android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE))
    return builder.build().apply { flags = flags or Notification.FLAG_INSISTENT; extras.putString(BinzoNotifications.CALL_ID, value.optString("callId"))
      BinzoNotifications.timeout(context, value.optString("callId"), remaining) }
  }
  fun action(intent: Intent): String = intent.getStringExtra(ACTION)?.takeIf { it in setOf("answer", "decline") } ?: "open"
}

/** Draws before React/Expo/the WebView or update-network checks are started. */
class BinzoIncomingCallActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private var callId = ""
  private var recipient: String? = null
  private var decided = false
  private val check = object : Runnable {
    override fun run() { if (BinzoIncomingCalls.current(this@BinzoIncomingCallActivity, callId, recipient) == null) finish() else handler.postDelayed(this, 500) }
  }
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
    else window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    BinzoIncomingCalls.attach(this); showCall(intent)
  }
  override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); showCall(intent) }
  override fun onResume() { super.onResume(); handler.removeCallbacks(check); check.run() }
  override fun onPause() { handler.removeCallbacks(check); super.onPause() }
  override fun onDestroy() { handler.removeCallbacks(check); BinzoIncomingCalls.detach(this); super.onDestroy() }
  fun closeIfMatches(id: String?) { if (id == null || callId == id) finish() }
  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
  private fun text(value: String, size: Float, color: Int = Color.WHITE) = TextView(this).apply {
    text = value; textSize = size; setTextColor(color); gravity = Gravity.CENTER; fontFeatureSettings = "kern"; setPadding(dp(12), dp(6), dp(12), dp(6))
  }
  private fun showCall(intent: Intent) {
    callId = intent.getStringExtra(BinzoNotifications.CALL_ID) ?: ""; recipient = intent.getStringExtra(BinzoIncomingCalls.RECIPIENT); decided = false
    val value = BinzoIncomingCalls.current(this, callId, recipient) ?: run { finish(); return }
    val action = BinzoIncomingCalls.action(intent)
    if (action != "open") { select(action); return }
    BinzoIncomingCalls.queue(this, callId, recipient, "open")
    val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setPadding(dp(24), dp(40), dp(24), dp(36)); setBackgroundColor(Color.rgb(11, 20, 26)) }
    root.addView(text("BinzoLive", 16f, Color.rgb(166, 184, 194)))
    root.addView(text(if (value.optString("callKind") == "audio") "Incoming voice call" else "Incoming video call", 14f, Color.rgb(166, 184, 194)))
    root.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))
    val name = value.optString("callerName")
    val initials = name.split(Regex("\\s+")).filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1) }.uppercase()
    root.addView(text(initials, 38f).apply { background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.rgb(41, 57, 65)) }; gravity = Gravity.CENTER }, LinearLayout.LayoutParams(dp(112), dp(112)))
    root.addView(text(name, 29f).apply { setTypeface(typeface, Typeface.BOLD) }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(20) })
    root.addView(text("Voice and video calls", 13f, Color.rgb(166, 184, 194)))
    root.addView(View(this), LinearLayout.LayoutParams(1, 0, 1.4f))
    val actions = LinearLayout(this).apply { gravity = Gravity.CENTER; orientation = LinearLayout.HORIZONTAL }
    for ((actionName, title, color) in listOf(Triple("decline", "Decline", Color.rgb(220, 56, 72)), Triple("answer", "Answer", Color.rgb(30, 161, 108)))) {
      val column = LinearLayout(this).apply { gravity = Gravity.CENTER; orientation = LinearLayout.VERTICAL }
      column.addView(ImageButton(this).apply {
        contentDescription = if (actionName == "answer") "Answer call" else "Decline call"; setImageResource(android.R.drawable.sym_action_call); setColorFilter(Color.WHITE)
        if (actionName == "decline") rotation = 45f
        background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(color) }; setPadding(dp(19), dp(19), dp(19), dp(19))
        setOnClickListener { select(actionName) }
      }, LinearLayout.LayoutParams(dp(72), dp(72)))
      column.addView(text(title, 14f)); actions.addView(column, LinearLayout.LayoutParams(0, -2, 1f))
    }
    root.addView(actions, LinearLayout.LayoutParams(-1, -2))
    root.addView(text("Open in app", 14f, Color.rgb(166, 184, 194)).apply { contentDescription = "Open incoming call in app"; isClickable = true; setOnClickListener { select("open") } }, LinearLayout.LayoutParams(-1, dp(48)).apply { topMargin = dp(22) })
    setContentView(root)
  }
  private fun select(action: String) {
    if (decided || !BinzoIncomingCalls.queue(this, callId, recipient, action)) { if (!decided) finish(); return }
    decided = true
    // Launch from this visible user-selected activity; tokens remain in the RN
    // session and accept/decline still require the authenticated server check.
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: run { finish(); return }
    BinzoNotifications.closeRing(this, callId)
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    startActivity(launch); finish()
  }
}
