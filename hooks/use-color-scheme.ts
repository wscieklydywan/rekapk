/**
 * Permanently enforce the light color scheme across the app.
 *
 * Why:
 * - The product requires a consistent light-only UI (no system dark theme).
 * - We want the same behavior in Expo Go, emulator and production builds.
 *
 * Notes:
 * - This is an intentional, permanent decision for this codebase. To revert
 *   to system-driven behavior later, replace this implementation with
 *   `export { useColorScheme } from 'react-native';` or return a conditional
 *   value based on NODE_ENV.
 * - Keep this file minimal and do not add logic that reads the real device
 *   appearance; the aim is to centralize the override here so changes are easy.
 */
export const useColorScheme = (): 'light' => 'light';

