# Android Release Packaging and Launcher Icon Design

## Goal

Make the Android deliverable installable without Metro and give the application a recognizable Q-style launcher icon.

## Decisions

- Use the RN release variant as the distributable package. Release builds include `index.android.bundle` and do not depend on a Metro server.
- Keep debug builds aligned with RN conventions: they remain Metro-backed for development and are not presented as installable release artifacts.
- Add a build command that prepares the embedded web assets and assembles the release APK from the Android project.
- Use a deep indigo rounded-square icon background, an orange handheld console mascot, a warm yellow screen, and a small crown accent. Keep the silhouette bold and high contrast at launcher sizes.
- Generate density-specific legacy PNG resources plus a round variant from one master artwork. The manifest continues to reference `ic_launcher` and `ic_launcher_round`.

## Build Flow

1. Prepare the React web bundle and copy it into `apps/mobile/web`.
2. Run the RN/Gradle release task.
3. Verify that the release APK contains the React Native bundle and embedded web assets.
4. Install the release APK on the Android emulator or a connected device for a smoke check.

## Error Handling

- A debug APK launched without Metro is expected to show the RN “Unable to load script” screen; documentation and scripts must make the release artifact the default installable package.
- Build failures must surface from the underlying Gradle command rather than silently producing a debug APK.

## Acceptance Criteria

- `pnpm mobile:prepare-web` succeeds.
- `./gradlew :app:assembleRelease` succeeds with the configured Android SDK.
- The release APK contains `assets/index.android.bundle` and the packaged web resources.
- The launcher icon is present in all configured density folders and is visibly distinct from the default RN icon.
- Installing and launching the release APK does not require Metro.
