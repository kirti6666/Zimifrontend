package expo.modules.binzomedia

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log

/** Own only the call's audio focus/mode/route, and restore the previous session. */
@Suppress("DEPRECATION")
internal class CallAudioSession(context: Context) {
  private val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val main = Handler(Looper.getMainLooper())
  private val focusListener = AudioManager.OnAudioFocusChangeListener { /* Android handles competing call focus. */ }
  private var focusRequest: AudioFocusRequest? = null
  private var active = false
  private var video = false
  private var previousMode = AudioManager.MODE_NORMAL
  private var previousSpeaker = false
  private var previousDevice: AudioDeviceInfo? = null
  private val devices = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) = updateRoute()
    override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) = updateRoute()
  }

  @Synchronized
  fun begin(video: Boolean) {
    this.video = video
    if (active) { updateRoute(); return }
    previousMode = manager.mode
    previousSpeaker = manager.isSpeakerphoneOn
    previousDevice = if (Build.VERSION.SDK_INT >= 31) manager.communicationDevice else null
    active = true
    try {
      if (Build.VERSION.SDK_INT >= 26) {
        val attributes = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
        focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
          .setAudioAttributes(attributes).setOnAudioFocusChangeListener(focusListener, main).build()
        manager.requestAudioFocus(focusRequest!!)
      } else {
        manager.requestAudioFocus(focusListener, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
      }
      manager.mode = AudioManager.MODE_IN_COMMUNICATION
      manager.registerAudioDeviceCallback(devices, main)
      updateRoute()
    } catch (error: RuntimeException) {
      Log.w(TAG, "audio setup failed (${error.javaClass.simpleName})")
      end()
    }
  }

  @Synchronized
  private fun updateRoute() {
    if (!active) return
    try {
      if (Build.VERSION.SDK_INT >= 31) {
        val available = manager.availableCommunicationDevices
        val current = manager.communicationDevice
        val external = current?.takeIf { isExternal(it) && available.any { device -> device.id == it.id } }
          ?: available.firstOrNull(::isExternal)
        val builtin = if (video) AudioDeviceInfo.TYPE_BUILTIN_SPEAKER else AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
        val selected = external ?: available.firstOrNull { it.type == builtin }
        if (selected != null) manager.setCommunicationDevice(selected)
        else manager.clearCommunicationDevice()
      } else {
        val external = manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any(::isExternal)
        manager.isSpeakerphoneOn = video && !external
      }
    } catch (error: RuntimeException) {
      // Route controls must never make the camera or RTP session fail.
      Log.w(TAG, "audio route unavailable (${error.javaClass.simpleName})")
    }
  }

  @Synchronized
  fun end() {
    if (!active) return
    active = false
    runCatching { manager.unregisterAudioDeviceCallback(devices) }
    runCatching { manager.mode = previousMode }
    runCatching {
      if (Build.VERSION.SDK_INT >= 31) {
        val restore = previousDevice?.let { old -> manager.availableCommunicationDevices.firstOrNull { it.id == old.id } }
        if (restore != null) manager.setCommunicationDevice(restore) else manager.clearCommunicationDevice()
      } else manager.isSpeakerphoneOn = previousSpeaker
    }
    runCatching {
      if (Build.VERSION.SDK_INT >= 26) focusRequest?.let { manager.abandonAudioFocusRequest(it) }
      else manager.abandonAudioFocus(focusListener)
    }
    focusRequest = null
    previousDevice = null
  }

  private fun isExternal(device: AudioDeviceInfo): Boolean = device.type in EXTERNAL_TYPES

  companion object {
    private const val TAG = "BinzoAudio"
    private val EXTERNAL_TYPES = setOf(
      AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_DEVICE,
      AudioDeviceInfo.TYPE_HEARING_AID, AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLE_SPEAKER,
    )
  }
}
