package com.pisonet.timeroverlay

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.google.android.material.button.MaterialButton
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.Collections
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private data class AppConfig(
        val unitId: Int,
        val serverHost: String,
        val wsPort: Int,
        val apiPort: Int,
        val graceSeconds: Int,
        val unlockPassword: String
    )

    private lateinit var rootContainer: View
    private lateinit var unitLabel: TextView
    private lateinit var timerLabel: TextView
    private lateinit var statusLabel: TextView
    private lateinit var messageLabel: TextView
    private lateinit var connectionDot: View
    private lateinit var connectionLabel: TextView
    private lateinit var setupBtn: MaterialButton
    private lateinit var fullscreenBtn: MaterialButton
    private lateinit var unlockBtn: MaterialButton

    private val uiHandler = Handler(Looper.getMainLooper())

    private val wsClient = OkHttpClient.Builder()
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private var ws: WebSocket? = null
    private var reconnectRunnable: Runnable? = null
    private var currentConfig: AppConfig? = null

    private var remainingSeconds = 0
    private var openTimeActive = false
    private var openTimeElapsed = 0
    private var openTimeAmount = 0.0
    private var warningActive = false
    private var warningSecondsLeft = 60
    private var adminUnlocked = false
    private var connected = false

    private var flashState = false

    private val warningThresholdSeconds = 300
    private val criticalThresholdSeconds = 120

    private val tickerRunnable = object : Runnable {
        override fun run() {
            onTick()
            uiHandler.postDelayed(this, 1000)
        }
    }

    private val flashRunnable = object : Runnable {
        override fun run() {
            val shouldFlash = remainingSeconds > 0 && remainingSeconds <= warningThresholdSeconds && !warningActive
            flashState = if (shouldFlash) !flashState else false
            updateDisplay()
            uiHandler.postDelayed(this, 350)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        bindViews()
        bindUiActions()
        initializeConfig()

        uiHandler.post(tickerRunnable)
        uiHandler.post(flashRunnable)
    }

    override fun onResume() {
        super.onResume()
        enterImmersiveMode()
    }

    override fun onDestroy() {
        super.onDestroy()
        uiHandler.removeCallbacks(tickerRunnable)
        uiHandler.removeCallbacks(flashRunnable)
        reconnectRunnable?.let { uiHandler.removeCallbacks(it) }
        ws?.close(1000, "activity destroyed")
    }

    private fun bindViews() {
        rootContainer = findViewById(R.id.rootContainer)
        unitLabel = findViewById(R.id.unitLabel)
        timerLabel = findViewById(R.id.timerLabel)
        statusLabel = findViewById(R.id.statusLabel)
        messageLabel = findViewById(R.id.messageLabel)
        connectionDot = findViewById(R.id.connectionDot)
        connectionLabel = findViewById(R.id.connectionLabel)
        setupBtn = findViewById(R.id.setupBtn)
        fullscreenBtn = findViewById(R.id.fullscreenBtn)
        unlockBtn = findViewById(R.id.unlockBtn)
    }

    private fun bindUiActions() {
        setupBtn.setOnClickListener {
            showSetupDialog()
        }

        fullscreenBtn.setOnClickListener {
            enterImmersiveMode()
        }

        unlockBtn.setOnClickListener {
            promptUnlock()
        }
    }

    private fun initializeConfig() {
        val loaded = loadConfig()
        if (loaded == null) {
            showSetupDialog(force = true)
        } else {
            applyConfig(loaded)
            connectWebSocket()
            updateDisplay()
        }
    }

    private fun showSetupDialog(force: Boolean = false) {
        val dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_setup, null)

        val inputUnit = dialogView.findViewById<EditText>(R.id.inputUnit)
        val inputServer = dialogView.findViewById<EditText>(R.id.inputServer)
        val inputWsPort = dialogView.findViewById<EditText>(R.id.inputWsPort)
        val inputApiPort = dialogView.findViewById<EditText>(R.id.inputApiPort)
        val inputGrace = dialogView.findViewById<EditText>(R.id.inputGrace)
        val inputUnlock = dialogView.findViewById<EditText>(R.id.inputUnlock)

        val existing = currentConfig ?: loadConfig()
        val autoDetectedUnit = detectUnitFromIpRange()

        inputUnit.setText((existing?.unitId ?: autoDetectedUnit ?: "").toString())
        inputServer.setText(existing?.serverHost ?: "192.168.254.201")
        inputWsPort.setText((existing?.wsPort ?: 5001).toString())
        inputApiPort.setText((existing?.apiPort ?: 5001).toString())
        inputGrace.setText((existing?.graceSeconds ?: 60).toString())
        inputUnlock.setText(existing?.unlockPassword ?: "")

        val dialogBuilder = AlertDialog.Builder(this)
            .setTitle("Android Timer Overlay Setup")
            .setView(dialogView)
            .setPositiveButton("Save") { _, _ ->
                val unit = inputUnit.text?.toString()?.trim()?.toIntOrNull()
                val server = inputServer.text?.toString()?.trim().orEmpty()
                val wsPort = inputWsPort.text?.toString()?.trim()?.toIntOrNull()
                val apiPort = inputApiPort.text?.toString()?.trim()?.toIntOrNull()
                val grace = inputGrace.text?.toString()?.trim()?.toIntOrNull()
                val unlock = inputUnlock.text?.toString().orEmpty()

                if (unit == null || unit <= 0 || server.isEmpty() || wsPort == null || wsPort <= 0 || apiPort == null || apiPort <= 0 || grace == null || grace <= 0) {
                    Toast.makeText(this, "Invalid setup values.", Toast.LENGTH_SHORT).show()
                    if (force) {
                        showSetupDialog(force = true)
                    }
                    return@setPositiveButton
                }

                val cfg = AppConfig(unit, server, wsPort, apiPort, grace, unlock)
                saveConfig(cfg)
                applyConfig(cfg)
                connectWebSocket()
                updateDisplay()
            }
            .setNegativeButton(if (force) "Exit" else "Cancel") { _, _ ->
                if (force) {
                    finish()
                }
            }

        val dialog = dialogBuilder.create()
        dialog.setCancelable(!force)
        dialog.setCanceledOnTouchOutside(!force)
        dialog.show()
    }

    private fun loadConfig(): AppConfig? {
        val prefs = getSharedPreferences("pisonet_android_overlay", Context.MODE_PRIVATE)

        val unit = prefs.getInt("unit_id", 0)
        val server = prefs.getString("server_host", "")?.trim().orEmpty()
        val wsPort = prefs.getInt("ws_port", 5001)
        val apiPort = prefs.getInt("api_port", 5001)
        val grace = prefs.getInt("grace_seconds", 60)
        val unlock = prefs.getString("unlock_password", "").orEmpty()

        if (unit <= 0 || server.isEmpty()) {
            return null
        }

        return AppConfig(unit, server, wsPort, apiPort, grace, unlock)
    }

    private fun saveConfig(cfg: AppConfig) {
        val prefs = getSharedPreferences("pisonet_android_overlay", Context.MODE_PRIVATE)
        prefs.edit()
            .putInt("unit_id", cfg.unitId)
            .putString("server_host", cfg.serverHost)
            .putInt("ws_port", cfg.wsPort)
            .putInt("api_port", cfg.apiPort)
            .putInt("grace_seconds", cfg.graceSeconds)
            .putString("unlock_password", cfg.unlockPassword)
            .apply()
    }

    private fun applyConfig(cfg: AppConfig) {
        currentConfig = cfg
        unitLabel.text = "PC ${cfg.unitId}"
        warningSecondsLeft = cfg.graceSeconds
    }

    private fun connectWebSocket() {
        val cfg = currentConfig ?: return

        reconnectRunnable?.let { uiHandler.removeCallbacks(it) }

        ws?.cancel()
        ws = null

        val request = Request.Builder()
            .url("ws://${cfg.serverHost}:${cfg.wsPort}")
            .build()

        ws = wsClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                runOnUiThread {
                    setConnected(true)
                    loadInitialState()
                    updateDisplay()
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleWsMessage(text)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                runOnUiThread {
                    setConnected(false)
                    scheduleReconnect()
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                runOnUiThread {
                    setConnected(false)
                    scheduleReconnect()
                }
            }
        })
    }

    private fun scheduleReconnect() {
        reconnectRunnable?.let { uiHandler.removeCallbacks(it) }
        reconnectRunnable = Runnable { connectWebSocket() }
        uiHandler.postDelayed(reconnectRunnable!!, 3000)
    }

    private fun loadInitialState() {
        val cfg = currentConfig ?: return
        val request = Request.Builder()
            .url("http://${cfg.serverHost}:${cfg.apiPort}/api/units")
            .get()
            .build()

        wsClient.newCall(request).enqueue(object : okhttp3.Callback {
            override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
                // Use websocket updates if API bootstrap fails.
            }

            override fun onResponse(call: okhttp3.Call, response: Response) {
                val body = response.body?.string() ?: return
                if (!response.isSuccessful) {
                    return
                }

                try {
                    val array = JSONArray(body)
                    for (i in 0 until array.length()) {
                        val item = array.optJSONObject(i) ?: continue
                        val id = item.optInt("id", 0)
                        if (id == cfg.unitId) {
                            val seconds = item.optInt("remaining_seconds", 0)
                            runOnUiThread {
                                remainingSeconds = seconds
                                if (remainingSeconds > 0) {
                                    adminUnlocked = false
                                    resetExpiredState()
                                }
                                updateDisplay()
                            }
                            break
                        }
                    }
                } catch (_: Exception) {
                    // Ignore malformed bootstrap payload.
                }
            }
        })
    }

    private fun handleWsMessage(text: String) {
        val cfg = currentConfig ?: return
        try {
            val data = JSONObject(text)
            val type = data.optString("type")

            when (type) {
                "initial_state" -> {
                    val items = data.optJSONArray("data") ?: JSONArray()
                    for (i in 0 until items.length()) {
                        val item = items.optJSONObject(i) ?: continue
                        if (item.optInt("unit_id", 0) == cfg.unitId) {
                            val seconds = item.optInt("remaining_seconds", 0)
                            runOnUiThread {
                                remainingSeconds = seconds
                                if (remainingSeconds > 0) {
                                    adminUnlocked = false
                                    resetExpiredState()
                                }
                                updateDisplay()
                            }
                            break
                        }
                    }
                }

                "timer_update" -> {
                    val payload = data.optJSONObject("data") ?: return
                    if (payload.optInt("unit_id", 0) != cfg.unitId) return
                    val seconds = payload.optInt("remaining_seconds", 0)
                    runOnUiThread {
                        remainingSeconds = seconds
                        if (remainingSeconds > 0) {
                            adminUnlocked = false
                            resetExpiredState()
                        }
                        updateDisplay()
                    }
                }

                "coin_insert" -> {
                    val payload = data.optJSONObject("data") ?: return
                    if (payload.optInt("unit_id", 0) != cfg.unitId) return
                    val coinValue = payload.optInt("coin_value", 0)
                    runOnUiThread {
                        remainingSeconds += coinValue * 60
                        if (remainingSeconds > 0) {
                            adminUnlocked = false
                            resetExpiredState()
                        }
                        updateDisplay()
                    }
                }

                "UNIT_UPDATE" -> {
                    val unit = data.optJSONObject("unit") ?: return
                    runOnUiThread {
                        applyUnitPayload(unit)
                        updateDisplay()
                    }
                }

                "COIN_INSERTED" -> {
                    val unit = data.optJSONObject("unit") ?: return
                    runOnUiThread {
                        applyUnitPayload(unit)
                        updateDisplay()
                    }
                }

                "HARDWARE_CONTROL" -> {
                    if (data.optInt("unit_id", 0) != cfg.unitId) return
                    val action = data.optString("action")
                    runOnUiThread {
                        if (action == "shutdown") {
                            beginShutdownWarning()
                            messageLabel.text = "Remote shutdown command received."
                        } else if (action == "restart") {
                            messageLabel.text = "Remote restart command received."
                        }
                    }
                }
            }
        } catch (_: Exception) {
            // Ignore unsupported websocket messages.
        }
    }

    private fun applyUnitPayload(unit: JSONObject) {
        val cfg = currentConfig ?: return
        val unitId = if (unit.has("id")) unit.optInt("id", 0) else unit.optInt("unit_id", 0)
        if (unitId != cfg.unitId) {
            return
        }

        remainingSeconds = unit.optInt("remaining_seconds", 0)

        val isOpenTime = unit.optInt("open_time", 0) == 1
        openTimeActive = isOpenTime

        if (isOpenTime) {
            openTimeElapsed = unit.optInt("open_time_elapsed", 0)
            openTimeAmount = unit.optDouble("open_time_amount", 0.0)
        } else {
            openTimeElapsed = 0
            openTimeAmount = 0.0
        }

        if (remainingSeconds > 0 || isOpenTime) {
            adminUnlocked = false
            resetExpiredState()
        }
    }

    private fun onTick() {
        if (openTimeActive) {
            openTimeElapsed += 1
        } else if (remainingSeconds > 0) {
            remainingSeconds -= 1
            if (adminUnlocked) {
                adminUnlocked = false
            }
        } else if (warningActive && warningSecondsLeft > 0) {
            warningSecondsLeft -= 1
        } else if (!warningActive && remainingSeconds <= 0 && !adminUnlocked && !openTimeActive) {
            beginShutdownWarning()
        }

        updateDisplay()
    }

    private fun beginShutdownWarning() {
        if (warningActive) return

        warningActive = true
        warningSecondsLeft = currentConfig?.graceSeconds ?: 60
        unlockBtn.visibility = View.VISIBLE
        beepTone()
    }

    private fun resetExpiredState() {
        warningActive = false
        warningSecondsLeft = currentConfig?.graceSeconds ?: 60
        unlockBtn.visibility = View.GONE
    }

    private fun performAdminUnlock() {
        adminUnlocked = true
        warningActive = false
        warningSecondsLeft = currentConfig?.graceSeconds ?: 60
        unlockBtn.visibility = View.GONE
        updateDisplay()
    }

    private fun promptUnlock() {
        if (!warningActive) {
            return
        }

        val cfg = currentConfig ?: return
        if (cfg.unlockPassword.isBlank()) {
            Toast.makeText(this, "Unlock password is not configured.", Toast.LENGTH_SHORT).show()
            return
        }

        val passwordInput = EditText(this)
        passwordInput.hint = "Unlock password"

        AlertDialog.Builder(this)
            .setTitle("Admin Unlock")
            .setView(passwordInput)
            .setPositiveButton("Unlock") { _, _ ->
                val entered = passwordInput.text?.toString().orEmpty()
                if (entered == cfg.unlockPassword) {
                    performAdminUnlock()
                } else {
                    Toast.makeText(this, "Incorrect password.", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun updateDisplay() {
        if (openTimeActive) {
            setModeOpenTime()
            timerLabel.text = formatTime(openTimeElapsed)
            statusLabel.text = "OPEN TIME"
            messageLabel.text = "Amount: PHP ${"%.2f".format(openTimeAmount)}"
            return
        }

        if (warningActive) {
            setModeLocked()
            timerLabel.text = formatTime(warningSecondsLeft)
            statusLabel.text = "SESSION LOCKED"
            messageLabel.text = "Please insert coin to unlock this unit or it will shutdown in ${warningSecondsLeft}s."
            return
        }

        if (adminUnlocked && remainingSeconds <= 0) {
            setModeWarning()
            timerLabel.text = "00:00"
            statusLabel.text = "ADMIN UNLOCK"
            messageLabel.text = "Admin override active. Add time to resume normal session."
            return
        }

        if (remainingSeconds <= 0) {
            setModeCritical()
            timerLabel.text = "00:00"
            statusLabel.text = "TIME EXPIRED"
            messageLabel.text = "Locking screen..."
            return
        }

        if (remainingSeconds <= criticalThresholdSeconds) {
            setModeCritical()
            timerLabel.text = formatTime(remainingSeconds)
            statusLabel.text = "WARNING: SAVE YOUR WORK"
            messageLabel.text = "Add time now to avoid lock and shutdown."
            return
        }

        if (remainingSeconds <= warningThresholdSeconds) {
            setModeWarning()
            timerLabel.text = formatTime(remainingSeconds)
            statusLabel.text = "LOW TIME"
            messageLabel.text = "Time is almost up. Insert coin soon."
            return
        }

        setModeNormal()
        timerLabel.text = formatTime(remainingSeconds)
        statusLabel.text = "Active Session"
        messageLabel.text = ""
    }

    private fun setModeNormal() {
        rootContainer.setBackgroundColor(colorOf(R.color.bg_normal))
        timerLabel.setTextColor(colorOf(R.color.fg_normal))
        statusLabel.setTextColor(colorOf(R.color.white))
        messageLabel.setTextColor(colorOf(R.color.yellow_hint))
        unlockBtn.visibility = View.GONE
        setConnected(connected)
    }

    private fun setModeWarning() {
        rootContainer.setBackgroundColor(colorOf(R.color.bg_warning))
        val color = if (flashState) colorOf(R.color.fg_critical) else colorOf(R.color.fg_warning)
        timerLabel.setTextColor(color)
        statusLabel.setTextColor(colorOf(R.color.fg_warning))
        messageLabel.setTextColor(colorOf(R.color.yellow_hint))
        unlockBtn.visibility = View.GONE
        setConnected(connected)
    }

    private fun setModeCritical() {
        rootContainer.setBackgroundColor(colorOf(R.color.bg_critical))
        timerLabel.setTextColor(colorOf(R.color.fg_critical))
        statusLabel.setTextColor(colorOf(R.color.fg_critical))
        messageLabel.setTextColor(colorOf(R.color.yellow_hint))
        unlockBtn.visibility = View.GONE
        setConnected(connected)
    }

    private fun setModeLocked() {
        rootContainer.setBackgroundColor(colorOf(R.color.bg_critical))
        timerLabel.setTextColor(colorOf(R.color.fg_critical))
        statusLabel.setTextColor(colorOf(R.color.fg_critical))
        messageLabel.setTextColor(colorOf(R.color.yellow_hint))
        unlockBtn.visibility = View.VISIBLE
        setConnected(connected)
    }

    private fun setModeOpenTime() {
        rootContainer.setBackgroundColor(colorOf(R.color.bg_open_time))
        timerLabel.setTextColor(colorOf(R.color.fg_normal))
        statusLabel.setTextColor(colorOf(R.color.fg_normal))
        messageLabel.setTextColor(colorOf(R.color.white))
        unlockBtn.visibility = View.GONE
        setConnected(connected)
    }

    private fun setConnected(isConnected: Boolean) {
        connected = isConnected
        connectionLabel.text = if (isConnected) "Connected" else "Disconnected"
        connectionDot.setBackgroundColor(if (isConnected) colorOf(R.color.indicator_online) else colorOf(R.color.indicator_offline))
    }

    private fun colorOf(colorRes: Int): Int {
        return ContextCompat.getColor(this, colorRes)
    }

    private fun formatTime(seconds: Int): String {
        val safe = if (seconds < 0) 0 else seconds
        val min = safe / 60
        val sec = safe % 60
        return String.format("%02d:%02d", min, sec)
    }

    private fun enterImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    private fun beepTone() {
        try {
            val tone = ToneGenerator(AudioManager.STREAM_ALARM, 80)
            tone.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 180)
        } catch (_: Exception) {
            // Ignore devices without alarm stream access.
        }
    }

    private fun detectUnitFromIpRange(): Int? {
        return try {
            val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
            interfaces.forEach { intf ->
                val addresses = Collections.list(intf.inetAddresses)
                addresses.forEach { address ->
                    if (address is Inet4Address && !address.isLoopbackAddress) {
                        val ip = address.hostAddress ?: return@forEach
                        if (ip.startsWith("192.168.254.")) {
                            val last = ip.substringAfterLast('.').toIntOrNull() ?: return@forEach
                            if (last in 151..160) {
                                return last - 150
                            }
                        }
                    }
                }
            }
            null
        } catch (_: Exception) {
            null
        }
    }
}
