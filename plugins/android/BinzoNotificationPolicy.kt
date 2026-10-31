package __PACKAGE__

import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/** Pure envelope validation, shared by receiving and final presentation. */
internal object BinzoNotificationPolicy {
  const val PROTOCOL = "binzo.push.v1"
  val categories = setOf("calls", "messages", "likes", "comments", "gifts", "appUpdates", "liveAlerts", "earningsAlerts", "announcements")
  private val id = Regex("^[a-fA-F0-9]{24}$")
  fun validId(value: String?) = value != null && id.matches(value)
  data class Envelope(val category: String, val targetId: String?, val incoming: Boolean, val ended: Boolean, val expiresAt: Long?)

  fun expiry(value: String?): Long? {
    if (value == null) return null
    val pattern = when {
      Regex("^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z$").matches(value) -> "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
      Regex("^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ$").matches(value) -> "yyyy-MM-dd'T'HH:mm:ss'Z'"
      else -> return null
    }
    return runCatching { SimpleDateFormat(pattern, Locale.US).apply { isLenient = false;timeZone = TimeZone.getTimeZone("UTC") }.parse(value)?.time }.getOrNull()
  }
  fun validate(data: Map<String, String>, owner: String?, enabled: Boolean, allowed: Set<String>, now: Long): Envelope? {
    if (data["protocol"] != PROTOCOL || !validId(owner) || data["recipientId"] != owner) return null
    val category = data["category"] ?: return null
    if (!categories.contains(category)) return null
    val target = data["targetId"]
    val type = data["targetType"]
    if (data["action"] == "call-ended") {
      return if (category == "calls" && type == "call" && validId(target)) Envelope(category, target, false, true, null) else null
    }
    if (data["action"] != "notify" || !enabled || category != "announcements" && !allowed.contains(category)) return null
    if (type !in setOf("inbox", "thread", "call", "post", "creator", "host", "appUpdate")) return null
    if (type in setOf("thread", "call", "post", "creator") && !validId(target)) return null
    val expires = expiry(data["expiresAt"])
    if (data.containsKey("expiresAt") && (expires == null || expires <= now)) return null
    val incoming = category == "calls" && type == "call"
    if (incoming && (expires == null || expires - now > 180_000)) return null
    return Envelope(category, target, incoming, false, expires)
  }
}
