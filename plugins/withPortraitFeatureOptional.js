const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Google Play treats android.hardware.screen.portrait as a REQUIRED hardware
 * feature for this app (it is portrait-only by design), which excludes
 * devices that cannot present a portrait screen (some tablets, desktop /
 * ChromeOS and Android XR devices) from installing it.
 *
 * Declaring the feature explicitly with android:required="false" keeps the
 * app portrait-locked at runtime while making the hardware feature optional
 * for Play Store filtering, so availability expands to those devices.
 * (Play Console quick-check on the 1.0.10 production release, 2026-11-20.)
 */
module.exports = function withPortraitFeatureOptional(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const FEATURE = 'android.hardware.screen.portrait';
    const list = manifest.manifest['uses-feature'] || [];
    const existing = list.find(
      (f) => f.$ && f.$['android:name'] === FEATURE
    );
    if (existing) {
      existing.$['android:required'] = 'false';
    } else {
      list.push({
        $: { 'android:name': FEATURE, 'android:required': 'false' },
      });
      manifest.manifest['uses-feature'] = list;
    }
    return config;
  });
};
