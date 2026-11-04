package expo.modules.binzomedia

import com.oney.WebRTCModule.videoEffects.ProcessorProvider
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BinzoMediaModule : Module() {
  private var audio: CallAudioSession? = null
  @Volatile private var activityVisible = false

  override fun definition() = ModuleDefinition {
    Name("BinzoMedia")

    Events("onBeautyStatus", "onCallServiceStopped")

    OnCreate {
      activityVisible = appContext.currentActivity?.hasWindowFocus() == true
      BeautyController.appContext = appContext.reactContext?.applicationContext
      audio = appContext.reactContext?.let { CallAudioSession(it.applicationContext) }
      BeautyController.onStatus = { status -> sendEvent("onBeautyStatus", mapOf("status" to status)) }
      CallForegroundService.onStopped = { callId -> sendEvent("onCallServiceStopped", mapOf("callId" to callId)) }
      ProcessorProvider.addProcessor(
        BeautyController.PROCESSOR,
        VideoFrameProcessorFactoryInterface { FacebetterFrameProcessor() },
      )
    }

    OnDestroy {
      activityVisible = false
      audio?.end()
      audio = null
      appContext.reactContext?.applicationContext?.let { CallForegroundService.stop(it) }
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

    AsyncFunction("beginCallService") { callId: String, video: Boolean, promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      val visible = appContext.currentActivity != null && activityVisible
      if (context == null || !visible && !CallForegroundService.isRunning(callId, video)) promise.reject("CALL_SERVICE_UNAVAILABLE", "Return to BinzoLive before connecting your call.", null)
      else CallForegroundService.start(context, callId, video) { error ->
        if (error == null) promise.resolve(null)
        else promise.reject("CALL_SERVICE_UNAVAILABLE", "Your call could not continue in the background. Return to BinzoLive and try again.", error)
      }
    }

    Function("endCallService") { callId: String ->
      appContext.reactContext?.applicationContext?.let { CallForegroundService.stop(it, callId) }
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
