module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // Test modules only: fixtures and frozen handoff copies are not executable suites.
  testMatch: ['<rootDir>/__tests__/**/*.test.[jt]s?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/handoff/', '/.tmp/'],
  modulePathIgnorePatterns: ['<rootDir>/handoff/', '<rootDir>/.tmp/'],
  // Các gói dưới đây phát hành ESM/Flow nên phải cho Babel biên dịch.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|@shopify/flash-list|react-native-screens|react-native-safe-area-context|react-native-nitro-modules)/)',
  ],
};
