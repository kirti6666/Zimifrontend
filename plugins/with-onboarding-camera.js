const { withAndroidManifest } = require('expo/config-plugins');

// WebView's capture="user" input resolves an external camera activity.
// Android 11+ needs this visibility query. The app also declares CAMERA and
// RECORD_AUDIO for live WebRTC. react-native-webview does not ask for CAMERA on
// capture by itself; patches/react-native-webview+*.patch adds that request.
module.exports = function withOnboardingCamera(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const queries = manifest.queries || (manifest.queries = []);
    const actionName = 'android.media.action.IMAGE_CAPTURE';
    const alreadyVisible = queries.some((query) =>
      (query.intent || []).some((intent) =>
        (intent.action || []).some((action) => action.$?.['android:name'] === actionName)
      )
    );
    if (!alreadyVisible) {
      if (!queries.length) queries.push({});
      const intents = queries[0].intent || (queries[0].intent = []);
      intents.push({ action: [{ $: { 'android:name': actionName } }] });
    }
    return mod;
  });
};
