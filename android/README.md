# NEXORA SMM Android app

A native Android WebView shell for https://nexora-smm.onrender.com. The website remains the source of truth, so normal website content, service, price, and design updates appear in the app without rebuilding or reinstalling it.

## Test APK

The GitHub Actions workflow builds a debug APK artifact named `nexora-smm-debug-apk`. It uses the separate application ID `com.nexora.smm.debug` and is for testing only.

## Same-app updates (signed release)

The production application ID is `com.nexora.smm`. To install future APKs as updates over the existing production app, every release must be signed with the exact same private keystore. The workflow builds and uploads `nexora-smm-release-apk` only when all four GitHub Actions repository secrets are configured:

- `ANDROID_KEYSTORE_BASE64`: base64-encoded private .jks keystore
- `ANDROID_KEYSTORE_PASSWORD`: keystore password
- `ANDROID_KEY_ALIAS`: key alias
- `ANDROID_KEY_PASSWORD`: key password

Keep the keystore and passwords private and backed up securely. Never commit them to the repository. If the keystore is lost, Android will not accept future APKs as updates to the installed app.

## Fingerprint lock

Install the app, open the Android overflow menu, and choose **Enable fingerprint lock**. This is a local app-unlock gate; it does not replace NEXORA website login or store the website password.

## Push notifications setup required

Push code is included, but real delivery is not active until the owner creates a Firebase Android app with package name `com.nexora.smm`, places its Firebase-provided `google-services.json` in `android/app/` (do not commit that file), and configures a secure backend endpoint to associate FCM registration tokens with authenticated users. The app requests Android 13+ notification permission. Do not send private account data in notification payloads.

## Security notes

- JavaScript and DOM storage are enabled because the existing site requires them.
- Only the exact NEXORA SMM HTTPS host is kept inside the WebView.
- External web links open in the Android browser.
- File/content access, mixed content, cleartext traffic, and popup windows are disabled.
- The website remains the source of truth; online website updates appear in the app.

## Build delivery

Every push that changes files under `android/` or this workflow runs the build. The debug APK is for testing; the signed release APK is the installable production package for same-app updates.
