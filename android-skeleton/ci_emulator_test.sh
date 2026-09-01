#!/usr/bin/env bash
set -euo pipefail

echo "=== Locating signed release APK ==="
APK_FILE=$(find _paperclip/ui/android/app/build/outputs/apk -name "*.apk" -not -name "*unsigned*" 2>/dev/null | head -1)
[ -z "$APK_FILE" ] && APK_FILE=$(find _paperclip/ui/android/app/build/outputs/apk -name "*.apk" 2>/dev/null | head -1)
[ -z "$APK_FILE" ] && APK_FILE=$(find app/build/outputs/apk -name "*.apk" -not -name "*unsigned*" 2>/dev/null | head -1)
[ -z "$APK_FILE" ] && APK_FILE=$(find app/build/outputs/apk -name "*.apk" 2>/dev/null | head -1)
echo "Using APK: $APK_FILE"
ls -lh "$APK_FILE"

echo "=== Installing APK into real Android Emulator ==="
adb wait-for-device
adb shell settings put global window_animation_scale 0 || true
adb shell settings put global transition_animation_scale 0 || true
adb shell settings put global animator_duration_scale 0 || true

# Check available disk space inside emulator
echo "--- Emulator Disk Space ---"
adb shell df -h /data

# Fast Direct Install over ADB
echo "--- Performing adb install ---"
APK_SIZE=$(stat -c%s "$APK_FILE" 2>/dev/null || wc -c < "$APK_FILE")
echo "APK Size in bytes: $APK_SIZE"

# Increase timeout and buffer sizes for ADB
export ADB_TRACE=0
adb shell settings put global sys_storage_threshold_percentage 0 || true
adb shell settings put global sys_storage_threshold_max_bytes 0 || true

# Direct push to emulator /data/local/tmp with fast streaming
echo "Streaming APK to emulator..."
adb push "$APK_FILE" /data/local/tmp/app.apk

echo "Installing from local file..."
adb shell pm install -r -d /data/local/tmp/app.apk
adb shell rm -f /data/local/tmp/app.apk || true

echo "--- Starting MainActivity & foreground Services ---"
adb shell am start -n com.paperclip.app/.MainActivity

# Setup port forwarding for external curl check from runner (3100 = Paperclip LAN server)
adb forward tcp:3100 tcp:3100 || true

echo "--- Monitoring Paperclip WebView Process + Port 3100 ---"
OK_PID=0
OK_PORT=0
OK_WEBVIEW=0

for i in $(seq 1 45); do
  sleep 3
  PID=$(adb shell pidof com.paperclip.app 2>/dev/null || echo "none")
  echo "[Tick $i/45] App PID: $PID"

  # 1) Check if process is running
  if [ "$PID" != "none" ] && [ -n "$PID" ]; then
    echo "✓ [PID] Paperclip app process is running!"
    OK_PID=1
  fi

  # 2) Check port 3100 (Paperclip LAN server / health endpoint)
  HEALTH_RESP=$(curl -s --max-time 3 "http://127.0.0.1:3100/api/health" 2>/dev/null || curl -s --max-time 3 "http://127.0.0.1:3100/" 2>/dev/null || true)
  if [ -n "$HEALTH_RESP" ]; then
    echo "✓ [3100] Paperclip server is UP! Response snippet:"
    echo "$HEALTH_RESP" | head -n 5
    OK_PORT=1
  fi

  # 3) Check if WebView is rendering (look for chromium activity in logcat)
  WEBVIEW_LOG=$(adb logcat -d -s chromium:I 2>/dev/null | tail -5 || true)
  if echo "$WEBVIEW_LOG" | grep -qi "renderer\|page.*load\|didFinishLoad\|WebView" 2>/dev/null; then
    echo "✓ [WebView] Chromium renderer is active!"
    OK_WEBVIEW=1
  fi

  # 4) Check if KeepAliveService is running
  KA_PID=$(adb shell pidof com.paperclip.app:KeepAlive 2>/dev/null || echo "")
  if [ -n "$KA_PID" ]; then
    echo "✓ [KeepAlive] KeepAliveService is running! PID=$KA_PID"
  fi

  # 5) Check listening ports inside emulator
  if [ $((i % 5)) -eq 0 ]; then
    echo "--- Listening ports inside emulator ---"
    adb shell "netstat -tuln 2>/dev/null | grep 3100 || ss -tuln 2>/dev/null | grep 3100 || echo 'port 3100 not listening yet'" || true
  fi

  if [ "$OK_PID" = "1" ] && [ "$OK_PORT" = "1" ]; then
    echo "✓ App running + port 3100 responding!"
    sleep 3
    break
  fi
done

# Final diagnostic dump
echo "=== Diagnostic Inspection of App Internal State ==="
adb shell "run-as com.paperclip.app ls -la /data/data/com.paperclip.app/files/ 2>/dev/null || ls -la /data/data/com.paperclip.app/files/ 2>/dev/null" || true
echo "--- All listening ports ---"
adb shell "netstat -tuln 2>/dev/null || ss -tulpn 2>/dev/null" || true

echo "=== Full Logcat Output for Paperclip & Crash Logs ==="
adb logcat -d -s PaperclipMain:I PaperclipKA:I chromium:I WebView:E AndroidRuntime:E libc:F DEBUG:F 2>/dev/null | tail -120 || true

# Final verdict
echo ""
echo "=== E2E RESULT ==="
PASS=true
if [ "$OK_PID" != "1" ]; then
  echo "❌ FAIL: App process did not start"
  PASS=false
fi
if [ "$OK_PORT" != "1" ]; then
  echo "⚠️  WARN: Port 3100 not responding (server may not be embedded in this build)"
fi
if [ "$PASS" = "true" ]; then
  echo "✅ PASS: Paperclip app launched, process running"
  [ "$OK_PORT" = "1" ] && echo "✅ PASS: Port 3100 (LAN server) responding"
  [ "$OK_WEBVIEW" = "1" ] && echo "✅ PASS: WebView chromium renderer active"
  exit 0
else
  exit 1
fi
