package __PACKAGE__

import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.AtomicFile
import androidx.core.content.FileProvider
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors
import javax.net.ssl.HttpsURLConnection

class BinzoApkUpdaterPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(BinzoApkUpdaterModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class BinzoUpdateFileProvider : FileProvider()

/** Update files never leave app-private storage until a verified receipt is
 * handed to Android's installer through the narrowly scoped FileProvider. */
class BinzoApkUpdaterModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val downloads = Executors.newSingleThreadExecutor()
  private val checks = Executors.newSingleThreadExecutor()
  private val lock = Any()
  @Volatile private var active: DownloadJob? = null
  private val root get() = File(context.cacheDir, "apk-updates").apply { mkdirs() }
  private val partials get() = File(root, "partials").apply { mkdirs() }
  private val verified get() = File(root, "verified").apply { mkdirs() }
  private val receipts get() = File(root, "receipts").apply { mkdirs() }
  private val preferences get() = context.getSharedPreferences("binzo_verified_updates", 0)
  private val allowedHosts by lazy { context.resources.getStringArray(R.array.binzolive_update_hosts).map { it.lowercase() }.toSet() }

  override fun getName() = "BinzoApkUpdater"
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}

  private class UpdateFailure(val errorCode: String, message: String) : IOException(message)
  private data class Release(val id: String, val url: String, val sha: String, val size: Long, val version: Long) {
    fun json() = JSONObject().put("releaseId", id).put("url", url).put("sha256", sha).put("sizeBytes", size).put("versionCode", version)
  }
  private class DownloadJob(val release: Release) {
    @Volatile var cancelled = false
    @Volatile var discard = false
    @Volatile var connection: HttpURLConnection? = null
  }
  private fun fail(code: String, message: String): Nothing = throw UpdateFailure(code, message)
  private fun reject(promise: Promise, error: Exception) {
    promise.reject((error as? UpdateFailure)?.errorCode ?: "UPDATE_FAILED", error.message ?: "The update could not be completed.", error)
  }
  private fun validId(id: String) = Regex("^[A-Za-z0-9_-]{1,100}$").matches(id)
  private fun requireId(id: String) { if (!validId(id)) fail("UPDATE_BAD_MANIFEST", "This update release is invalid.") }
  private fun release(data: ReadableMap): Release {
    val id = data.getString("releaseId") ?: ""
    requireId(id)
    val sha = data.getString("sha256")?.lowercase() ?: ""
    val size = data.getDouble("sizeBytes")
    val version = data.getDouble("versionCode")
    if (!Regex("^[a-f0-9]{64}$").matches(sha) || !size.isFinite() || size < 1 || size > MAX_BYTES || size != size.toLong().toDouble() ||
      !version.isFinite() || version < 1 || version > Int.MAX_VALUE || version != version.toLong().toDouble())
      fail("UPDATE_BAD_MANIFEST", "This update has invalid download details.")
    val url = data.getString("url") ?: ""
    val parsed = secureUrl(url)
    if (parsed.host.lowercase() != "api.binzolive.com" || parsed.path != "/api/v1/app/releases/$id/download" || parsed.query != null)
      fail("UPDATE_UNTRUSTED_URL", "The update must come from the published app release.")
    return Release(id, url, sha, size.toLong(), version.toLong())
  }
  private fun secureUrl(value: String): URL {
    val url = try { URL(value) } catch (_: Exception) { fail("UPDATE_UNTRUSTED_URL", "The update download address is invalid.") }
    if (url.protocol != "https" || url.userInfo != null || url.ref != null || url.port !in listOf(-1, 443) ||
      value.any { it.isWhitespace() || it == '\\' } || url.host.lowercase() !in allowedHosts)
      fail("UPDATE_UNTRUSTED_URL", "The update download address is not trusted.")
    return url
  }
  @Suppress("DEPRECATION")
  private fun ownPackage(): PackageInfo = context.packageManager.getPackageInfo(context.packageName, signatureFlags())
  @Suppress("DEPRECATION")
  private fun signatureFlags(): Int = PackageManager.GET_SIGNATURES or (if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else 0)
  @Suppress("DEPRECATION")
  private fun version(info: PackageInfo): Long = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
  @Suppress("DEPRECATION")
  private fun signers(info: PackageInfo): Set<String> {
    val signatures = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
    return signatures?.map { hex(MessageDigest.getInstance("SHA-256").digest(it.toByteArray())) }?.toSet() ?: emptySet()
  }
  private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it.toInt() and 255) }

  @ReactMethod fun getInstalledApp(promise: Promise) {
    try {
      val info = ownPackage()
      promise.resolve(Arguments.createMap().apply {
        putBoolean("supported", true); putString("packageName", context.packageName)
        putString("versionName", info.versionName ?: ""); putDouble("versionCode", version(info).toDouble())
      })
    } catch (error: Exception) { reject(promise, error) }
  }
  private fun writeJson(file: File, value: JSONObject) {
    val atomic = AtomicFile(file)
    val stream = atomic.startWrite()
    try { stream.write(value.toString().toByteArray(Charsets.UTF_8)); atomic.finishWrite(stream) }
    catch (error: Exception) { atomic.failWrite(stream); throw error }
  }
  private fun partial(release: Release) = File(partials, "${release.id}.part")
  private fun partialMetadata(release: Release) = File(partials, "${release.id}.json")
  private fun erasePartial(release: Release) { partial(release).delete(); partialMetadata(release).delete() }
  private fun prunePartials(release: Release) {
    partials.listFiles()?.filter { it.name != "${release.id}.part" && it.name != "${release.id}.json" }?.forEach { it.delete() }
    verified.listFiles()?.filter { it.extension == "apk" && !File(receipts, it.nameWithoutExtension + ".json").isFile }?.forEach { it.delete() }
  }
  private fun checkCurrent(job: DownloadJob) {
    if (job.cancelled || active !== job) fail("UPDATE_CANCELLED", "Update download cancelled.")
  }
  private fun progress(release: Release, downloaded: Long, phase: String) {
    if (!context.hasActiveReactInstance()) return
    try {
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("BinzoApkUpdaterProgress", Arguments.createMap().apply {
        putString("releaseId", release.id); putDouble("downloadedBytes", downloaded.toDouble())
        putDouble("totalBytes", release.size.toDouble()); putString("phase", phase)
      })
    } catch (_: Exception) { /* A replacement React document reads the persisted receipt. */ }
  }
  private fun receiptMap(value: JSONObject): WritableMap = Arguments.createMap().apply {
    putString("receiptId", value.getString("receiptId")); putString("releaseId", value.getString("releaseId"))
    putDouble("versionCode", value.getLong("versionCode").toDouble()); putDouble("sizeBytes", value.getLong("sizeBytes").toDouble())
    putString("sha256", value.getString("sha256"))
  }
  @Suppress("DEPRECATION")
  private fun verifyApk(file: File, release: Release) {
    if (!file.isFile || file.length() != release.size) fail("UPDATE_SIZE", "The update file is incomplete. Download it again.")
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buffer = ByteArray(128 * 1024)
      while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) }
    }
    if (hex(digest.digest()) != release.sha) fail("UPDATE_CHECKSUM", "The update file could not be verified. Download it again.")
    val archive = context.packageManager.getPackageArchiveInfo(file.absolutePath, signatureFlags())
      ?: fail("UPDATE_PACKAGE", "This file is not a valid signed Android app.")
    val installed = ownPackage()
    if (archive.packageName != context.packageName) fail("UPDATE_PACKAGE", "This update belongs to a different app.")
    if (version(archive) != release.version || release.version <= version(installed))
      fail("UPDATE_VERSION", "This update does not contain a newer matching app version.")
    val installedSigners = signers(installed)
    if (installedSigners.isEmpty() || installedSigners != signers(archive))
      fail("UPDATE_SIGNER", "This update is not signed by the installed app's publisher.")
  }
  private fun receipt(id: String): Pair<JSONObject, File> {
    if (!Regex("^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$").matches(id)) fail("UPDATE_RECEIPT", "Download the update before installing it.")
    val metadata = File(receipts, "$id.json")
    if (!metadata.isFile) fail("UPDATE_RECEIPT", "Download the update before installing it.")
    return JSONObject(metadata.readText()) to File(verified, "$id.apk")
  }
  private fun release(value: JSONObject): Release = Release(value.getString("releaseId"), value.getString("url"), value.getString("sha256"), value.getLong("sizeBytes"), value.getLong("versionCode"))
  private fun cached(releaseId: String): WritableMap? {
    val id = preferences.getString(releaseId, null) ?: return null
    try {
      val (metadata, file) = receipt(id)
      if (metadata.getString("releaseId") != releaseId) return null
      verifyApk(file, release(metadata))
      return receiptMap(metadata)
    } catch (_: Exception) {
      File(verified, "$id.apk").delete(); File(receipts, "$id.json").delete(); preferences.edit().remove(releaseId).commit()
      return null
    }
  }
  @ReactMethod fun getVerifiedRelease(releaseId: String, promise: Promise) {
    checks.execute { try { requireId(releaseId); promise.resolve(cached(releaseId)) } catch (error: Exception) { reject(promise, error) } }
  }
  @ReactMethod fun cancelDownload(releaseId: String, discard: Boolean, promise: Promise) {
    try {
      requireId(releaseId)
      val job = synchronized(lock) { active?.takeIf { it.release.id == releaseId }?.also { it.cancelled = true; it.discard = discard; it.connection?.disconnect() } }
      if (job == null && discard) downloads.execute { File(partials, "$releaseId.part").delete(); File(partials, "$releaseId.json").delete() }
      promise.resolve(null)
    } catch (error: Exception) { reject(promise, error) }
  }
  @ReactMethod fun downloadRelease(data: ReadableMap, promise: Promise) {
    val release = try { release(data) } catch (error: Exception) { reject(promise, error); return }
    val job = DownloadJob(release)
    synchronized(lock) {
      val previous = active
      if (previous != null && !previous.cancelled && previous.release == release) { promise.reject("UPDATE_BUSY", "This update is already downloading."); return }
      previous?.let { it.cancelled = true; it.discard = it.release.id != release.id; it.connection?.disconnect() }
      active = job
    }
    downloads.execute {
      var createdReceipt: String? = null
      var committed = false
      try {
        checkCurrent(job)
        prunePartials(release)
        val available = cached(release.id)
        if (available != null && available.getString("sha256") == release.sha && available.getDouble("versionCode").toLong() == release.version) {
          progress(release, release.size, "ready"); promise.resolve(available); return@execute
        }
        val file = download(job)
        checkCurrent(job); progress(release, release.size, "verifying"); verifyApk(file, release); checkCurrent(job)
        val receiptId = UUID.randomUUID().toString()
        createdReceipt = receiptId
        val destination = File(verified, "$receiptId.apk")
        if (!file.renameTo(destination)) fail("UPDATE_STORAGE", "The verified update could not be saved. Please retry.")
        val metadata = release.json().put("receiptId", receiptId)
        writeJson(File(receipts, "$receiptId.json"), metadata)
        if (!preferences.edit().putString(release.id, receiptId).commit()) fail("UPDATE_STORAGE", "The verified update could not be remembered. Please retry.")
        committed = true
        partialMetadata(release).delete()
        // Keep at most two verified installers across permission/activity roundtrips.
        receipts.listFiles()?.filter { it.name.endsWith(".json") }?.sortedByDescending { it.lastModified() }?.drop(2)?.forEach { old ->
          File(verified, old.name.removeSuffix(".json") + ".apk").delete(); old.delete()
        }
        progress(release, release.size, "ready"); promise.resolve(receiptMap(metadata))
      } catch (error: Exception) {
        if (!committed) createdReceipt?.let { File(verified, "$it.apk").delete(); File(receipts, "$it.json").delete() }
        if (job.cancelled) {
          if (job.discard) erasePartial(release)
          progress(release, partial(release).length(), "cancelled")
          promise.reject("UPDATE_CANCELLED", "Update download cancelled.")
        } else {
          if (error is UpdateFailure && error.errorCode in setOf("UPDATE_SIZE", "UPDATE_CHECKSUM", "UPDATE_PACKAGE", "UPDATE_VERSION", "UPDATE_SIGNER", "UPDATE_UNTRUSTED_URL")) erasePartial(release)
          reject(promise, error)
        }
      } finally {
        job.connection?.disconnect(); synchronized(lock) { if (active === job) active = null }
      }
    }
  }
  private fun download(job: DownloadJob): File {
    val release = job.release
    val file = partial(release)
    val metadata = partialMetadata(release)
    val previous = try { if (metadata.isFile) JSONObject(metadata.readText()).toString() else "" } catch (_: Exception) { "" }
    if (previous != release.json().toString() || file.length() > release.size) erasePartial(release)
    writeJson(metadata, release.json())
    var downloaded = file.length()
    if (downloaded == release.size) return file
    if (partials.usableSpace < release.size - downloaded + 10 * 1024 * 1024) fail("UPDATE_STORAGE", "There is not enough space to download this update.")
    var url = secureUrl(release.url)
    var redirects = 0
    var connection: HttpURLConnection
    while (true) {
      checkCurrent(job)
      connection = url.openConnection() as HttpsURLConnection
      job.connection = connection
      connection.instanceFollowRedirects = false; connection.connectTimeout = 15000; connection.readTimeout = 20000
      connection.useCaches = false; connection.setRequestProperty("Accept-Encoding", "identity")
      // The public release URL needs no account token, cookies or other credentials.
      connection.setRequestProperty("Cookie", ""); connection.setRequestProperty("Authorization", "")
      if (downloaded > 0) connection.setRequestProperty("Range", "bytes=$downloaded-")
      val status = connection.responseCode
      if (status in listOf(301, 302, 303, 307, 308)) {
        val location = connection.getHeaderField("Location") ?: fail("UPDATE_HTTP", "The update download has no destination.")
        connection.disconnect()
        if (++redirects > 5) fail("UPDATE_HTTP", "The update download redirected too many times.")
        url = secureUrl(URL(url, location).toString()); continue
      }
      if (status == 200) downloaded = 0
      else if (status == 206) {
        val range = Regex("^bytes (\\d+)-(\\d+)/(\\d+)$").matchEntire(connection.getHeaderField("Content-Range") ?: "")
          ?: fail("UPDATE_SIZE", "The resumed update response is invalid. Retry the download.")
        if (range.groupValues[1].toLong() != downloaded || range.groupValues[3].toLong() != release.size || range.groupValues[2].toLong() != release.size - 1)
          fail("UPDATE_SIZE", "The resumed update response does not match this release.")
      } else fail("UPDATE_HTTP", "The update could not be downloaded (HTTP $status). Please retry.")
      val encoded = connection.getHeaderField("Content-Encoding")
      if (encoded != null && encoded.lowercase() != "identity") fail("UPDATE_SIZE", "The update response has an unsupported encoding.")
      val length = connection.contentLengthLong
      if (length >= 0 && length != release.size - downloaded) fail("UPDATE_SIZE", "The update download size does not match the published release.")
      break
    }
    progress(release, downloaded, "downloading")
    var lastProgress = System.currentTimeMillis()
    connection.inputStream.use { input -> FileOutputStream(file, downloaded > 0).use { output ->
      val buffer = ByteArray(128 * 1024)
      while (true) {
        checkCurrent(job)
        val count = input.read(buffer); if (count < 0) break
        downloaded += count
        if (downloaded > release.size || downloaded > MAX_BYTES) fail("UPDATE_SIZE", "The update download is larger than the published release.")
        output.write(buffer, 0, count)
        val now = System.currentTimeMillis()
        if (now - lastProgress >= 150) { progress(release, downloaded, "downloading"); lastProgress = now }
      }
      output.fd.sync()
    } }
    if (downloaded != release.size) fail("UPDATE_HTTP", "The update download was interrupted. Retry to resume it.")
    return file
  }
  @ReactMethod fun installRelease(receiptId: String, promise: Promise) {
    checks.execute {
      try {
        val (metadata, file) = receipt(receiptId)
        verifyApk(file, release(metadata))
        context.runOnUiQueueThread {
          try {
            val activity = context.currentActivity ?: fail("UPDATE_ACTIVITY", "Return to the app before installing the update.")
            if (Build.VERSION.SDK_INT >= 26 && !context.packageManager.canRequestPackageInstalls()) {
              activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")))
              promise.resolve(Arguments.createMap().apply { putString("status", "permission_required") })
            } else {
              val uri = FileProvider.getUriForFile(context, "${context.packageName}.apk-updates", file)
              val intent = Intent(Intent.ACTION_INSTALL_PACKAGE).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, false)
              intent.clipData = ClipData.newRawUri("Verified app update", uri)
              activity.startActivity(intent)
              promise.resolve(Arguments.createMap().apply { putString("status", "installer_opened") })
            }
          } catch (error: Exception) { reject(promise, error) }
        }
      } catch (error: Exception) { reject(promise, error) }
    }
  }
  override fun invalidate() {
    active?.let { it.cancelled = true; it.connection?.disconnect() }
    downloads.shutdown(); checks.shutdown(); super.invalidate()
  }
  companion object { private const val MAX_BYTES = 250L * 1024 * 1024 }
}
