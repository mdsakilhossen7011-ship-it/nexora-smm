package com.nexora.smm

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat

private const val HOME_URL = "https://nexora-smm.onrender.com/"
private const val TRUSTED_HOST = "nexora-smm.onrender.com"

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var offlineView: LinearLayout
    private var lockChecked = false
    private val prefs by lazy { getSharedPreferences("nexora_app", MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(8, 9, 26)
        window.navigationBarColor = Color.rgb(8, 9, 26)
        createLayout()
        requestNotificationPermission()
        if (prefs.getBoolean("biometric_enabled", false)) {
            authenticateWithBiometrics()
        } else {
            lockChecked = true
            loadHome()
        }
    }

    private fun createLayout() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(8, 9, 26))
        }
        webView = WebView(this).apply {
            setBackgroundColor(Color.rgb(8, 9, 26))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.loadsImagesAutomatically = true
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val uri = request.url
                    if (uri.scheme == "https" && uri.host == TRUSTED_HOST) return false
                    if (uri.scheme == "http" || uri.scheme == "https" || uri.scheme == "mailto" || uri.scheme == "tel") {
                        try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (_: ActivityNotFoundException) { }
                    }
                    return true
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
                    if (request.isForMainFrame) showOffline()
                }

                override fun onPageFinished(view: WebView, url: String?) {
                    offlineView.visibility = View.GONE
                    webView.visibility = View.VISIBLE
                }
            }
        }
        offlineView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            setPadding(32, 32, 32, 32)
            visibility = View.GONE
            addView(TextView(this@MainActivity).apply {
                text = "NEXORA SMM\n\nইন্টারনেট সংযোগ পাওয়া যাচ্ছে না। আবার চেষ্টা করুন।"
                setTextColor(Color.WHITE); textSize = 19f; gravity = android.view.Gravity.CENTER
            })
            addView(Button(this@MainActivity).apply {
                text = "আবার চেষ্টা করুন"
                setOnClickListener { loadHome() }
            })
        }
        root.addView(webView, LinearLayout.LayoutParams(-1, 0, 1f))
        root.addView(offlineView, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(root)
    }

    private fun loadHome() {
        if (!isOnline()) { showOffline(); return }
        offlineView.visibility = View.GONE
        webView.visibility = View.VISIBLE
        if (webView.url.isNullOrBlank()) webView.loadUrl(HOME_URL) else webView.reload()
    }

    private fun showOffline() {
        webView.visibility = View.GONE
        offlineView.visibility = View.VISIBLE
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(0, 1, 0, if (prefs.getBoolean("biometric_enabled", false)) "Fingerprint lock: ON" else "Enable fingerprint lock")
        menu.add(0, 2, 1, "Refresh")
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        when (item.itemId) {
            1 -> toggleBiometric()
            2 -> loadHome()
            else -> return super.onOptionsItemSelected(item)
        }
        return true
    }

    private fun toggleBiometric() {
        val enabled = prefs.getBoolean("biometric_enabled", false)
        if (enabled) {
            prefs.edit().putBoolean("biometric_enabled", false).apply()
            Toast.makeText(this, "Fingerprint lock disabled", Toast.LENGTH_SHORT).show()
            invalidateOptionsMenu()
            return
        }
        val manager = BiometricManager.from(this)
        if (manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) != BiometricManager.BIOMETRIC_SUCCESS) {
            Toast.makeText(this, "এই ফোনে Fingerprint/Biometric সেটআপ নেই", Toast.LENGTH_LONG).show()
            return
        }
        BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                prefs.edit().putBoolean("biometric_enabled", true).apply()
                invalidateOptionsMenu()
                Toast.makeText(this@MainActivity, "Fingerprint lock enabled", Toast.LENGTH_SHORT).show()
            }
        }).authenticate(BiometricPrompt.PromptInfo.Builder()
            .setTitle("Enable NEXORA SMM app lock")
            .setSubtitle("Confirm your identity")
            .setNegativeButtonText("Cancel")
            .build())
    }

    private fun authenticateWithBiometrics() {
        val manager = BiometricManager.from(this)
        if (manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) != BiometricManager.BIOMETRIC_SUCCESS) {
            prefs.edit().putBoolean("biometric_enabled", false).apply()
            lockChecked = true
            loadHome()
            return
        }
        BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                lockChecked = true
                loadHome()
            }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                finish()
            }
        }).authenticate(BiometricPrompt.PromptInfo.Builder()
            .setTitle("NEXORA SMM")
            .setSubtitle("Unlock with fingerprint")
            .setNegativeButtonText("Exit")
            .build())
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 2001)
        }
    }

    @Deprecated("Deprecated in Android API")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.visibility == View.VISIBLE && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
