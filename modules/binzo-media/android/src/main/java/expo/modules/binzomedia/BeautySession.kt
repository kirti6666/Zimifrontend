package expo.modules.binzomedia

import android.graphics.Matrix
import android.opengl.EGL14
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLExt
import android.opengl.EGLSurface
import android.opengl.GLES20
import android.opengl.GLES30
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.Message
import android.os.SystemClock
import android.util.Log
import net.pixpark.facebetter.BeautyEffectEngine
import net.pixpark.facebetter.BeautyParams
import net.pixpark.facebetter.EngineCallbacks
import net.pixpark.facebetter.EngineEventCode
import net.pixpark.facebetter.ImageFrame
import org.webrtc.GlRectDrawer
import org.webrtc.GlTextureFrameBuffer
import org.webrtc.TextureBufferImpl
import org.webrtc.VideoFrame
import org.webrtc.VideoFrameDrawer
import org.webrtc.YuvConverter
import java.util.concurrent.ExecutionException
import java.util.concurrent.FutureTask

/**
 * Facebetter on an owned GLES3 thread sharing the WebRTC camera's textures.
 * WebRTC requests GLES2, which must not rely on a driver upgrading it to GLES3.
 * Same path as facebetter-expo's CameraGlView: the
 * camera OES texture is drawn upright into a GL_TEXTURE_2D, processed by the
 * SDK with full framing (long side <= 1920), then copied into a texture we
 * own so the encoder and preview can hold it while the SDK reuses its output.
 */
internal class BeautySession(val context: EGLContext) {
  private class Output(val buffer: GlTextureFrameBuffer) {
    var inUse = false
    var retired = false
  }

  private var engine: BeautyEffectEngine? = null
  private var display: EGLDisplay = EGL14.EGL_NO_DISPLAY
  private var glContext: EGLContext = EGL14.EGL_NO_CONTEXT
  private var surface: EGLSurface = EGL14.EGL_NO_SURFACE
  private val glThread = HandlerThread("BinzoBeautyGL").apply { start() }
  val handler = object : Handler(glThread.looper) {
    override fun dispatchMessage(message: Message) {
      // SDK setup/callbacks can unbind EGL. This also covers TextureBufferImpl's
      // conversion tasks, whose FBOs belong to this context.
      if (glContext != EGL14.EGL_NO_CONTEXT) EGL14.eglMakeCurrent(display, surface, surface, glContext)
      super.dispatchMessage(message)
    }
  }
  private var engineToken: String? = null
  private var refusedToken: String? = null
  private var appliedRevision = -1
  private var glReady: Boolean? = null
  private var glVersion = ""
  private var maxAttribs = 16
  private var drawer: GlRectDrawer? = null
  private var frameDrawer: VideoFrameDrawer? = null
  private var input: GlTextureFrameBuffer? = null
  private var yuvConverter: YuvConverter? = null
  private val outputs = ArrayList<Output>()
  @Volatile private var released = false
  private var errors = 0

  private var windowStart = 0L
  private var windowFrames = 0
  private var windowCostMs = 0.0
  private var windowMaxCostMs = 0.0
  private var windowFirstInputNs = 0L
  private var windowLastInputNs = 0L
  private var lastRecordedAt = 0L
  private var dropped = 0

  fun process(frame: VideoFrame, token: String): VideoFrame? {
    if (released) return null
    if (frame.buffer !is VideoFrame.TextureBuffer) return null
    val started = SystemClock.elapsedRealtimeNanos()
    // Complete updateTexImage on the producer before sampling its shared OES
    // texture from the GLES3 context. No camera pixels cross the JS bridge.
    GLES20.glFinish()
    // release() can close the GL looper between the initial check and this
    // enqueue. A rejected post must pass through, never leave capture waiting.
    val work = FutureTask<VideoFrame?> { processOnGl(frame, token, started) }
    if (!handler.post(work)) return null
    var interrupted = false
    try {
      while (true) {
        try { return work.get() }
        catch (_: InterruptedException) { interrupted = true }
        catch (error: ExecutionException) {
          Log.w(TAG, "frame failed (${error.cause?.javaClass?.simpleName})")
          return null
        }
      }
    } finally {
      if (interrupted) Thread.currentThread().interrupt()
    }
  }

