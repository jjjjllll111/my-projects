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

echo "--- Monitoring Paperclip WebView Process ---"
OK_PID=0
OK_WEBVIEW=0

for i in $(seq 1 45); do
  sleep 3
  PID=$(adb shell pidof com.paperclip.app 2>/dev/null || echo "none")
  echo "[Tick $i/45] App PID: $PID"

  # Check if process is running
  if [ "$PID" != "none" ] && [ -n "$PID" ]; then
    echo "✓ [PID] Paperclip app process is running!"
    OK_PID=1
  fi

  # Check if WebView is rendering (look for chromium activity in logcat)
  WEBVIEW_LOG=$(adb logcat -d -s chromium:I 2>/dev/null | tail -5 || true)
  if echo "$WEBVIEW_LOG" | grep -qi "renderer\|page.*load\|didFinishLoad\|WebView" 2>/dev/null; then
    echo "✓ [WebView] Chromium renderer is active!"
    OK_WEBVIEW=1
  fi

  # Check if KeepAliveService is running
  KA_PID=$(adb shell pidof com.paperclip.app:KeepAlive 2>/dev/null || echo "")
  if [ -n "$KA_PID" ]; then
    echo "✓ [KeepAlive] KeepAliveService is running! PID=$KA_PID"
  fi

  if [ "$OK_PID" = "1" ]; then
    echo "✓ App is running! Waiting for WebView to stabilize..."
    sleep 5
    break
  fi
done

if [ "$OK_PID" = "0" ]; then
  echo "✗ App process did not start within 135 seconds"
fi

echo "=== Diagnostic Inspection of App Internal State ==="
adb shell "run-as com.paperclip.app ls -la /data/data/com.paperclip.app/files/ 2>/dev/null || ls -la /data/data/com.paperclip.app/files/ 2>/dev/null" || true
adb shell "netstat -tuln 2>/dev/null || ss -tulpn 2>/dev/null" || true

echo "=== Full Logcat Output for Paperclip & Crash Logs ==="
adb logcat -d -s PaperclipMain:I PaperclipKA:I chromium:I WebView:E AndroidRuntime:E libc:F DEBUG:F 2>/dev/null | tail -120 || true

# Final verdict
echo ""
echo "=== E2E RESULT ==="
if [ "$OK_PID" = "1" ]; then
  echo "✅ PASS: Paperclip app launched and process is running"
  exit 0
else
  echo "❌ FAIL: App process did not start"
  exit 1
fi
