module.exports = {
  preset: '@react-native/jest-preset',
  // pnpm keeps packages under node_modules/.pnpm/<name>@<version>/node_modules/<name>; the preset's default pattern
  // stops at the first node_modules/ and leaves React Native's own untranspiled setup files to plain Node.
  transformIgnorePatterns: ['node_modules/(?!(\\.pnpm|(jest-)?react-native|@react-native(-community)?|react-native-[^/]+)/)'],
};
