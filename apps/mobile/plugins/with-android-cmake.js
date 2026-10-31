/**
 * Points the Android build at a newer CMake by writing `cmake.dir` into android/local.properties on every prebuild.
 * CMake 3.31's ninja (1.12) handles Windows paths over 260 characters; the default 3.22 does not, and React Native's
 * C++ object paths exceed it. Skipped when that CMake version is not installed in the Android SDK.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

module.exports = function withAndroidCmake(config, { version = '3.31.6' } = {}) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
      const cmakeDir = sdk && path.join(sdk, 'cmake', version);
      if (!cmakeDir || !fs.existsSync(cmakeDir)) return modConfig;

      const file = path.join(modConfig.modRequest.platformProjectRoot, 'local.properties');
      const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('cmake.dir=')) : [];
      // .properties format: escape backslashes and colons
      lines.push(`cmake.dir=${cmakeDir.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}`);
      fs.writeFileSync(file, `${lines.join('\n')}\n`);
      return modConfig;
    },
  ]);
};
