#!/usr/bin/env node

/**
 * Boots an Android emulator (AVD) so `npm run android` has a device to install on.
 * Uses ANDROID_AVD if set, otherwise the first AVD found. Works on Windows, macOS and Linux.
 */

const { execFileSync, spawn } = require("child_process");
const os = require("os");
const path = require("path");

const defaultSdk = {
  win32: path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk"),
  darwin: path.join(os.homedir(), "Library", "Android", "sdk"),
}[process.platform] || path.join(os.homedir(), "Android", "Sdk");
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || defaultSdk;
const emulator = path.join(sdk, "emulator", process.platform === "win32" ? "emulator.exe" : "emulator");

let avds;
try {
  avds = execFileSync(emulator, ["-list-avds"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
} catch {
  console.error(`Android emulator not found at ${emulator}. Install it in Android Studio > SDK Manager, or set ANDROID_HOME.`);
  process.exit(1);
}

const avd = process.env.ANDROID_AVD || avds[0];
if (!avd || !avds.includes(avd)) {
  console.error(`No AVD named "${avd || ""}". Available: ${avds.join(", ") || "none (create one in Android Studio > Device Manager)"}`);
  process.exit(1);
}

console.log(`Starting emulator ${avd}…`);
spawn(emulator, ["-avd", avd], { stdio: "inherit" }).on("exit", (code) => process.exit(code ?? 0));