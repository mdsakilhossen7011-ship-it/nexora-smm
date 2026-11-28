# NEXORA SMM Android app

A native Android WebView shell for https://nexora-smm.onrender.com with a branded launcher icon, HTTPS-only trusted-domain navigation, offline retry screen, browser handoff for external links, back navigation, optional Android biometric app lock, and Firebase Cloud Messaging receiver.

## Build a test APK

The repository workflow `.github/workflows/android-apk.yml` builds a debug APK and uploads it as a GitHub Actions artifact. Open the workflow run, download `nexora-smm-debug-apk`, extract it, and install the APK on an Android phone. Debug builds use application ID `com.nexora.smm.debug`.

## Fingerprint lock

Install the app, open the Android overflow menu, and choose **Enable fingerprint lock**. This is a local app-unlock gate; it does not replace NEXORA website login or store the website password.

## Push notifications setup required

Push code is included, but real delivery is not active until the owner creates a Firebase Android app with package name `com.nexora.smm`, places its Firebase-provided `google-services.json` in `android/app/` (do not commit that file), and configures a secure backend endpoint to associate FCM registration tokens with authenticated users. The app requests Android 13+ notification permission. Do not send private account data in notification payloads.

## Release signing

The workflow creates a debug APK for testing only. A distributable signed release APK requires a private signing keystore and GitHub Actions secrets. Never commit a keystore or passwords to this repository.

## Security notes

- JavaScript and DOM storage are enabled because the existing site requires them.
- Only the exact NEXORA SMM HTTPS host is kept inside the WebView.
- External web links open in the Android browser.
- File/content access, mixed content, cleartext traffic, and popup windows are disabled.
- The website remains the source of truth; online website updates appear in the app without rebuilding the APK.
