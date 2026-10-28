package expo.modules.callscreen

import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.WindowManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/* What the incoming-call notification needs beyond react-native-notify-kit: Android 14+
   lets people switch off full-screen call alerts, and the app may show over the lock
   screen only while a call rings or is live, never for chats or the wallet. */
class CallScreenModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CallScreen")

    Function("canUseFullScreenIntent") {
      val context = appContext.reactContext ?: return@Function true
      Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
        context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
    }

    Function("openFullScreenIntentSettings") {
      val context = appContext.reactContext ?: return@Function
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return@Function
      context.startActivity(
        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }

    Function("showOverLockScreen") { on: Boolean ->
      val activity = appContext.currentActivity ?: return@Function
      activity.runOnUiThread {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
          activity.setShowWhenLocked(on)
          activity.setTurnScreenOn(on)
        } else {
          @Suppress("DEPRECATION")
          val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
          if (on) activity.window.addFlags(flags) else activity.window.clearFlags(flags)
        }
      }
    }
  }
}
