export type ClipType = 'hook' | 'bars' | 'beat' | 'melody' | 'vocal' | 'convo' | 'idea';

export interface Session {
  id: string;
  user_id: string;
  name: string;
  audio_url: string | null;
  duration_seconds: number | null;
  recap: string | null;
  status: 'idle' | 'recording' | 'processing' | 'done';
  created_at: string;
  updated_at: string;
}

export interface Clip {
  id: string;
  session_id: string;
  type: ClipType | null;
  start_time_seconds: number | null;
  end_time_seconds: number | null;
  transcript: string | null;
  ai_label: string | null;
  user_label: string | null;
  created_at: string;
}

export interface Stamp {
  id: string;
  session_id: string;
  timestamp_seconds: number;
  note: string | null;
}
