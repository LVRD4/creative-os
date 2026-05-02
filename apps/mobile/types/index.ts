export type ClipType = 'hook' | 'bars' | 'verse' | 'melody' | 'beat' | 'idea' | 'convo' | 'adlib';
export type ClipQuality = 'strong' | 'developing' | 'rough';
export type RecordingStatus = 'recording' | 'uploading' | 'processing' | 'done' | 'error';

export interface Session {
  id: string;
  user_id: string;
  name: string;
  recap: string | null;
  status: 'idle' | 'active' | 'done';
  created_at: string;
  updated_at: string;
}

export interface Recording {
  id: string;
  session_id: string;
  user_id: string;
  audio_url: string | null;
  duration_seconds: number;
  transcript: string | null;
  status: RecordingStatus;
  created_at: string;
}

export interface Clip {
  id: string;
  session_id: string;
  recording_id: string;
  type: ClipType | null;
  start_time_seconds: number | null;
  end_time_seconds: number | null;
  transcript: string | null;
  ai_label: string | null;
  user_label: string | null;
  quality: ClipQuality | null;
  complete: boolean;
  created_at: string;
}

export interface Stamp {
  id: string;
  session_id: string;
  recording_id: string;
  timestamp_seconds: number;
  note: string | null;
}
