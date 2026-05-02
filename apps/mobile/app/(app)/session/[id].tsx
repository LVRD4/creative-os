import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import {
  useAudioRecorder, RecordingPresets,
  requestRecordingPermissionsAsync, setAudioModeAsync,
} from 'expo-audio';
import { supabase } from '../../../lib/supabase';
import { createRecording, uploadAudio, getSignedAudioUrl, processClip } from '../../../lib/api';
import { Session, Recording, Clip, Stamp } from '../../../types';
import RecordButton from '../../../components/RecordButton';
import RecordingCard from '../../../components/RecordingCard';

type RecordState = 'idle' | 'recording' | 'uploading' | 'processing';

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [session, setSession] = useState<Session | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [clipsByRecording, setClipsByRecording] = useState<Record<string, Clip[]>>({});

  const [recordState, setRecordState] = useState<RecordState>('idle');
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const [showStampModal, setShowStampModal] = useState(false);
  const [pendingStampTime, setPendingStampTime] = useState(0);
  const [stampNote, setStampNote] = useState('');

  const [showRecap, setShowRecap] = useState(false);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchSession();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [id]);

  async function fetchSession() {
    const { data: sessionData } = await supabase
      .from('sessions').select('*').eq('id', id).single();
    if (sessionData) setSession(sessionData as Session);

    const { data: recData } = await supabase
      .from('recordings').select('*').eq('session_id', id)
      .order('created_at', { ascending: true });

    const { data: clipsData } = await supabase
      .from('clips').select('*').eq('session_id', id)
      .order('start_time_seconds', { ascending: true });

    if (recData) setRecordings(recData as Recording[]);

    if (clipsData) {
      const grouped: Record<string, Clip[]> = {};
      for (const clip of clipsData as Clip[]) {
        if (!grouped[clip.recording_id]) grouped[clip.recording_id] = [];
        grouped[clip.recording_id].push(clip);
      }
      setClipsByRecording(grouped);
    }
  }

  async function startRecording() {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) { Alert.alert('Microphone permission needed'); return; }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create the recording row first so stamps can reference its ID
      const recordingId = await createRecording(id, user.id);
      setCurrentRecordingId(recordingId);

      // Add a placeholder to the list so the UI shows immediately
      const placeholder: Recording = {
        id: recordingId,
        session_id: id,
        user_id: user.id,
        audio_url: null,
        duration_seconds: 0,
        transcript: null,
        status: 'recording',
        created_at: new Date().toISOString(),
      };
      setRecordings(prev => [...prev, placeholder]);

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();

      startTimeRef.current = Date.now();
      setElapsed(0);
      setRecordState('recording');
      timerRef.current = setInterval(
        () => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)),
        1000
      );
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }

  async function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    const recordingId = currentRecordingId!;
    const duration = elapsed;

    setRecordState('uploading');
    setRecordings(prev =>
      prev.map(r => r.id === recordingId ? { ...r, status: 'uploading', duration_seconds: duration } : r)
    );

    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) throw new Error('No recording URI');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const path = await uploadAudio(user.id, id, recordingId, uri);
      const signedUrl = await getSignedAudioUrl(path);

      setRecordings(prev =>
        prev.map(r => r.id === recordingId ? { ...r, audio_url: path, status: 'processing' } : r)
      );
      setRecordState('processing');

      // Fetch stamps saved during this recording
      const { data: stampsData } = await supabase
        .from('stamps').select('*').eq('recording_id', recordingId)
        .order('timestamp_seconds', { ascending: true });

      const result = await processClip({
        sessionId: id,
        recordingId,
        audioUrl: signedUrl,
        stamps: (stampsData ?? []).map((s: any) => ({ timestamp_seconds: s.timestamp_seconds, note: s.note })),
        duration,
      });

      setClipsByRecording(prev => ({ ...prev, [recordingId]: result.clips ?? [] }));
      setRecordings(prev =>
        prev.map(r => r.id === recordingId ? { ...r, status: 'done' } : r)
      );
      setSession(prev => prev ? { ...prev, recap: result.recap } : prev);
      setRecordState('idle');
      setCurrentRecordingId(null);

    } catch (err: any) {
      Alert.alert('Error', err.message);
      setRecordState('idle');
      setCurrentRecordingId(null);
      setRecordings(prev =>
        prev.map(r => r.id === recordingId ? { ...r, status: 'error' } : r)
      );
      await supabase.from('recordings').update({ status: 'error' }).eq('id', recordingId);
    }
  }

  function openStampModal() {
    setPendingStampTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    setStampNote('');
    setShowStampModal(true);
  }

  async function saveStamp() {
    if (!currentRecordingId) return;
    await supabase.from('stamps').insert({
      session_id: id,
      recording_id: currentRecordingId,
      timestamp_seconds: pendingStampTime,
      note: stampNote || null,
    });
    setShowStampModal(false);
  }

  async function updateClipLabel(clipId: string, label: string) {
    await supabase.from('clips').update({ user_label: label }).eq('id', clipId);
    setClipsByRecording(prev => {
      const next = { ...prev };
      for (const recId of Object.keys(next)) {
        next[recId] = next[recId].map(c => c.id === clipId ? { ...c, user_label: label } : c);
      }
      return next;
    });
  }

  const isActive = recordState !== 'idle';
  const totalClips = Object.values(clipsByRecording).flat().length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.name} numberOfLines={1}>{session?.name ?? '...'}</Text>
        {session?.recap ? (
          <TouchableOpacity onPress={() => setShowRecap(true)}>
            <Text style={styles.recapBtn}>Recap</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 50 }} />
        )}
      </View>

      {/* Content */}
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 200, padding: 20 }}>
        {recordings.length === 0 && recordState === 'idle' && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ready to record</Text>
            <Text style={styles.emptyBody}>
              Hit the button below and let it run. Every take gets its own card — you can record as many times as you want in one session.
            </Text>
          </View>
        )}

        {recordings.map((rec, i) => (
          <RecordingCard
            key={rec.id}
            recording={rec}
            index={i}
            clips={clipsByRecording[rec.id] ?? []}
            onEditLabel={updateClipLabel}
          />
        ))}
      </ScrollView>

      {/* Controls */}
      <View style={styles.controls}>
        {recordState === 'recording' && (
          <View style={styles.recordingRow}>
            <View style={styles.timerBadge}>
              <View style={styles.recDot} />
              <Text style={styles.timer}>{fmt(elapsed)}</Text>
            </View>
            <TouchableOpacity style={styles.stampBtn} onPress={openStampModal}>
              <Text style={styles.stampText}>📍 Stamp</Text>
            </TouchableOpacity>
          </View>
        )}

        {recordState === 'idle' && (
          <RecordButton onPress={startRecording} active={false} />
        )}
        {recordState === 'recording' && (
          <RecordButton onPress={stopRecording} active={true} />
        )}
        {(recordState === 'uploading' || recordState === 'processing') && (
          <View style={styles.loadingBtn}>
            <ActivityIndicator color="#FFF" />
            <Text style={styles.loadingText}>
              {recordState === 'uploading' ? 'Uploading...' : 'AI analyzing...'}
            </Text>
          </View>
        )}

        {recordings.length > 0 && totalClips > 0 && (
          <Text style={styles.totalClips}>{totalClips} total clip{totalClips !== 1 ? 's' : ''} this session</Text>
        )}
      </View>

      {/* Stamp Modal */}
      <Modal visible={showStampModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Mark Moment — {fmt(pendingStampTime)}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Quick note (optional)"
              placeholderTextColor="#555"
              value={stampNote}
              onChangeText={setStampNote}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowStampModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveStamp}>
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Recap Modal */}
      <Modal visible={showRecap} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { maxHeight: '75%' }]}>
            <Text style={styles.modalTitle}>Session Recap</Text>
            <ScrollView style={{ marginBottom: 16 }}>
              <Text style={styles.recapText}>{session?.recap}</Text>
            </ScrollView>
            <TouchableOpacity style={styles.saveBtn} onPress={() => setShowRecap(false)}>
              <Text style={styles.saveText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: '#1A1A1A',
  },
  back: { color: '#888', fontSize: 16, width: 60 },
  name: { color: '#FFF', fontWeight: '700', fontSize: 18, flex: 1, textAlign: 'center' },
  recapBtn: { color: '#888', fontSize: 14, width: 50, textAlign: 'right' },

  scroll: { flex: 1 },

  empty: { paddingTop: 60, alignItems: 'center', gap: 12 },
  emptyTitle: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  emptyBody: { color: '#444', fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 280 },

  controls: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    alignItems: 'center', paddingBottom: 44, paddingTop: 16,
    backgroundColor: '#0A0A0A', borderTopWidth: 1, borderTopColor: '#1A1A1A', gap: 12,
  },
  recordingRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  timerBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30' },
  timer: { color: '#FF3B30', fontSize: 22, fontWeight: '700' },
  stampBtn: { backgroundColor: '#1E1E1E', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  stampText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  loadingBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1A1A1A', paddingHorizontal: 28, paddingVertical: 18, borderRadius: 50,
  },
  loadingText: { color: '#FFF', fontSize: 16 },
  totalClips: { color: '#333', fontSize: 12 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#141414', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 48 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  modalInput: {
    backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: '#1E1E1E',
    borderRadius: 10, padding: 16, color: '#FFF', fontSize: 16, marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, backgroundColor: '#1E1E1E', borderRadius: 10, padding: 16, alignItems: 'center' },
  cancelText: { color: '#FFF', fontSize: 16 },
  saveBtn: { flex: 1, backgroundColor: '#FFF', borderRadius: 10, padding: 16, alignItems: 'center' },
  saveText: { color: '#000', fontWeight: '700', fontSize: 16 },
  recapText: { color: '#CCC', fontSize: 15, lineHeight: 24 },
});
