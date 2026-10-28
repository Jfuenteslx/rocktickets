import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from './theme';

const TONES = {
  ok: { bg: C.ok, fg: '#04140C' },
  bad: { bg: C.bad, fg: '#1E0605' },
  warn: { bg: C.warn, fg: '#241503' },
};

// Pantalla completa con el resultado. Las admitidas pasan solas; los rechazos esperan un toque.
export default function ResultOverlay({ view, onDismiss }) {
  const t = TONES[view.tone];
  useEffect(() => {
    if (view.sticky) return undefined;
    const id = setTimeout(onDismiss, 1800);
    return () => clearTimeout(id);
  }, [view, onDismiss]);

  return (
    <Pressable onPress={onDismiss} style={[StyleSheet.absoluteFill, s.overlay, { backgroundColor: t.bg }]} accessibilityRole="alert" testID="result">
      <Text style={[s.glyph, { color: t.fg }]}>{view.glyph}</Text>
      <Text style={[s.title, { color: t.fg }]} testID="result-title">{view.title}</Text>
      {!!view.sub && <Text style={[s.sub, { color: t.fg }]}>{view.sub}</Text>}
      <View style={{ marginTop: 22, alignItems: 'center', gap: 4 }}>
        {view.lines.map((l, i) => (
          <Text key={i} style={[i === 0 ? s.line1 : s.line, { color: t.fg }]}>{l}</Text>
        ))}
      </View>
      {!!view.group && (
        <View style={[s.group, { borderColor: t.fg }]}>
          <Text style={[s.groupT, { color: t.fg }]}>{view.group}</Text>
        </View>
      )}
      <Text style={[s.tap, { color: t.fg }]}>{view.sticky ? 'Toca para continuar' : ''}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'center', padding: 28 },
  glyph: { fontSize: 120, fontWeight: '800', lineHeight: 130 },
  title: { fontSize: 46, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  sub: { fontSize: 20, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  line1: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  line: { fontSize: 18, fontWeight: '600', textAlign: 'center', opacity: 0.85 },
  group: { marginTop: 22, borderWidth: 2, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, opacity: 0.9 },
  groupT: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  tap: { position: 'absolute', bottom: 48, fontSize: 15, fontWeight: '700', opacity: 0.8 },
});
