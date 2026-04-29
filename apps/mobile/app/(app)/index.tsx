import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Session } from '../../types';
import SessionCard from '../../components/SessionCard';

export default function HomeScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchSessions();
  }, []);

  async function fetchSessions() {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) setSessions(data as Session[]);
    setLoading(false);
  }

  async function createSession() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('sessions')
        .insert({ name: newName.trim(), user_id: user.id, status: 'idle' })
        .select()
        .single();

      if (error) throw error;
      setShowNewModal(false);
      setNewName('');
      router.push(`/(app)/session/${data.id}`);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setCreating(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎛 Creative OS</Text>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#FFF" style={{ marginTop: 40 }} />
      ) : sessions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No sessions yet</Text>
          <Text style={styles.emptyText}>Tap + to start recording your first session</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item }) => (
            <SessionCard
              session={item}
              onPress={() => router.push(`/(app)/session/${item.id}`)}
            />
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowNewModal(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={showNewModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Session</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Session name (e.g. Studio w/ Dre)"
              placeholderTextColor="#555"
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setShowNewModal(false); setNewName(''); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCreate} onPress={createSession} disabled={creating}>
                {creating ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.modalCreateText}>Start</Text>
                )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#FFF' },
  signOut: { color: '#555', fontSize: 14 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { color: '#FFF', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: '#555', fontSize: 14, textAlign: 'center' },
  fab: {
    position: 'absolute',
    bottom: 36,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabText: { fontSize: 28, color: '#000', lineHeight: 32 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 48,
  },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  modalInput: {
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: '#1E1E1E',
    borderRadius: 10,
    padding: 16,
    color: '#FFF',
    fontSize: 16,
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  modalCancelText: { color: '#FFF', fontSize: 16 },
  modalCreate: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  modalCreateText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
