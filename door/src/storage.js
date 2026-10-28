import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// En el celular: almacenamiento seguro del sistema. En web (solo para pruebas): localStorage.
export async function getItem(key) {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}
export async function setItem(key, value) {
  try {
    if (Platform.OS === 'web') {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    /* sin almacenamiento: la sesión dura lo que dure la app */
  }
}
