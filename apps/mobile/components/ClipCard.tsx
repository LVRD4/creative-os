import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Clip, ClipType } from '../types';

const ICONS: Record<ClipType, string> = { hook: '🪝', bars: '🎤', beat: '🥁', melody: '🎵', vocal: '🎙', convo: '💬', idea: '💡' };
const COLORS: Record<ClipType, string> = { hook: '#FF6B35', bars: '#FF3B30', beat: '#5E5CE6', melody: '#30D158', vocal: '#FF375F', convo: '#636366', idea: '#FFD60A' };

const fmt = (s: number | null) => s == null ? '--:--' : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function ClipCard({ clip, onEditLabel }: { clip: Clip; onEditLabel: (id: string, label: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(clip.user_label ?? clip.ai_label ?? '');
  const type = clip.type as ClipType;
  const color = type ? COLORS[type] : '#555';

  function save() { onEditLabel(clip.id, label); setEditing(false); }

  return (
    <View style={styles.card}>
      <View style={[styles.badge, { backgroundColor: color + '22' }]}>
        <Text style={styles.icon}>{type ? ICONS[type] : '🎵'}</Text>
        <Text style={[styles.typeText, { color }]}>{type ?? 'clip'}</Text>
      </View>
      {editing ? (
        <TextInput style={styles.input} value={label} onChangeText={setLabel} onBlur={save} onSubmitEditing={save} autoFocus returnKeyType="done" />
      ) : (
        <TouchableOpacity onPress={() => setEditing(true)}>
          <Text style={styles.label}>{clip.user_label ?? clip.ai_label ?? 'Unlabeled clip'}</Text>
        </TouchableOpacity>
      )}
      <View style={styles.meta}>
        <Text style={styles.metaText}>{fmt(clip.start_time_seconds)} → {fmt(clip.end_time_seconds)}</Text>
        <TouchableOpacity onPress={() => setEditing(true)}><Text style={styles.edit}>Edit</Text></TouchableOpacity>
      </View>
      {clip.transcript && <Text style={styles.transcript} numberOfLines={2}>"{clip.transcript}"</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#141414', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1E1E1E' },
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 10, gap: 4 },
  icon: { fontSize: 13 },
  typeText: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  label: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  input: { color: '#FFF', fontSize: 16, fontWeight: '600', borderBottomWidth: 1, borderBottomColor: '#555', marginBottom: 8, paddingBottom: 4 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { color: '#555', fontSize: 12 },
  edit: { color: '#555', fontSize: 12 },
  transcript: { color: '#444', fontSize: 13, marginTop: 10, fontStyle: 'italic', lineHeight: 18 },
});
