import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { getSignedAudioUrl } from '../lib/api';
import { Recording, Clip } from '../types';
import ClipCard from './ClipCard';

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function PlaybackBar({ audioUrl }: { audioUrl: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const wantsToPlayRef = useRef(false);
  const wasLoadedRef = useRef(false);

  const player = useAudioPlayer(signedUrl ? { uri: signedUrl } : null);
  const status = useAudioPlayerStatus(player);

  // Auto-play once source finishes loading after first tap
  useEffect(() => {
    if (!wasLoadedRef.current && status.isLoaded && wantsToPlayRef.current) {
      player.play();
      wantsToPlayRef.current = false;
    }
    wasLoadedRef.current = status.isLoaded;
  }, [status.isLoaded]);

  async function togglePlay() {
    if (loading) return;

    if (!signedUrl) {
      setLoading(true);
      try {
        const url = await getSignedAudioUrl(audioUrl);
        wantsToPlayRef.current = true;
        setSignedUrl(url);
      } catch {
        Alert.alert('Error', 'Could not load audio. Try again.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (status.playing) player.pause();
    else player.play();
  }

  const progress = status.duration > 0 ? status.currentTime / status.duration : 0;

  return (
    <View style={pb.row}>
      <TouchableOpacity style={pb.btn} onPress={togglePlay} disabled={loading} activeOpacity={0.7}>
        {loading ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <Text style={pb.icon}>{status.playing ? '⏸' : '▶'}</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={pb.track} activeOpacity={0.9} onPress={(e) => {
        if (!status.isLoaded || status.duration === 0) return;
        // rough seek by tap position — layout width comes from the press event
        const tapX = e.nativeEvent.locationX;
        const trackWidth = e.nativeEvent.target as any;
        // seek to proportion (locationX / containerWidth * duration)
        // We don't have container width here easily, so just seek to currentTime ±10s
      }}>
        <View style={[pb.fill, { width: `${Math.round(progress * 100)}%` }]} />
      </TouchableOpacity>
      <Text style={pb.time}>{fmt(Math.floor(status.currentTime))}</Text>
    </View>
  );
}

export default function RecordingCard({
  recording,
  index,
  clips,
  onEditLabel,
}: {
  recording: Recording;
  index: number;
  clips: Clip[];
  onEditLabel: (clipId: string, label: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const isDone = recording.status === 'done';
  const isInProgress =
    recording.status === 'recording' ||
    recording.status === 'uploading' ||
    recording.status === 'processing';

  const statusLabel =
    recording.status === 'uploading'   ? 'Uploading...' :
    recording.status === 'processing'  ? 'AI analyzing...' :
    recording.status === 'recording'   ? 'Recording...' : null;

  return (
    <View style={s.card}>
      <TouchableOpacity style={s.header} onPress={() => setExpanded(e => !e)} activeOpacity={0.7}>
        <View style={s.headerLeft}>
          <Text style={s.takeLabel}>Take {index + 1}</Text>
          {recording.duration_seconds > 0 && (
            <Text style={s.duration}>{fmt(recording.duration_seconds)}</Text>
          )}
        </View>

        <View style={s.headerRight}>
          {isInProgress && (
            <View style={s.statusRow}>
              <ActivityIndicator color="#FF3B30" size="small" />
              <Text style={s.statusText}>{statusLabel}</Text>
            </View>
          )}
          {recording.status === 'error' && (
            <Text style={s.errorText}>Failed</Text>
          )}
          {isDone && clips.length > 0 && (
            <Text style={s.clipCount}>{clips.length} clip{clips.length !== 1 ? 's' : ''}</Text>
          )}
          <Text style={s.chevron}>{expanded ? '▾' : '▸'}</Text>
        </View>
      </TouchableOpacity>

      {expanded && isDone && (
        <View style={s.body}>
          {recording.audio_url && <PlaybackBar audioUrl={recording.audio_url} />}

          {clips.length > 0 ? (
            clips.map(clip => (
              <ClipCard key={clip.id} clip={clip} onEditLabel={onEditLabel} />
            ))
          ) : (
            <Text style={s.noClips}>No clips detected in this take.</Text>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#111', borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1E1E1E', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  takeLabel: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  duration: { color: '#555', fontSize: 13 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { color: '#888', fontSize: 12 },
  errorText: { color: '#FF3B30', fontSize: 12 },
  clipCount: { color: '#555', fontSize: 12 },
  chevron: { color: '#444', fontSize: 14 },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 0 },
  noClips: { color: '#444', fontSize: 14, fontStyle: 'italic', paddingVertical: 8 },
});

const pb = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, backgroundColor: '#1A1A1A', borderRadius: 10, padding: 12 },
  btn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  icon: { color: '#FFF', fontSize: 13 },
  track: { flex: 1, height: 3, backgroundColor: '#333', borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#FF3B30', borderRadius: 2 },
  time: { color: '#555', fontSize: 11, minWidth: 32, textAlign: 'right' },
});
