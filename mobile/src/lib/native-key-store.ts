import * as Keychain from 'react-native-keychain';

/**
 * Native key store implementation for the uniffi NativeKeyStore callback.
 * Uses react-native-keychain to access iOS Keychain / Android Keystore.
 */
export const nativeKeyStore = {
  async store(key: string, value: string): Promise<void> {
    await Keychain.setGenericPassword(key, value, {
      service: `comet:${key}`,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  async load(key: string): Promise<string | null> {
    const result = await Keychain.getGenericPassword({
      service: `comet:${key}`,
    });
    if (result && typeof result !== 'boolean') {
      return result.password;
    }
    return null;
  },

  async remove(key: string): Promise<void> {
    await Keychain.resetGenericPassword({ service: `comet:${key}` });
  },
};
