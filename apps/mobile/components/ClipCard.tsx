import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Clip, ClipType } from '../types';

const ICONS: Record<ClipType, string> = {
  hook: '🪝',
  bars: '🎤',
  beat: '🥁',
  melody: '🎵',
  vocal: '🎙',
  convo: '💬',
  idea: '💡',
};

const COLORS: Record<ClipType, string> = {
  hook: '#FF6B35',
  bars: '#FF3B30',
  beat: '#5E5CE6',
  melody: '#30D158',
  vocal: '#FF375F',
  convo: '#636366',
  idea: '#FFD60A',
};

interface Props {
  clip: Clip;
  onEditLabel: (id: string, label: string) => void;
}

export default function ClipCard({ clip, onEditLabel }: Props) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(clip.user_label ?? clip.ai_label ?? '');

  const type = clip.type as ClipType;
  const icon = type ? ICONS[type] : '🎵';
  const color = type ? COLORS[type] : '#555';
  const displayLabel = clip.user_label ?? clip.ai_label ?? 'Unlabeled clip';

  function formatTime(s: number | null) {
    if (s == null) return '--:--';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function saveLabel() {
    onEditLabel(clip.id, label);
    setEditing(false);
  }

  return (
    <View style={styles.card}>
      <View style={[styles.typeBadge, { backgroundColor: color + '22' }]}>
        <Text style={styles.typeIcon}>{icon}</Text>
        <Text style={[styles.typeText, { color }]}>{type ?? 'clip'}</Text>
      </View>

      {editing ? (
        <TextInput
          style={styles.labelInput}
          value={label}
          onChangeText={setLabel}
          onBlur={saveLabel}
          onSubmitEditing={saveLabel}
          autoFocus
          returnKeyType="done"
        />
      ) : (
        <TouchableOpacity onPress={() => setEditing(true)}>
          <Text style={styles.label}>{displayLabel}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.meta}>
        <Text style={styles.metaText}>
          {formatTime(clip.start_time_seconds)} → {formatTime(clip.end_time_seconds)}
        </Text>
        <TouchableOpacity onPress={() => setEditing(true)}>
          <Text style={styles.editBtn}>Edit</Text>
        </TouchableOpacity>
      </View>

      {clip.transcript && (
        <Text style={styles.transcript} numberOfLines={2}>
          "{clip.transcript}"
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#141414',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E1E1E',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 10,
    gap: 4,
  },
  typeIcon: { fontSize: 13 },
  typeText: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  label: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  labelInput: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    borderBottomWidth: 1,
    borderBottomColor: '#555',
    marginBottom: 8,
    paddingBottom: 4,
  },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { color: '#555', fontSize: 12, fontVariant: ['tabular-nums'] },
  editBtn: { color: '#555', fontSize: 12 },
  transcript: { color: '#444', fontSize: 13, marginTop: 10, fontStyle: 'italic', lineHeight: 18 },
});
