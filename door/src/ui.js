import { Pressable, Text, StyleSheet } from 'react-native';
import { C } from './theme';

export function Btn({ title, onPress, kind = 'primary', disabled, style }) {
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        primary ? s.primary : s.quiet,
        pressed && { opacity: 0.85 },
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      <Text style={[s.btnText, primary ? { color: C.lampInk } : { color: C.ink }]}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { minHeight: 52, borderRadius: 8, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: C.lamp },
  quiet: { backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  btnText: { fontSize: 16, fontWeight: '700' },
});
