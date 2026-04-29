import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput, Modal } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { supabase } from '../../../lib/supabase';
import { uploadAudio, getSignedAudioUrl, processClip } from '../../../lib/api';
import { Session, Clip, Stamp } from '../../../types';
import RecordButton from '../../../components/RecordButton';
import ClipCard from '../../../components/ClipCard';

type State = 'idle' | 'recording' | 'uploading' | 'processing' | 'done';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [state, setState] = useState<State>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [showRecap, setShowRecap] = useState(false);
  const [stampNote, setStampNote] = useState('');
  const [showStampModal, setShowStampModal] = useState(false);
  const [pendingStampTime, setPendingStampTime] = useState(0);
  const [stamps, setStamps] = useState<Stamp[]>([]);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchSession();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [id]);

  async function fetchSession() {
    const { data } = await supabase.from('sessions').select('*').eq('id', id).single();
    if (data) setSession(data as Session);
    const { data: clipsData } = await supabase.from('clips').select('*').eq('session_id', id).order('start_time_seconds', { ascending: true });
    if (clipsData) setClips(clipsData as Clip[]);
  }

  async function startRecording() {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) { Alert.alert('Microphone permission needed'); return; }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
    startTimeRef.current = Date.now();
    setState('recording');
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
    await supabase.from('sessions').update({ status: 'recording' }).eq('id', id);
  }

  async function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    setState('uploading');
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) throw new Error('No recording URI');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const duration = elapsed;
      const path = await uploadAudio(user.id, id, uri);
      const signedUrl = await getSignedAudioUrl(path);
      await supabase.from('sessions').update({ audio_url: path, status: 'processing' }).eq('id', id);
      setState('processing');
      const { data: stampsData } = await supabase.from('stamps').select('*').eq('session_id', id).order('timestamp_seconds', { ascending: true });
      const result = await processClip({
        sessionId: id,
        audioUrl: signedUrl,
        stamps: (stampsData ?? []).map((s: any) => ({ timestamp_seconds: s.timestamp_seconds, note: s.note })),
        duration,
      });
      setClips(result.clips ?? []);
      setSession(prev => prev ? { ...prev, recap: result.recap, status: 'done' } : prev);
      setState('done');
    } catch (err: any) {
      Alert.alert('Error', err.message);
      setState('idle');
      await supabase.from('sessions').update({ status: 'idle' }).eq('id', id);
    }
  }

  function openStampModal() {
    setPendingStampTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    setStampNote('');
    setShowStampModal(true);
  }

  async function saveStamp() {
    const { data } = await supabase.from('stamps').insert({ session_id: id, timestamp_seconds: pendingStampTime, note: stampNote || null }).select().single();
    if (data) setStamps(prev => [...prev, data as Stamp]);
    setShowStampModal(false);
  }

  async function updateClipLabel(clipId: string, label: string) {
    await supabase.from('clips').update({ user_label: label }).eq('id', clipId);
    setClips(prev => prev.map(c => c.id === clipId ? { ...c, user_label: label } : c));
  }

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>← Back</Text></TouchableOpacity>
        <Text style={styles.name} numberOfLines={1}>{session?.name ?? '...'}</Text>
        {session?.recap && <TouchableOpacity onPress={() => setShowRecap(true)}><Text style={styles.recapBtn}>Recap</Text></TouchableOpacity>}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 200 }}>
        {state === 'processing' && (
          <View style={styles.processingBanner}>
            <ActivityIndicator color="#FFF" size="small" />
            <Text style={styles.processingText}>AI is analyzing your session...</Text>
          </View>
        )}
        {clips.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Clips ({clips.length})</Text>
            {clips.map(clip => <ClipCard key={clip.id} clip={clip} onEditLabel={updateClipLabel} />)}
          </View>
        ) : (state === 'idle' || state === 'done') ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{state === 'done' ? 'No clips detected' : 'Hit record — everything gets captured and labeled automatically.'}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.controls}>
        {state === 'recording' && (
          <View style={styles.recordingRow}>
            <Text style={styles.timer}>{fmt(elapsed)}</Text>
            <TouchableOpacity style={styles.stampBtn} onPress={openStampModal}>
              <Text style={styles.stampText}>📍 Stamp</Text>
            </TouchableOpacity>
          </View>
        )}
        {(state === 'idle' || state === 'done') && <RecordButton onPress={startRecording} active={false} />}
        {state === 'recording' && <RecordButton onPress={stopRecording} active={true} />}
        {(state === 'uploading' || state === 'processing') && (
          <View style={styles.loadingBtn}>
            <ActivityIndicator color="#FFF" />
            <Text style={styles.loadingText}>{state === 'uploading' ? 'Uploading...' : 'Processing...'}</Text>
          </View>
        )}
      </View>

      <Modal visible={showStampModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Mark Moment — {fmt(pendingStampTime)}</Text>
            <TextInput style={styles.modalInput} placeholder="Quick note (optional)" placeholderTextColor="#555"
              value={stampNote} onChangeText={setStampNote} autoFocus />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancel} onPress={() => setShowStampModal(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.create} onPress={saveStamp}><Text style={styles.createText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showRecap} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { maxHeight: '70%' }]}>
            <Text style={styles.modalTitle}>Session Recap</Text>
            <ScrollView><Text style={styles.recapText}>{session?.recap}</Text></ScrollView>
            <TouchableOpacity style={[styles.create, { marginTop: 16 }]} onPress={() => setShowRecap(false)}>
              <Text style={styles.createText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  back: { color: '#888', fontSize: 16, width: 60 },
  name: { color: '#FFF', fontWeight: '700', fontSize: 18, flex: 1, textAlign: 'center' },
  recapBtn: { color: '#888', fontSize: 14, width: 60, textAlign: 'right' },
  scroll: { flex: 1 },
  section: { padding: 20 },
  sectionTitle: { color: '#555', fontSize: 12, fontWeight: '600', letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyText: { color: '#444', fontSize: 16, textAlign: 'center', lineHeight: 24 },
  processingBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1A1A1A', margin: 20, padding: 16, borderRadius: 12 },
  processingText: { color: '#FFF', fontSize: 14 },
  controls: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingBottom: 40, paddingTop: 16, backgroundColor: '#0A0A0A', borderTopWidth: 1, borderTopColor: '#1A1A1A' },
  recordingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 24 },
  timer: { color: '#FF3B30', fontSize: 22, fontWeight: '700' },
  stampBtn: { backgroundColor: '#1E1E1E', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  stampText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  loadingBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1A1A1A', paddingHorizontal: 28, paddingVertical: 18, borderRadius: 50 },
  loadingText: { color: '#FFF', fontSize: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#141414', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 48 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  modalInput: { backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 10, padding: 16, color: '#FFF', fontSize: 16, marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancel: { flex: 1, backgroundColor: '#1E1E1E', borderRadius: 10, padding: 16, alignItems: 'center' },
  cancelText: { color: '#FFF', fontSize: 16 },
  create: { flex: 1, backgroundColor: '#FFF', borderRadius: 10, padding: 16, alignItems: 'center' },
  createText: { color: '#000', fontWeight: '700', fontSize: 16 },
  recapText: { color: '#CCC', fontSize: 15, lineHeight: 24 },
});
