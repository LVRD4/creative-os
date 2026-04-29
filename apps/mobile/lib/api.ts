import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL!;

export async function uploadAudio(
  userId: string,
  sessionId: string,
  localUri: string
): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();

  const path = `${userId}/${sessionId}/audio.m4a`;
  const { error } = await supabase.storage.from('audio').upload(path, blob, {
    contentType: 'audio/m4a',
    upsert: true,
  });

  if (error) throw new Error(error.message);
  return path;
}

export async function getSignedAudioUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('audio')
    .createSignedUrl(path, 3600);
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
