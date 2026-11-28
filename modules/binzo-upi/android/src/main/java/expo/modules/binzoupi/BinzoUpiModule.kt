package expo.modules.binzoupi

import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BinzoUpiModule : Module() {
  private val upiPackages = mapOf(
    "phonepe" to "com.phonepe.app",
    "gpay" to "com.google.android.apps.nbu.paisa.user",
    "paytm" to "net.one97.paytm",
  )

  override fun definition() = ModuleDefinition {
    Name("BinzoUpi")

    AsyncFunction("installedApps") {
      val packageManager = checkNotNull(appContext.reactContext).packageManager
      upiPackages.mapValues { (_, packageName) ->
        try {
          @Suppress("DEPRECATION")
          packageManager.getPackageInfo(packageName, 0)
          true
        } catch (_: PackageManager.NameNotFoundException) {
          false
        }
      }
    }
  }
}
