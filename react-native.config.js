// Firebase push is Android-only for now: iOS also needs APNs, GoogleService-Info.plist
// and static frameworks (see src/push.ts), so its native modules stay out of iOS builds.
module.exports = {
  dependencies: {
    '@react-native-firebase/app': { platforms: { ios: null } },
    '@react-native-firebase/messaging': { platforms: { ios: null } },
  },
};
