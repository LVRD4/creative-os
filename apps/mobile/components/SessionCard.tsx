import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Session } from '../types';

const STATUS_COLORS: Record<string, string> = { idle: '#333', recording: '#FF3B30', processing: '#FFD60A', done: '#30D158' };

export default function SessionCard({ session, onPress }: { session: Session; onPress: () => void }) {
  const date = new Date(session.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const duration = session.duration_seconds ? `${Math.floor(session.duration_seconds / 60)}m` : null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.row}>
        <Text style={styles.name}>{session.name}</Text>
        <View style={[styles.dot, { backgroundColor: STATUS_COLORS[session.status] ?? '#333' }]} />
      </View>
      <View style={styles.meta}>
        <Text style={styles.date}>{date}</Text>
        {duration && <Text style={styles.duration}>{duration}</Text>}
      </View>
      {session.recap && <Text style={styles.recap} numberOfLines={2}>{session.recap}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#141414', borderRadius: 14, padding: 18, marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderColor: '#1E1E1E' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: '#FFF', fontSize: 17, fontWeight: '700', flex: 1, marginRight: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  meta: { flexDirection: 'row', gap: 12, marginTop: 6 },
  date: { color: '#555', fontSize: 13 },
  duration: { color: '#555', fontSize: 13 },
  recap: { color: '#666', fontSize: 13, marginTop: 10, lineHeight: 18 },
});
