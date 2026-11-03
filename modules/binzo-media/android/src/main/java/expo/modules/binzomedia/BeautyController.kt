package expo.modules.binzomedia

import android.content.Context
import android.os.Build
import android.util.Log
import org.json.JSONArray

/**
 * State shared by the JS module and the camera-thread processor. JS writes the
 * license and effect settings; camera capture hands frames to the session's
 * owned GLES3 thread, where the Facebetter engine and its GL resources live.
 */
internal object BeautyController {
  const val PROCESSOR = "facebetter"
  private const val TAG = "BinzoBeauty"

  // Basic plan: Skin + Color. Unknown or unlicensed operations are ignored.
  private val FLOAT_SETTERS = setOf(
    "setSmoothing", "setWhitening", "setRosiness", "setBlemish", "setClarity",
    "setBrightness", "setContrast", "setSaturation", "setColorTemperature", "setColorTint",
  )
  private val STYLE_SETTERS = setOf("setSmoothingStyle", "setWhiteningStyle")
  private val BOOLEAN_SETTERS = setOf("setBeautySkinOnly")

  @Volatile var appContext: Context? = null
  @Volatile var onStatus: ((String) -> Unit)? = null
  @Volatile var licenseToken: String? = null
    private set
  @Volatile var enabled: Boolean = true
  @Volatile var revision: Int = 0
    private set

  private val lock = Any()
  private val settings = LinkedHashMap<String, Any>()
  private var session: BeautySession? = null
  @Volatile private var lastStatus: String = "idle"
  @Volatile private var stats: Map<String, Any?> = emptyMap()

  /** The SDK ships ARM libraries only; x86 emulators process nothing. */
  val supported: Boolean by lazy {
    val abi = Build.SUPPORTED_ABIS.firstOrNull()
    if (abi != "arm64-v8a" && abi != "armeabi-v7a") return@lazy false
    try {
      Class.forName("net.pixpark.facebetter.BeautyEffectEngine")
      true
    } catch (error: Throwable) {
      Log.w(TAG, "Facebetter library unavailable: ${error.javaClass.simpleName}")
      false
    }
  }

  fun configure(token: String) {
    val trimmed = token.trim()
    if (trimmed.isEmpty() || trimmed.length > 128 * 1024) throw IllegalArgumentException("Invalid license token.")
    synchronized(lock) {
      // A new token recreates the engine on the next frame.
      if (licenseToken != trimmed) {
        licenseToken = trimmed
        revision++
      }
    }
  }

  /** Commands use the WebView worker's shape: [["setSmoothing", [0.6]], ...]. */
  fun apply(commandsJson: String) {
    val commands = JSONArray(commandsJson)
    synchronized(lock) {
      for (index in 0 until commands.length()) {
        val command = commands.optJSONArray(index) ?: continue
        val name = command.optString(0)
        val args = command.optJSONArray(1) ?: JSONArray()
        val value: Any = when (name) {
          in FLOAT_SETTERS -> args.optDouble(0, Double.NaN).takeIf { it.isFinite() }?.coerceIn(-1.0, 1.0) ?: continue
          in STYLE_SETTERS -> args.optInt(0, -1).takeIf { it >= 0 } ?: continue
          in BOOLEAN_SETTERS -> args.optBoolean(0, false)
          else -> { Log.w(TAG, "Ignored beauty command $name"); continue }
        }
        settings[name] = value
      }
      revision++
    }
  }

  fun snapshot(): Pair<Int, Map<String, Any>> = synchronized(lock) { revision to LinkedHashMap(settings) }

  fun publish(status: String, source: BeautySession? = null) {
    synchronized(lock) {
      if (source != null && session !== source) return
      if (lastStatus == status) return
      lastStatus = status
      Log.i(TAG, "status $status")
      onStatus?.invoke(status)
    }
  }

  fun status(): String = lastStatus

  fun updateStats(next: Map<String, Any?>, source: BeautySession) {
    synchronized(lock) { if (session === source) stats = next }
  }

  fun stats(): Map<String, Any?> = stats + mapOf("status" to lastStatus, "supported" to supported, "enabled" to enabled)

  /** Returns the session for the calling GL thread, replacing one bound to another context. */
  fun sessionFor(context: android.opengl.EGLContext, token: String): BeautySession? {
    synchronized(lock) {
      // A frame may have read its token just before JS ended the call.
      if (licenseToken != token || !enabled) return null
      val current = session
      if (current != null && current.context == context) return current
      // Each session owns its GLES3 handler and keeps it alive for retained output frames.
      current?.let { old -> old.handler.post { old.release() } }
      return BeautySession(context).also { session = it }
    }
  }

  /** Releases GL resources on their own thread before JS stops the camera track.
      Frames that still arrive pass through unprocessed until configure() runs again. */
  fun release(done: () -> Unit) {
    val current = synchronized(lock) {
      licenseToken = null
      revision++
      stats = emptyMap()
      publish("idle")
      session.also { session = null }
    }
    if (current == null || !current.handler.post { try { current.release() } finally { done() } }) {
      done()
    }
  }
}
