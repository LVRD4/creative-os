import { useEffect, useRef } from 'react';
import { TouchableOpacity, StyleSheet, Animated } from 'react-native';

interface Props {
  onPress: () => void;
  active: boolean;
}

export default function RecordButton({ onPress, active }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (active) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.12, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(1);
    }
  }, [active]);

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <TouchableOpacity
        style={[styles.button, active && styles.active]}
        onPress={onPress}
        activeOpacity={0.8}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF3B30',
    borderWidth: 4,
    borderColor: '#3A0000',
  },
  active: {
    backgroundColor: '#FF3B30',
    borderColor: '#FF3B30',
    borderRadius: 14,
  },
});