  private fun processOnGl(frame: VideoFrame, token: String, started: Long): VideoFrame? {
    if (released) return null
    var stage = "context"
    var output: Output? = null
    var processed: ImageFrame? = null
    try {
      if (!checkGl()) return null
      makeCurrent()
      stage = "engine"
      val current = ensureEngine(token) ?: return null
      // The SDK constructor may return with EGL_NO_CONTEXT. Rebind before
      // allocating FBOs, exactly as the reference rebinds before every render.
      makeCurrent()
      resetGlState()
      clearGlErrors()
      val (width, height) = targetSize(frame.rotatedWidth, frame.rotatedHeight)
      stage = "input-allocation"
      val source = ensureInput(width, height)
      stage = "output-allocation"
      val target = acquireOutput(width, height) ?: run { dropped++; return null }
      output = target
      // 1. Camera OES -> upright RGBA. Rotation is baked in, so faces are upright for the SDK.
      stage = "camera-draw"
      GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, source.frameBufferId)
      frameDrawer!!.drawFrame(frame, drawer!!, null, 0, 0, width, height)
      resetGlState()
      stage = "settings"
      applySettings(current)
      makeCurrent()
      resetGlState()
      clearGlErrors()

      // 2. Facebetter. Its face model uses GLES2 client arrays, so nothing may stay bound.
      stage = "sdk-process"
      val inputFrame = ImageFrame.createWithTexture(source.textureId, width, height, width * 4)
        ?: throw IllegalStateException("Input frame unavailable")
      inputFrame.type = ImageFrame.FrameType.VIDEO
      processed = try { current.processImage(inputFrame) } finally { inputFrame.release() }
      makeCurrent()
      resetGlState()
      clearGlErrors()
      val processedTexture = processed?.texture ?: 0
      if (processedTexture == 0) throw IllegalStateException("No processed texture")

      // 3. Preserve the upright input orientation in WebRTC's RGB texture convention.
      // VideoFrameDrawer already baked camera rotation into the input FBO. The
      // standalone demo's TextureView V flip does not belong on this copy path;
      // applying it here turns filtered video upside down relative to raw video.
      stage = "output-copy"
      GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, target.buffer.frameBufferId)
      drawer!!.drawRgb(processedTexture, IDENTITY, width, height, 0, 0, width, height)
      GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
      // The encoder and preview read this texture from other, shared contexts.
      GLES20.glFinish()
      errors = 0
      record(frame, width, height, (SystemClock.elapsedRealtimeNanos() - started) / 1_000_000.0, current)
      val buffer = TextureBufferImpl(
        width, height, VideoFrame.TextureBuffer.Type.RGB, target.buffer.textureId, Matrix(),
        handler, yuvConverter!!,
      ) { handler.post { recycle(target) } }
      return VideoFrame(buffer, 0, frame.timestampNs)
    } catch (error: Throwable) {
      output?.inUse = false
      runCatching { makeCurrent(); resetGlState(); clearGlErrors() }
      if (++errors == 1 || errors % 30 == 0) {
        // Never print SDK messages or Throwable.toString(): they can contain a
        // license response. Our stage and source location are sufficient.
        val location = error.stackTrace.firstOrNull { it.className.startsWith("expo.modules.binzomedia") }
        Log.w(TAG, "frame failed at $stage (${error.javaClass.simpleName}) ${location?.methodName}:${location?.lineNumber}")
      }
      if (errors >= 30) publish("error")
      return null
    } finally {
      runCatching { processed?.release() }
    }
  }

  private fun makeCurrent() {
    check(glContext != EGL14.EGL_NO_CONTEXT && EGL14.eglMakeCurrent(display, surface, surface, glContext))
  }

  private fun clearGlErrors() {
    // Isolate SDK state/errors from WebRTC's strict allocation checks.
    for (ignored in 0 until 16) if (GLES20.glGetError() == GLES20.GL_NO_ERROR) return
  }

  private fun checkGl(): Boolean {
    glReady?.let { return it }
    val ready = createGl()
    if (!ready) {
      publish("glUnsupported")
      glReady = false
      return false
    }
    glVersion = GLES20.glGetString(GLES20.GL_VERSION) ?: ""
    val attribs = IntArray(1)
    GLES20.glGetIntegerv(GLES20.GL_MAX_VERTEX_ATTRIBS, attribs, 0)
    maxAttribs = attribs[0].coerceIn(1, 32)
    Log.i(TAG, "capture GL: $glVersion")
    glReady = true
    return true
  }

  /** Match the reference's explicit GLES3 setup, with a tiny offscreen surface. */
  private fun createGl(): Boolean {
    display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
    if (display == EGL14.EGL_NO_DISPLAY) return false
    val configs = arrayOfNulls<android.opengl.EGLConfig>(1)
    val count = IntArray(1)
    val attributes = intArrayOf(
      EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8,
      EGL14.EGL_SURFACE_TYPE, EGL14.EGL_PBUFFER_BIT,
      EGL14.EGL_RENDERABLE_TYPE, EGLExt.EGL_OPENGL_ES3_BIT_KHR, EGL14.EGL_NONE,
    )
    if (!EGL14.eglChooseConfig(display, attributes, 0, configs, 0, 1, count, 0) || count[0] == 0) return false
    glContext = EGL14.eglCreateContext(display, configs[0], context,
      intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 3, EGL14.EGL_NONE), 0)
    if (glContext == EGL14.EGL_NO_CONTEXT) return false
    surface = EGL14.eglCreatePbufferSurface(display, configs[0],
      intArrayOf(EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE), 0)
    if (surface == EGL14.EGL_NO_SURFACE || !EGL14.eglMakeCurrent(display, surface, surface, glContext)) {
      destroyGl()
      return false
    }
    return true
  }

  private fun ensureEngine(token: String): BeautyEffectEngine? {
    if (engine != null && engineToken == token) return engine
    engine?.release()
    makeCurrent()
    engine = null
    engineToken = null
    if (refusedToken == token) return null
    val app = BeautyController.appContext ?: return null
    return try {
      val log = BeautyEffectEngine.LogConfig()
      // Provider diagnostics may contain license data.
      log.consoleEnabled = false
      log.fileEnabled = false
      log.level = BeautyEffectEngine.LogLevel.ERROR
      BeautyEffectEngine.setLogConfig(log)
      val config = BeautyEffectEngine.EngineConfig()
      config.licenseToken = token
      val created = BeautyEffectEngine(app.applicationContext, config)
      val callbacks = EngineCallbacks()
      callbacks.onEngineEvent = EngineCallbacks.OnEngineEventCallback { code, _ ->
        handler.post { onEngineEvent(code, token) }
      }
      created.setCallbacks(callbacks)
      engine = created
      engineToken = token
      appliedRevision = -1
      publish("loading")
      created
    } catch (error: Throwable) {
      Log.w(TAG, "engine failed (${error.javaClass.simpleName})")
      refusedToken = token
      publish("initFailed")
      null
    }
  }

  private fun onEngineEvent(code: Int, token: String) {
    if (released || engineToken != token) return
    when (code) {
      EngineEventCode.LICENSE_VALIDATION_SUCCESS, EngineEventCode.INITIALIZATION_COMPLETE -> publish("ready")
      EngineEventCode.LICENSE_VALIDATION_FAILED, EngineEventCode.INITIALIZATION_FAILED -> {
        // Keep sending the plain camera; a new token retries.
        refusedToken = token
        engine?.release()
        engine = null
        engineToken = null
        publish(if (code == EngineEventCode.LICENSE_VALIDATION_FAILED) "authFailed" else "initFailed")
      }
    }
  }

  private fun applySettings(target: BeautyEffectEngine) {
    val (revision, settings) = BeautyController.snapshot()
    if (revision == appliedRevision) return
    for ((name, value) in settings) {
      val amount = (value as? Double)?.toFloat() ?: 0f
      when (name) {
        "setSmoothing" -> target.setSmoothing(amount)
        "setWhitening" -> target.setWhitening(amount)
        "setRosiness" -> target.setRosiness(amount)
        "setBlemish" -> target.setBlemish(amount)
        "setClarity" -> target.setClarity(amount)
        "setBrightness" -> target.setBrightness(amount)
        "setContrast" -> target.setContrast(amount)
        "setSaturation" -> target.setSaturation(amount)
        "setColorTemperature" -> target.setColorTemperature(amount)
        "setColorTint" -> target.setColorTint(amount)
        "setBeautySkinOnly" -> target.setBeautySkinOnly(value == true)
        "setSmoothingStyle" -> BeautyParams.SmoothingStyle.values().firstOrNull { it.value == value }?.let(target::setSmoothingStyle)
        "setWhiteningStyle" -> BeautyParams.WhiteningStyle.values().firstOrNull { it.value == value }?.let(target::setWhiteningStyle)
      }
    }
    // A throwing setter must be retried rather than acknowledging partial state.
    appliedRevision = revision
  }

  private fun ensureInput(width: Int, height: Int): GlTextureFrameBuffer {
    if (drawer == null) {
      drawer = GlRectDrawer()
      frameDrawer = VideoFrameDrawer()
      yuvConverter = YuvConverter()
    }
    val source = input ?: GlTextureFrameBuffer(GLES20.GL_RGBA).also { input = it }
    source.setSize(width, height)
    return source
  }

  private fun acquireOutput(width: Int, height: Int): Output? {
    val iterator = outputs.iterator()
    while (iterator.hasNext()) {
      val output = iterator.next()
      if (output.buffer.width == width && output.buffer.height == height) continue
      if (output.inUse) output.retired = true else { output.buffer.release(); iterator.remove() }
    }
    val free = outputs.firstOrNull { !it.inUse && !it.retired }
      ?: if (outputs.count { !it.retired } < MAX_OUTPUTS) {
        Output(GlTextureFrameBuffer(GLES20.GL_RGBA).apply { setSize(width, height) }).also { outputs.add(it) }
      } else null
    free?.inUse = true
    return free
  }

  private fun recycle(output: Output) {
    if (released || output.retired) {
      output.buffer.release()
      outputs.remove(output)
      if (released && outputs.isEmpty()) finishRelease()
    } else {
      output.inUse = false
    }
  }

  /** The SDK may leave its own GL state bound; WebRTC's drawers expect defaults. */
  private fun resetGlState() {
    GLES30.glBindVertexArray(0)
    GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0)
    GLES20.glBindBuffer(GLES20.GL_ELEMENT_ARRAY_BUFFER, 0)
    GLES20.glBindBuffer(GLES30.GL_PIXEL_PACK_BUFFER, 0)
    GLES20.glBindBuffer(GLES30.GL_PIXEL_UNPACK_BUFFER, 0)
    for (index in 0 until maxAttribs) GLES20.glDisableVertexAttribArray(index)
    GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
    GLES20.glUseProgram(0)
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
    GLES20.glDisable(GLES20.GL_BLEND)
    GLES20.glDisable(GLES20.GL_DEPTH_TEST)
    GLES20.glDisable(GLES20.GL_CULL_FACE)
    GLES20.glDisable(GLES20.GL_SCISSOR_TEST)
    GLES20.glDisable(GLES20.GL_STENCIL_TEST)
    GLES20.glColorMask(true, true, true, true)
    GLES20.glPixelStorei(GLES20.GL_PACK_ALIGNMENT, 4)
    GLES20.glPixelStorei(GLES20.GL_UNPACK_ALIGNMENT, 4)
  }

  private fun record(frame: VideoFrame, width: Int, height: Int, costMs: Double, current: BeautyEffectEngine) {
    val now = SystemClock.elapsedRealtime()
    // A paused/disabled camera is not a window of slow processing.
    val gap = now - lastRecordedAt
    if (windowStart == 0L || gap > 1000L && gap > costMs + 250.0) {
      windowStart = now
      windowFrames = 0
      windowCostMs = 0.0
      windowMaxCostMs = 0.0
      windowFirstInputNs = 0L
    }
    lastRecordedAt = now
    if (windowFirstInputNs == 0L) windowFirstInputNs = frame.timestampNs
    windowLastInputNs = frame.timestampNs
    windowFrames++
    windowCostMs += costMs
    windowMaxCostMs = maxOf(windowMaxCostMs, costMs)
    val elapsed = now - windowStart
    if (elapsed < STATS_WINDOW_MS) return
    val fps = windowFrames * 1000.0 / elapsed
    val avgMs = windowCostMs / windowFrames
    val inputFps = if (windowLastInputNs > windowFirstInputNs && windowFrames > 1)
      (windowFrames - 1) * 1_000_000_000.0 / (windowLastInputNs - windowFirstInputNs) else 0.0
    val sdkMs = runCatching { current.stats?.avgProcessTimeMs }.getOrNull() ?: 0.0
    val camera = frame.buffer
    val texture = camera as? VideoFrame.TextureBuffer
    val cameraWidth = texture?.unscaledWidth ?: camera.width
    val cameraHeight = texture?.unscaledHeight ?: camera.height
    Log.i(TAG, String.format(
      java.util.Locale.US,
      "camera %dx%d rot %d -> processed %dx%d | %.1f fps | frame %.1f ms | sdk %.1f ms | dropped %d | input %dx%d %.1f fps | max %.1f ms",
      cameraWidth, cameraHeight, frame.rotation, width, height, fps, avgMs, sdkMs, dropped,
      camera.width, camera.height, inputFps, windowMaxCostMs,
    ))
    BeautyController.updateStats(mapOf(
      "cameraWidth" to cameraWidth, "cameraHeight" to cameraHeight, "rotation" to frame.rotation,
      "inputWidth" to camera.width, "inputHeight" to camera.height, "inputFps" to inputFps,
      "width" to width, "height" to height, "fps" to fps, "frameMs" to avgMs, "sdkMs" to sdkMs,
      "frameMaxMs" to windowMaxCostMs,
      "dropped" to dropped, "gl" to glVersion,
    ), this)
    windowStart = now
    windowFrames = 0
    windowCostMs = 0.0
    windowMaxCostMs = 0.0
    windowFirstInputNs = 0L
  }

  fun release() {
    check(Looper.myLooper() == handler.looper)
    if (released) return
    released = true
    runCatching { engine?.release() }
    engine = null
    if (glContext != EGL14.EGL_NO_CONTEXT) makeCurrent()
    input?.release()
    input = null
    outputs.filter { !it.inUse }.forEach { it.buffer.release() }
    outputs.removeAll { !it.inUse }
    // Retained texture frames may still need toI420 for an encoder. Keep their
    // converter/context/handler alive until the final output is returned.
    if (outputs.isEmpty()) finishRelease()
  }

  private fun finishRelease() {
    drawer?.release()
    frameDrawer?.release()
    yuvConverter?.release()
    drawer = null
    frameDrawer = null
    yuvConverter = null
    destroyGl()
    glThread.quitSafely()
  }

  private fun destroyGl() {
    if (display == EGL14.EGL_NO_DISPLAY) return
    EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
    if (surface != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, surface)
    if (glContext != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(display, glContext)
    surface = EGL14.EGL_NO_SURFACE
    glContext = EGL14.EGL_NO_CONTEXT
    // The EGL display belongs to WebRTC too; terminating it would end the call.
    display = EGL14.EGL_NO_DISPLAY
  }

  private fun targetSize(width: Int, height: Int): Pair<Int, Int> {
    val longSide = maxOf(width, height)
    val scale = if (longSide > MAX_LONG) MAX_LONG.toFloat() / longSide else 1f
    return even((width * scale).toInt()) to even((height * scale).toInt())
  }

  private fun even(value: Int) = (value.coerceAtLeast(2) / 2) * 2

  private fun publish(status: String) = BeautyController.publish(status, this)

  companion object {
    private const val TAG = "BinzoBeauty"
    // Retain the full source edge, including 1920x1440 capture. Smaller
    // WebRTC-adapted input is never upscaled to pretend it is higher resolution.
    private const val MAX_LONG = 1920
    private const val MAX_OUTPUTS = 6
    private const val STATS_WINDOW_MS = 2000L
    private val IDENTITY = floatArrayOf(1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f)
  }
}
