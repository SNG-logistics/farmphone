# KNOWN LIMITATIONS & OPERATIONAL NOTES

**Project:** FARM PHONE AI OFFICE — Autonomous Multi-Device Control Platform  
**Audit Date:** 2026-07-28  

---

## 1. Physical Hardware & ADB Requirements

1. **Android USB / Wireless Debugging:** Physical device automation requires `adb server` to be running on the host machine with authorized Android USB debugging enabled.
2. **Device Serial Matching:** If multiple Android devices are connected simultaneously via USB/Wi-Fi, `ANDROID_DEVICE_SERIAL` environment variable must be specified for target device routing.

---

## 2. MinIO / S3 Storage Connectivity

- Local development and test environments fall back gracefully to dummy/mock URL signatures when MinIO server is offline, preventing unhandled app crashes during offline test execution.

---

## 3. Web Speech API (Browser TTS)

- Voice synthesis in the Short Video Creator Studio uses browser-native Web Speech API (`SpeechSynthesisUtterance`). Voice quality and accent depend on the host operating system's installed Thai TTS voice model.
