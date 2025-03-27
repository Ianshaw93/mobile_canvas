package com.example.mobile_canvas

import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView

class WebViewBridge(private val webView: WebView) {
    @JavascriptInterface
    fun log(level: String, tag: String, message: String) {
        when (level) {
            "D" -> Log.d(tag, message)
            "I" -> Log.i(tag, message)
            "W" -> Log.w(tag, message)
            "E" -> Log.e(tag, message)
        }
    }
} 