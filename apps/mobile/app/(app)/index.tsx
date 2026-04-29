import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Modal, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Session } from '../../types';
import SessionCard from '../../components/SessionCard';

export default function HomeScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { fetchSessions(); }, []);

  async function fetchSessions() {
    const { data } = await supabase.from('sessions').select('*').order('created_at', { ascending: false });
    if (data) setSessions(data as Session[]);
    setLoading(false);
  }

  async function createSession() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from('sessions').insert({ name: newName.trim(), user_id: user.id, status: 'idle' }).select().single();
      if (error) throw error;
      setShowModal(false);
      setNewName('');
      router.push(`/(app)/session/${data.id}`);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎛 Creative OS</Text>
        <TouchableOpacity onPress={() => supabase.auth.signOut()}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator color="#FFF" style={{ marginTop: 40 }} /> :
        sessions.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No sessions yet</Text>
            <Text style={styles.emptyText}>Tap + to start your first session</Text>
          </View>
        ) : (
          <FlatList data={sessions} keyExtractor={s => s.id} contentContainerStyle={{ paddingBottom: 120 }}
            renderItem={({ item }) => <SessionCard session={item} onPress={() => router.push(`/(app)/session/${item.id}`)} />} />
        )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.modalTitle}>New Session</Text>
            <TextInput style={styles.modalInput} placeholder="Session name" placeholderTextColor="#555"
              value={newName} onChangeText={setNewName} autoFocus />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancel} onPress={() => { setShowModal(false); setNewName(''); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.create} onPress={createSession} disabled={creating}>
                {creating ? <ActivityIndicator color="#000" /> : <Text style={styles.createText}>Start</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  title: { fontSize: 22, fontWeight: '800', color: '#FFF' },
  signOut: { color: '#555', fontSize: 14 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { color: '#FFF', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: '#555', fontSize: 14, textAlign: 'center' },
  fab: { position: 'absolute', bottom: 36, right: 24, width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  fabText: { fontSize: 28, color: '#000', lineHeight: 32 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  card: { backgroundColor: '#141414', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 48 },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  modalInput: { backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 10, padding: 16, color: '#FFF', fontSize: 16, marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancel: { flex: 1, backgroundColor: '#1E1E1E', borderRadius: 10, padding: 16, alignItems: 'center' },
  cancelText: { color: '#FFF', fontSize: 16 },
  create: { flex: 1, backgroundColor: '#FFF', borderRadius: 10, padding: 16, alignItems: 'center' },
  createText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
