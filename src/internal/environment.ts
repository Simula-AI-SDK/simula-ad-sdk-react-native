/** Safe in Metro, React Native Web, SSR, and test environments. */
export const IS_DEVELOPMENT =
  typeof __DEV__ !== "undefined" && __DEV__;
