import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Clip, ClipType, ClipQuality } from '../types';

const ICONS: Record<ClipType, string> = {
  hook: '🪝', bars: '🎤', verse: '📝', melody: '🎵',
  beat: '🥁', idea: '💡', convo: '💬', adlib: '⚡',
};

const TYPE_COLORS: Record<ClipType, string> = {
  hook: '#FF6B35', bars: '#FF3B30', verse: '#FF375F',
  melody: '#30D158', beat: '#5E5CE6', idea: '#FFD60A',
  convo: '#636366', adlib: '#888',
};

const QUALITY_COLORS: Record<ClipQuality, string> = {
  strong: '#30D158',
  developing: '#FFD60A',
  rough: '#444',
};

const QUALITY_LABELS: Record<ClipQuality, string> = {
  strong: 'Strong',
  developing: 'Developing',
  rough: 'Rough',
};

const fmt = (s: number | null) =>
  s == null ? '--:--' : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function ClipCard({
  clip,
  onEditLabel,
}: {
  clip: Clip;
  onEditLabel: (id: string, label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(clip.user_label ?? clip.ai_label ?? '');

  const type = clip.type as ClipType | null;
  const typeColor = type ? TYPE_COLORS[type] : '#555';
  const quality = clip.quality as ClipQuality | null;

  function save() {
    onEditLabel(clip.id, label);
    setEditing(false);
  }

  return (
    <View style={s.card}>
      <View style={s.topRow}>
        <View style={[s.badge, { backgroundColor: typeColor + '22' }]}>
          <Text style={s.icon}>{type ? ICONS[type] : '🎵'}</Text>
          <Text style={[s.typeText, { color: typeColor }]}>{type ?? 'clip'}</Text>
        </View>

        <View style={s.badgeRow}>
          {quality && (
            <View style={[s.qualityBadge, { borderColor: QUALITY_COLORS[quality] + '66' }]}>
              <Text style={[s.qualityText, { color: QUALITY_COLORS[quality] }]}>
                {QUALITY_LABELS[quality]}
              </Text>
            </View>
          )}
          {clip.complete === false && (
            <View style={s.incompleteBadge}>
              <Text style={s.incompleteText}>Incomplete</Text>
            </View>
          )}
        </View>
      </View>

      {editing ? (
        <TextInput
          style={s.input}
          value={label}
          onChangeText={setLabel}
          onBlur={save}
          onSubmitEditing={save}
          autoFocus
          returnKeyType="done"
        />
      ) : (
        <TouchableOpacity onPress={() => setEditing(true)}>
          <Text style={s.label}>{clip.user_label ?? clip.ai_label ?? 'Unlabeled clip'}</Text>
        </TouchableOpacity>
      )}

      <View style={s.meta}>
        <Text style={s.metaText}>{fmt(clip.start_time_seconds)} → {fmt(clip.end_time_seconds)}</Text>
        <TouchableOpacity onPress={() => setEditing(true)}>
          <Text style={s.edit}>Rename</Text>
        </TouchableOpacity>
      </View>

      {clip.transcript && (
        <Text style={s.transcript} numberOfLines={2}>"{clip.transcript}"</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#141414', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#1E1E1E' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, gap: 4 },
  icon: { fontSize: 12 },
  typeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  badgeRow: { flexDirection: 'row', gap: 6 },
  qualityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  qualityText: { fontSize: 11, fontWeight: '600' },
  incompleteBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: '#1E1E1E' },
  incompleteText: { color: '#555', fontSize: 11 },
  label: { color: '#FFF', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  input: { color: '#FFF', fontSize: 16, fontWeight: '600', borderBottomWidth: 1, borderBottomColor: '#555', marginBottom: 8, paddingBottom: 4 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { color: '#555', fontSize: 12 },
  edit: { color: '#555', fontSize: 12 },
  transcript: { color: '#444', fontSize: 13, marginTop: 10, fontStyle: 'italic', lineHeight: 18 },
});
