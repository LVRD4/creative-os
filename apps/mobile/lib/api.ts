import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL!;

export async function uploadAudio(userId: string, sessionId: string, localUri: string): Promise<string> {
  // Verify file exists and has content
  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) throw new Error('Recording file not found');
  if ('size' in info && info.size === 0) throw new Error('Recording file is empty');

  // Read as base64 for reliable binary transfer
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Decode base64 → Uint8Array
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const path = `${userId}/${sessionId}/audio.m4a`;
  const { error } = await supabase.storage.from('audio').upload(path, bytes, {
    contentType: 'audio/mp4',
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function getSignedAudioUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('audio').createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function processClip(payload: {
  sessionId: string;
  audioUrl: string;
  stamps: { timestamp_seconds: number; note: string | null }[];
  duration: number;
}) {
  const res = await fetch(`${API_URL}/api/process-clip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? 'Processing failed');
  }
  return res.json();
}
