package com.example.mobile_canvas

import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var webViewBridge: WebViewBridge

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        webViewBridge = WebViewBridge(webView)
        
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
        }

        webView.webViewClient = WebViewClient()
        webView.addJavascriptInterface(webViewBridge, "Android")

        // Load your app's URL
        webView.loadUrl("file:///android_asset/www/index.html")
    }
} 