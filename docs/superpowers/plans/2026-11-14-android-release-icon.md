# Android Release Packaging and Launcher Icon Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan.

**Goal:** Produce an installable RN release APK that embeds its JavaScript bundle and uses a recognizable Q-style launcher icon.

**Architecture:** Keep RN debug builds Metro-backed, while the release variant is the distributable artifact. Generate one vector master icon and rasterize it into Android density resources, preserving the existing manifest names.

**Tech Stack:** React Native 0.88.1, Android Gradle Plugin, Gradle, Android SDK, SVG/ImageMagick or equivalent raster tooling.

---

## Chunk 1: Release Build Flow

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/android/app/build.gradle` only if release bundling needs explicit configuration

- [x] Confirm the current release task and inspect generated APK contents with `unzip -l`.
- [x] Add a focused `build-android-release` script that runs `prepare-web` and the release Gradle task from the Android project.
- [x] Keep the existing debug `android` script unchanged so Metro remains available for development.
- [x] Run the new script and verify `assets/index.android.bundle` exists in `app-release.apk`.

## Chunk 2: Q-Style Android Launcher Icon

**Files:**
- Create: `apps/mobile/assets/icon_master.svg`
- Replace: `apps/mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher.png`
- Replace: `apps/mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher.png`
- Replace: `apps/mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png`
- Replace: `apps/mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png`
- Replace: `apps/mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`
- Replace: matching `ic_launcher_round.png` files

- [x] Draw the deep-indigo rounded-square background, orange handheld mascot, yellow screen, and crown accent in the master SVG.
- [x] Rasterize the master into 48, 72, 96, 144, and 192 px launcher assets plus round variants.
- [x] Inspect the generated images at 48 px and 192 px to ensure the silhouette remains readable and no transparent edge is clipped.
- [x] Confirm the existing manifest references resolve to the new resources.

## Chunk 3: Release Installation Verification

**Files:**
- No source changes expected.

- [x] Run `pnpm mobile:prepare-web`.
- [x] Run `./gradlew :app:assembleRelease` with Java 17 and the configured Android SDK.
- [x] Install `app-release.apk` on `xiaochao-api35` or a connected Android device.
- [x] Launch `com.xiaochao.bawang` without Metro and confirm the red “Unable to load script” screen does not appear.
- [x] Run `git status --short` and verify only intended source, resource, and documentation changes remain.

