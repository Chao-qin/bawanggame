package com.xiaochao.bawang

import android.content.pm.ActivityInfo
import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/** Turns the activity when the player picks portrait or landscape; "auto" follows the rotation sensor again. */
class XiaochaoOrientationModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = NAME

  @ReactMethod
  fun lock(mode: String) {
    val activity = reactApplicationContext.currentActivity ?: return
    val requested = when (mode) {
      "portrait" -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
      "landscape" -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
      else -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    }
    activity.runOnUiThread { activity.requestedOrientation = requested }
  }

  companion object {
    const val NAME = "XiaochaoOrientation"
  }
}

class XiaochaoHostPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == XiaochaoOrientationModule.NAME) XiaochaoOrientationModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
      XiaochaoOrientationModule.NAME to ReactModuleInfo(
        XiaochaoOrientationModule.NAME,
        XiaochaoOrientationModule::class.java.name,
        false, // canOverrideExistingModule
        false, // needsEagerInit
        false, // isCxxModule
        false, // isTurboModule: a legacy module served through the interop layer
      ),
    )
  }
}
