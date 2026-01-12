import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'ui_animations_enabled_v1';
let listeners = new Set<(v: boolean) => void>();

export const getAnimationsEnabled = async (): Promise<boolean> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return true;
    return raw === '1';
  } catch (e) {
    return true;
  }
};

export const setAnimationsEnabled = async (v: boolean) => {
  try {
    await AsyncStorage.setItem(KEY, v ? '1' : '0');
  } catch (e) {}
  for (const cb of listeners) cb(v);
};

export const addAnimationListener = (cb: (v: boolean) => void) => {
  listeners.add(cb);
};

export const removeAnimationListener = (cb: (v: boolean) => void) => {
  listeners.delete(cb);
};

export default { getAnimationsEnabled, setAnimationsEnabled, addAnimationListener, removeAnimationListener };