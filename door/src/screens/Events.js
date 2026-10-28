import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { C } from '../theme';
import { api } from '../api';
import { fmtDay, fmtTime } from '../format';

export default function Events({ user, onOpen, onLogout }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setEvents(await api.get('/access/events'));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <View style={s.wrap}>
      <View style={s.top}>
        <View style={{ flex: 1 }}>
          <Text style={s.brand}>ROCKTICKETS · PUERTA</Text>
          <Text style={s.hi}>Hola, {user.name.split(' ')[0]}</Text>
        </View>
        <Pressable onPress={onLogout} accessibilityRole="button" hitSlop={12}><Text style={s.logout}>Salir</Text></Pressable>
      </View>

      <Text style={s.h1}>Tus eventos</Text>
      {!!error && <Text style={s.error}>{error}</Text>}
      {!events && !error && <Text style={s.muted}>Cargando…</Text>}

      <FlatList
        data={events ?? []}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingVertical: 14, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.lamp} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={events ? (
          <View style={s.empty}>
            <Text style={s.emptyT}>No tienes eventos asignados</Text>
            <Text style={s.muted}>Pide a quien administra el evento que te asigne a la puerta. Desliza hacia abajo para actualizar.</Text>
          </View>
        ) : null}
        renderItem={({ item: e }) => {
          const pct = e.expected > 0 ? Math.min(100, (e.entered / e.expected) * 100) : 0;
          return (
            <Pressable onPress={() => onOpen(e)} accessibilityRole="button" style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]} testID={`event-${e.name}`}>
              <Text style={s.date}>{fmtDay(e.startsAt).toUpperCase()} · {fmtTime(e.startsAt)}</Text>
              <Text style={s.name}>{e.name}</Text>
              <Text style={s.venue}>{e.venueName}</Text>
              <View style={s.bar}><View style={[s.fill, { width: `${pct}%` }]} /></View>
              <Text style={s.count}><Text style={{ color: C.ink, fontWeight: '700' }}>{e.entered}</Text> de {e.expected} ingresaron</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 20, paddingTop: 56 },
  top: { flexDirection: 'row', alignItems: 'center' },
  brand: { color: C.lamp, fontWeight: '800', letterSpacing: 2.5, fontSize: 12 },
  hi: { color: C.muted, fontSize: 15, marginTop: 3 },
  logout: { color: C.muted, fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
  h1: { color: C.ink, fontSize: 38, fontWeight: '800', marginTop: 22 },
  muted: { color: C.muted, fontSize: 15, lineHeight: 21, marginTop: 8 },
  error: { color: C.bad, fontSize: 15, marginTop: 10 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, borderRadius: 12, padding: 24, marginTop: 8 },
  emptyT: { color: C.ink, fontSize: 20, fontWeight: '700' },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 18 },
  date: { color: C.lamp, fontWeight: '700', letterSpacing: 1.2, fontSize: 12 },
  name: { color: C.ink, fontSize: 26, fontWeight: '800', marginTop: 4 },
  venue: { color: C.muted, fontSize: 15, marginTop: 2 },
  bar: { height: 6, borderRadius: 3, backgroundColor: C.raised, marginTop: 16, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: C.lamp },
  count: { color: C.muted, fontSize: 14, marginTop: 8 },
});
