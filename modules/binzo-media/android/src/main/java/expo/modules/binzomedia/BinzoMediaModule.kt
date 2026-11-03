package expo.modules.binzomedia

import com.oney.WebRTCModule.videoEffects.ProcessorProvider
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BinzoMediaModule : Module() {
  private var audio: CallAudioSession? = null

  override fun definition() = ModuleDefinition {
    Name("BinzoMedia")

    Events("onBeautyStatus")

    OnCreate {
      BeautyController.appContext = appContext.reactContext?.applicationContext
      audio = appContext.reactContext?.let { CallAudioSession(it.applicationContext) }
      BeautyController.onStatus = { status -> sendEvent("onBeautyStatus", mapOf("status" to status)) }
      ProcessorProvider.addProcessor(
        BeautyController.PROCESSOR,
        VideoFrameProcessorFactoryInterface { FacebetterFrameProcessor() },
      )
    }

    OnDestroy {
      audio?.end()
      audio = null
      BeautyController.onStatus = null
      BeautyController.release {}
    }

    Function("isBeautySupported") { BeautyController.supported }

    Function("beginCallAudio") { video: Boolean -> audio?.begin(video) }

    Function("endCallAudio") { audio?.end() }

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
