package expo.modules.binzomedia

import com.oney.WebRTCModule.videoEffects.ProcessorProvider
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap

class BinzoMediaModule : Module() {
  private var audio: CallAudioSession? = null
  @Volatile private var activityVisible = false
  @Volatile private var alive = true
  private val serviceLeases = ConcurrentHashMap.newKeySet<String>()

  override fun definition() = ModuleDefinition {
    Name("BinzoMedia")

    Events("onBeautyStatus", "onCallServiceStopped")

    OnCreate {
      activityVisible = appContext.currentActivity?.hasWindowFocus() == true
      BeautyController.appContext = appContext.reactContext?.applicationContext
      audio = appContext.reactContext?.let { CallAudioSession(it.applicationContext) }
      BeautyController.onStatus = { status -> sendEvent("onBeautyStatus", mapOf("status" to status)) }
      CallForegroundService.onStopped = { callId, lease -> sendEvent("onCallServiceStopped", mapOf("callId" to callId, "lease" to lease)) }
      ProcessorProvider.addProcessor(
        BeautyController.PROCESSOR,
        VideoFrameProcessorFactoryInterface { FacebetterFrameProcessor() },
      )
    }

    OnDestroy {
      alive = false
      activityVisible = false
      audio?.end()
      audio = null
      appContext.reactContext?.applicationContext?.let { context -> serviceLeases.toList().forEach { CallForegroundService.stop(context, it) } }
      serviceLeases.clear()
      CallForegroundService.onStopped = null
      BeautyController.onStatus = null
      BeautyController.release {}
    }

    Function("isBeautySupported") { BeautyController.supported }

    OnActivityEntersForeground { activityVisible = true }
    OnActivityEntersBackground { activityVisible = false }
    OnUserLeavesActivity { activityVisible = false }

    Function("beginCallAudio") { video: Boolean -> audio?.begin(video) }

    Function("endCallAudio") { audio?.end() }

    AsyncFunction("beginCallService") { callId: String, video: Boolean, lease: String, promise: Promise ->
      serviceLeases.add(lease)
      val context = appContext.reactContext?.applicationContext
      val visible = appContext.currentActivity != null && activityVisible
      if (!alive || context == null || !visible && !CallForegroundService.isRunning(lease)) {
        serviceLeases.remove(lease)
        context?.let { CallForegroundService.stop(it, lease) }
        promise.reject("CALL_SERVICE_UNAVAILABLE", "Return to BinzoLive before connecting your call.", null)
      }
      else CallForegroundService.start(context, callId, video, lease) { error ->
        if (error == null) promise.resolve(null)
        else promise.reject("CALL_SERVICE_UNAVAILABLE", "Your call could not continue in the background. Return to BinzoLive and try again.", error)
      }
    }

    Function("endCallService") { lease: String ->
      serviceLeases.remove(lease)
      appContext.reactContext?.applicationContext?.let { CallForegroundService.stop(it, lease) }
    }

    // The server mints the Android license; app keys never reach the device.
    Function("configureBeauty") { licenseToken: String -> BeautyController.configure(licenseToken) }

    Function("applyBeauty") { commandsJson: String -> BeautyController.apply(commandsJson) }

    Function("setBeautyEnabled") { enabled: Boolean -> BeautyController.enabled = enabled }

    Function("getBeautyStats") { BeautyController.stats() }

    // Call before stopping the camera track so GL objects are freed on their own thread.
    AsyncFunction("releaseBeauty") { promise: Promise ->
      BeautyController.release { promise.resolve(null) }
    }
  }
}
