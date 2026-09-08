module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // Các gói dưới đây phát hành ESM/Flow nên phải cho Babel biên dịch.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|@shopify/flash-list|react-native-screens|react-native-safe-area-context|react-native-nitro-modules)/)',
  ],
};
