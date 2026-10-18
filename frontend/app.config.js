module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    revenuecat: {
      testKey: process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY,
      iosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
      androidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
    },
  },
});