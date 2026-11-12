package com.tekserp.playguncelleme

import android.app.Activity
import android.content.Context
import android.os.Build
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Play uygulama içi güncelleme — İNCE köprü. Karar (ne zaman, hangi tür, hangi ekran) JS'tedir
 * (`src/services/playGuncelleme.ts`, OTA ile düzeltilebilir). Burada yalnız: kurulum kaynağı, durum
 * sorgusu, akış başlatma, indirileni kurma. Hiçbir çağrı fırlatmaz — hata "hata" durumu olarak döner
 * (fail-open: Play yok / çevrimdışı / yan yükleme işi engellemez).
 * Bilerek YOK: indirme bitince kendiliğinden kurma — yeniden başlatma operatörün dokunuşuyla olur.
 */
class TeksErpPlayGuncellemeModule : Module() {
  private var yonetici: AppUpdateManager? = null

  private val context: Context?
    get() = appContext.reactContext?.applicationContext

  private val dinleyici = InstallStateUpdatedListener { s ->
    val durum = when (s.installStatus()) {
      InstallStatus.PENDING, InstallStatus.DOWNLOADING -> "indiriliyor"
      InstallStatus.DOWNLOADED -> "indirildi"
      InstallStatus.INSTALLED -> "kuruldu"
      InstallStatus.FAILED -> "basarisiz"
      InstallStatus.CANCELED -> "iptal"
      else -> null
    }
    if (durum != null) sendEvent("onState", mapOf("state" to durum))
  }

  private fun yoneticiAl(): AppUpdateManager? {
    yonetici?.let { return it }
    val ctx = context ?: return null
    return try {
      AppUpdateManagerFactory.create(ctx).also {
        it.registerListener(dinleyici)
        yonetici = it
      }
    } catch (_: Throwable) {
      null
    }
  }

  private fun sorguHaritasi(i: AppUpdateInfo): Map<String, Any?> {
    val kurulum = i.installStatus()
    val musaitlik = i.updateAvailability()
    val tur = when {
      kurulum == InstallStatus.DOWNLOADED -> "indirildi"
      kurulum == InstallStatus.DOWNLOADING || kurulum == InstallStatus.PENDING -> "indiriliyor"
      musaitlik == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS -> "suruyor"
      musaitlik == UpdateAvailability.UPDATE_AVAILABLE -> "var"
      else -> "yok"
    }
    return mapOf(
      "kind" to tur,
      "immediateAllowed" to i.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE),
      "flexibleAllowed" to i.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE),
      "versionCode" to i.availableVersionCode(),
      "priority" to i.updatePriority(),
      "stalenessDays" to i.clientVersionStalenessDays(),
    )
  }

  override fun definition() = ModuleDefinition {
    Name("TeksErpPlayGuncelleme")
    Events("onState")

    /** Uygulamayı kuran paket ("com.android.vending" = Play). Yan yüklemede null/başka paket. */
    Function("installerPackage") {
      val ctx = context ?: return@Function null
      try {
        if (Build.VERSION.SDK_INT >= 30) {
          ctx.packageManager.getInstallSourceInfo(ctx.packageName).installingPackageName
        } else {
          @Suppress("DEPRECATION")
          ctx.packageManager.getInstallerPackageName(ctx.packageName)
        }
      } catch (_: Throwable) {
        null
      }
    }

    AsyncFunction("query") { promise: Promise ->
      val m = yoneticiAl()
      if (m == null) {
        promise.resolve(mapOf("kind" to "hata"))
        return@AsyncFunction
      }
      try {
        m.appUpdateInfo
          .addOnSuccessListener { promise.resolve(sorguHaritasi(it)) }
          .addOnFailureListener { promise.resolve(mapOf("kind" to "hata", "message" to (it.message ?: ""))) }
      } catch (e: Throwable) {
        promise.resolve(mapOf("kind" to "hata", "message" to (e.message ?: "")))
      }
    }

    /** tur: "hemen" (tam ekran Play akışı) | "esnek" (arka planda indir). Başladıysa true. */
    AsyncFunction("start") { tur: String, promise: Promise ->
      val m = yoneticiAl()
      val etkinlik = appContext.currentActivity
      if (m == null || etkinlik == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      val tip = if (tur == "hemen") AppUpdateType.IMMEDIATE else AppUpdateType.FLEXIBLE
      try {
        m.appUpdateInfo
          .addOnSuccessListener { i ->
            val musaitlik = i.updateAvailability()
            val uygun = (musaitlik == UpdateAvailability.UPDATE_AVAILABLE ||
              (tip == AppUpdateType.IMMEDIATE && musaitlik == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS)) &&
              i.isUpdateTypeAllowed(tip)
            if (!uygun) {
              promise.resolve(false)
              return@addOnSuccessListener
            }
            try {
              m.startUpdateFlowForResult(i, etkinlik, AppUpdateOptions.newBuilder(tip).build(), ISTEK_KODU)
              promise.resolve(true)
            } catch (_: Throwable) {
              promise.resolve(false)
            }
          }
          .addOnFailureListener { promise.resolve(false) }
      } catch (_: Throwable) {
        promise.resolve(false)
      }
    }

    /** İndirilmiş esnek güncellemeyi kurar (uygulama yeniden başlar). */
    Function("complete") {
      val m = yoneticiAl() ?: return@Function false
      try {
        m.completeUpdate()
        true
      } catch (_: Throwable) {
        false
      }
    }

    OnActivityResult { _, sonuc ->
      if (sonuc.requestCode == ISTEK_KODU) {
        sendEvent("onState", mapOf("state" to if (sonuc.resultCode == Activity.RESULT_OK) "kabul" else "iptal"))
      }
    }

    OnDestroy {
      try {
        yonetici?.unregisterListener(dinleyici)
      } catch (_: Throwable) {
      }
      yonetici = null
    }
  }

  companion object {
    private const val ISTEK_KODU = 0x7e57
  }
}
