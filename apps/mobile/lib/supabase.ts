import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import 'react-native-url-polyfill/auto';

const CHUNK_SIZE = 1900;

const ChunkedSecureStore = {
  getItem: async (key: string): Promise<string | null> => {
    const numChunks = await SecureStore.getItemAsync(`${key}_n`);
    if (!numChunks) return SecureStore.getItemAsync(key);
    const chunks: string[] = [];
    for (let i = 0; i < parseInt(numChunks); i++) {
      const chunk = await SecureStore.getItemAsync(`${key}_${i}`);
      if (chunk) chunks.push(chunk);
    }
    return chunks.join('');
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.deleteItemAsync(`${key}_n`);
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const numChunks = Math.ceil(value.length / CHUNK_SIZE);
    await SecureStore.setItemAsync(`${key}_n`, String(numChunks));
    for (let i = 0; i < numChunks; i++) {
      await SecureStore.setItemAsync(`${key}_${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
  },
  removeItem: async (key: string): Promise<void> => {
    const numChunks = await SecureStore.getItemAsync(`${key}_n`);
    if (numChunks) {
      await SecureStore.deleteItemAsync(`${key}_n`);
      for (let i = 0; i < parseInt(numChunks); i++) {
        await SecureStore.deleteItemAsync(`${key}_${i}`);
      }
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: ChunkedSecureStore as any,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
