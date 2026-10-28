import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C } from '../theme';
import { Btn } from '../ui';
import { api } from '../api';
import { describeScan } from '../scanResult';
import ResultOverlay from '../ResultOverlay';
import { signal } from '../feedback';

// Plan B de puerta: QR dañado, pantalla rota, "perdí mi entrada". Se busca por nombre o código
// y se admite a mano. Cada admisión manual queda marcada como MANUAL en el servidor.
export default function Search({ event, deviceId, onBack }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const run = useCallback(async (text) => {
    const my = ++seq.current;
    setLoading(true); setError('');
    try {
      const r = await api.get(`/access/events/${event.id}/search?q=${encodeURIComponent(text.trim())}`);
      if (my === seq.current) { setRows(r); setSelected(null); }
    } catch (e) {
      if (my === seq.current) { setRows(null); setError(e.message); }
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [event.id]);

  // Busca sola mientras escribe (con una pausa corta para no saturar al servidor)
  useEffect(() => {
    if (q.trim().length < 2) { seq.current++; setRows(null); setError(''); setLoading(false); return undefined; }
    const id = setTimeout(() => run(q), 350);
    return () => clearTimeout(id);
  }, [q, run]);

  async function admit(row) {
    if (busy) return;
    setBusy(true);
    let res;
    try {
      res = await api.post('/tickets/scan', { ticketId: row.id, deviceId, eventId: event.id, manual: true });
    } catch (e) {
      res = { neterr: true, message: e.message };
    }
    const v = describeScan(res);
    signal(v.tone);
    setView(v);
    setBusy(false);
    if (!res.neterr) run(q);
  }

  return (
    <View style={s.wrap}>
      <Pressable onPress={onBack} accessibilityRole="button" hitSlop={12}><Text style={s.back}>← Volver al escáner</Text></Pressable>
      <Text style={s.h1}>Buscar entrada</Text>
      <Text style={s.sub}>{event.name}</Text>
      <TextInput
        style={s.input} value={q} onChangeText={setQ} placeholder="Nombre o código de la entrada"
        placeholderTextColor={C.muted} autoCapitalize="none" autoCorrect={false} autoFocus testID="q"
      />
      {!!error && <Text style={s.error}>{error}</Text>}
      {q.trim().length < 2 && <Text style={s.hint}>Escribe al menos 2 letras. Revisa siempre el documento de la persona antes de admitir.</Text>}
      {loading && <Text style={s.hint}>Buscando…</Text>}
      {rows && !loading && rows.length === 0 && <Text style={s.hint}>No hay entradas vigentes con ese nombre o código.</Text>}
      <FlatList
        data={rows ?? []}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingVertical: 10 }}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: C.line }} />}
        renderItem={({ item: r }) => {
          const used = r.status === 'UTILIZADO';
          const open = selected === r.id;
          return (
            <Pressable onPress={() => !used && setSelected(open ? null : r.id)} style={s.row} testID={`row-${r.shortCode}`}>
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{r.holder ?? '(sin nombre)'}</Text>
                <Text style={s.meta} numberOfLines={1}>
                  {[r.shortCode, r.kind === 'CORTESIA' ? 'Cortesía' : null, r.tierName, r.sectorName].filter(Boolean).join(' · ')}
                </Text>
                {open && (
                  <View style={s.confirm}>
                    <Text style={s.confirmT}>¿Admitir a {r.holder ?? 'esta persona'}?</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Btn title="Admitir" onPress={() => admit(r)} disabled={busy} style={{ flex: 1 }} />
                      <Btn title="Cancelar" kind="quiet" onPress={() => setSelected(null)} style={{ flex: 1 }} />
                    </View>
                  </View>
                )}
              </View>
              <Text style={[s.badge, { color: used ? C.muted : C.ok }]}>{used ? 'Ya ingresó' : 'Válida'}</Text>
            </Pressable>
          );
        }}
      />
      {view && <ResultOverlay view={view} onDismiss={() => setView(null)} />}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 20, paddingTop: 56 },
  back: { color: C.muted, fontSize: 15, fontWeight: '600' },
  h1: { color: C.ink, fontSize: 36, fontWeight: '800', marginTop: 16 },
  sub: { color: C.muted, fontSize: 15, marginTop: 4, marginBottom: 14 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 8, color: C.ink, paddingHorizontal: 14, height: 52, fontSize: 17 },
  error: { color: C.bad, marginTop: 10, fontSize: 15 },
  hint: { color: C.muted, marginTop: 12, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  name: { color: C.ink, fontSize: 18, fontWeight: '700' },
  meta: { color: C.muted, fontSize: 14, marginTop: 2 },
  badge: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  confirm: { marginTop: 12, gap: 10, backgroundColor: C.raised, borderRadius: 10, padding: 12 },
  confirmT: { color: C.ink, fontSize: 16, fontWeight: '700' },
});
