package expo.modules.binzomedia

import android.opengl.EGL14
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoFrame

/**
 * Registered with react-native-webrtc as "facebetter" and attached to a camera
 * track with track._setVideoEffects(["facebetter"]). Returning null sends the
 * unprocessed camera frame, so a beauty failure never blanks the call.
 */
internal class FacebetterFrameProcessor : VideoFrameProcessor {
  override fun process(frame: VideoFrame, textureHelper: SurfaceTextureHelper): VideoFrame? {
    if (!BeautyController.enabled || !BeautyController.supported) return null
    val token = BeautyController.licenseToken ?: return null
    val context = EGL14.eglGetCurrentContext()
    if (context == EGL14.EGL_NO_CONTEXT) return null
    return BeautyController.sessionFor(context, token)?.process(frame, token)
  }
}
