/** Jest config for the @simula/ads-react-native JS layer. */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  // The source imports the native modules from 'react-native'; mock it.
  moduleNameMapper: {
    "^react-native$": "<rootDir>/src/test/reactNativeMock.ts",
  },
  globals: {
    __DEV__: true,
  },
  // Tests reference custom shapes on the mocked module; relax strict TS checks
  // that fight test ergonomics (the production build runs full strict tsc).
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react-jsx",
        },
        diagnostics: {
          ignoreCodes: [6133, 6196],
        },
      },
    ],
  },
};
