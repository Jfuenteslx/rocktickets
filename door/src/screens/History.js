import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '../theme';
import { api } from '../api';
import { fmtTime } from '../format';

const LABEL = {
  ADMITIDO: { text: 'Admitida', color: C.ok },
  RECHAZADO_YA_USADO: { text: 'Ya usada', color: C.bad },
  RECHAZADO_INVALIDO: { text: 'Rechazada', color: C.bad },
};

export default function History({ event, onBack }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/access/events/${event.id}/history?limit=100`).then(setRows).catch((e) => setError(e.message));
  }, [event.id]);

  return (
    <View style={s.wrap}>
      <Pressable onPress={onBack} accessibilityRole="button" hitSlop={12}><Text style={s.back}>← Volver al escáner</Text></Pressable>
      <Text style={s.h1}>Mis escaneos</Text>
      <Text style={s.sub}>{event.name}</Text>
      {!!error && <Text style={s.error}>{error}</Text>}
      {!rows && !error && <Text style={s.sub}>Cargando…</Text>}
      <FlatList
        data={rows ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingVertical: 12 }}
        ListEmptyComponent={rows ? <Text style={s.sub}>Todavía no escaneaste nada en este evento.</Text> : null}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: C.line }} />}
        renderItem={({ item: r }) => {
          const l = LABEL[r.result] ?? { text: r.result, color: C.muted };
          return (
            <View style={s.row}>
              <View style={[s.dot, { backgroundColor: l.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.code}>{r.shortCode} <Text style={[s.state, { color: l.color }]}>{l.text}</Text>{r.method === 'MANUAL' ? <Text style={s.state}>  · manual</Text> : null}{r.method === 'OFFLINE' ? <Text style={s.state}>  · sin conexión</Text> : null}</Text>
                <Text style={s.meta} numberOfLines={1}>{[r.holder, r.tierName, r.sectorName].filter(Boolean).join(' · ')}</Text>
              </View>
              <Text style={s.time}>{fmtTime(r.scannedAt)}</Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 20, paddingTop: 56 },
  back: { color: C.muted, fontSize: 15, fontWeight: '600' },
  h1: { color: C.ink, fontSize: 36, fontWeight: '800', marginTop: 16 },
  sub: { color: C.muted, fontSize: 15, marginTop: 4 },
  error: { color: C.bad, marginTop: 10, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  code: { color: C.ink, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  state: { fontSize: 13, fontWeight: '700' },
  meta: { color: C.muted, fontSize: 14, marginTop: 2 },
  time: { color: C.muted, fontSize: 15, fontVariant: ['tabular-nums'] },
});
