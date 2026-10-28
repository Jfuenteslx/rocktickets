import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import { io } from 'socket.io-client';
import { C } from '../theme';
import { Btn } from '../ui';
import { api, getBase } from '../api';
import { UUID_RE, fmtTime } from '../format';
import { describeScan } from '../scanResult';
import ResultOverlay from '../ResultOverlay';
import { initFeedback, setMuted, signal } from '../feedback';
import {
  admitOffline, clearConflicts, downloadManifest, getConflicts, loadManifest, lookup, manifestInfo, markUsed, subscribe, syncNow,
} from '../offline';

const ZOOMS = [{ v: 0, label: '1×' }, { v: 0.12, label: '2×' }, { v: 0.25, label: '3×' }];

export default function Scan({ event, deviceId, onBack, onHistory, onSearch }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [sound, setSound] = useState(true);
  const [counts, setCounts] = useState({ entered: event.entered, expected: event.expected });
  const [view, setView] = useState(null);
  const [manual, setManual] = useState('');
  const [online, setOnline] = useState(true);
  const [ostatus, setOstatus] = useState({ pending: 0, conflicts: 0, syncing: false });
  const [conflictView, setConflictView] = useState(null);
  const busy = useRef(false);
  const last = useRef({ code: '', at: 0 });
  useKeepAwake();

  useEffect(() => { initFeedback().then((m) => setSound(!m)); }, []);
  const toggleSound = () => { setMuted(sound); setSound(!sound); }; // sound=true → se silencia

  const refresh = useCallback(async () => {
    try {
      const e = await api.get(`/access/events/${event.id}`, { timeout: 5000 });
      setCounts({ entered: e.entered, expected: e.expected });
      setOnline(true);
      syncNow(); // hay red: aprovecha para enviar lo que se admitió sin conexión
    } catch (e) {
      if (e.status === 0) setOnline(false); // el contador se corrige en el próximo intento
    }
  }, [event.id]);
  useEffect(() => { refresh(); }, [refresh]); // al volver de Buscar/Historial el total ya cambió
  useEffect(() => { const id = setInterval(refresh, 20000); return () => clearInterval(id); }, [refresh]); // latido: detecta que volvió (o se fue) la red

  // Modo sin conexión: lista de entradas en el celular + avisos de la cola
  useEffect(() => subscribe(setOstatus), []);
  useEffect(() => {
    const pull = () => downloadManifest(event.id).catch(() => {}); // sin red se queda con la lista que ya tiene
    loadManifest(event.id).finally(pull);
    const id = setInterval(pull, 180000);
    return () => clearInterval(id);
  }, [event.id]);
  const seenConflicts = useRef(0);
  useEffect(() => {
    if (ostatus.conflicts > seenConflicts.current) signal('bad');
    seenConflicts.current = ostatus.conflicts;
  }, [ostatus.conflicts]);

  // Contador en vivo: cuando cualquier celular admite una entrada, el servidor avisa y se relee el total
  useEffect(() => {
    let timer;
    const bump = () => { clearTimeout(timer); timer = setTimeout(refresh, 250); };
    const socket = io(getBase(), { auth: { token: api.token }, transports: ['websocket'], reconnectionDelay: 1000 });
    socket.on('connect', () => { socket.emit('join-event', { eventId: event.id }); refresh(); });
    socket.on('ticket:validated', (p) => { markUsed(event.id, p?.ticketId, p?.scannedAt); bump(); });
    return () => { clearTimeout(timer); socket.close(); };
  }, [event.id, refresh]);

  const dismiss = useCallback(() => {
    setView(null);
    last.current.at = Date.now(); // la cámara sigue apuntando al mismo QR: se ignora unos segundos
    busy.current = false;
  }, []);

  const scanOffline = useCallback(async (code) => {
    const id = code.toLowerCase();
    if (!manifestInfo(event.id)) return { neterr: true, nolist: true };
    const e = lookup(event.id, id);
    if (!e) return { offlineUnknown: true };
    const detail = { holder: e.h, tierName: e.t, sectorName: e.x, kind: e.k === 'C' ? 'CORTESIA' : 'VENTA', firstScannedAt: e.u, party: null };
    const ticket = { shortCode: e.c };
    if (e.s === 'V') {
      await admitOffline(event.id, id, e);
      setCounts((c) => ({ ...c, entered: c.entered + 1 }));
      return { result: 'ADMITIDO', reason: null, ticket, detail, offline: true };
    }
    if (e.s === 'U') return { result: 'RECHAZADO_YA_USADO', reason: 'YA_USADO', ticket, detail, offline: true };
    return { result: 'RECHAZADO_INVALIDO', reason: 'ANULADO', ticket, detail, offline: true };
  }, [event.id]);

  const submit = useCallback(async (raw) => {
    const code = String(raw ?? '').trim();
    if (!code || busy.current) return;
    if (code === last.current.code && Date.now() - last.current.at < 4000) return;
    busy.current = true;
    last.current = { code, at: Date.now() };

    let res;
    if (!UUID_RE.test(code)) {
      res = { result: 'RECHAZADO_INVALIDO', reason: 'NO_EXISTE', message: 'Este QR no es una entrada de Rocktickets', ticket: null, detail: null };
    } else {
      try {
        res = await api.post('/tickets/scan', { ticketId: code, deviceId, eventId: event.id }, { timeout: 4000 });
        setOnline(true);
      } catch (e) {
        if (e.status === 0) {
          setOnline(false);
          res = await scanOffline(code); // sin red: se valida con la lista del celular
        } else {
          res = { neterr: true, message: e.message };
        }
        if (res.neterr || res.offlineUnknown) last.current.code = ''; // no se consumió: se puede reintentar enseguida
      }
    }
    const v = describeScan(res);
    signal(v.tone);
    setView(v);
    if (!res.neterr) refresh();
  }, [deviceId, event.id, refresh, scanOffline]);

  const info = manifestInfo(event.id);
  const showConflicts = () => {
    const list = getConflicts();
    const lines = list.slice(0, 5).map((c) => {
      const who = `${c.holder ?? 'Sin nombre'} (${c.shortCode ?? '—'})`;
      return c.kind === 'DOBLE'
        ? `${who} · ya había ingresado${c.firstScannedAt ? ` a las ${fmtTime(c.firstScannedAt)}` : ''}`
        : `${who} · ${c.reason ?? 'rechazada por el servidor'}`;
    });
    if (list.length > 5) lines.push(`y ${list.length - 5} más`);
    setConflictView({ tone: 'bad', glyph: '!', title: 'REVISAR INGRESOS', sub: 'Se admitieron sin conexión y el servidor los marcó distinto', lines, sticky: true });
  };
  let banner = null;
  if (ostatus.conflicts > 0) {
    banner = { text: `⚠ ${ostatus.conflicts} ingreso(s) para revisar — toca para ver`, bg: C.bad, fg: '#1E0605', onPress: showConflicts };
  } else if (!online) {
    banner = info
      ? { text: `Sin conexión · lista de las ${fmtTime(info.generatedAt)}${ostatus.pending ? ` · ${ostatus.pending} por enviar` : ''}`, bg: C.warn, fg: '#241503' }
      : { text: 'Sin conexión y sin lista descargada', bg: C.bad, fg: '#1E0605' };
  } else if (ostatus.pending > 0) {
    banner = { text: `Enviando ${ostatus.pending} ingreso(s) guardados…`, bg: C.raised, fg: C.ink };
  }

  const pct = counts.expected > 0 ? Math.min(100, (counts.entered / counts.expected) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          zoom={ZOOMS[zoomIdx].v}
          autofocus="on"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={view ? undefined : (r) => submit(r.data)}
        />
      ) : (
        <View style={s.permWrap}>
          <Text style={s.permT}>Necesitamos la cámara</Text>
          <Text style={s.permP}>Se usa solo para leer el QR de las entradas.</Text>
          {permission && !permission.granted && (
            <Btn
              title={permission.canAskAgain ? 'Permitir cámara' : 'Abrir ajustes del teléfono'}
              onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
              style={{ marginTop: 20 }}
            />
          )}
          {permission && !permission.granted && !permission.canAskAgain && (
            <Text style={s.permP}>
              El permiso de cámara está bloqueado. En Ajustes → Permisos → Cámara, elige "Permitir".
            </Text>
          )}
        </View>
      )}

      {/* Marco de apuntado */}
      {permission?.granted && (
        <View pointerEvents="none" style={s.frameWrap}>
          <View style={s.frame} />
          <Text style={s.frameHint}>Apunta al QR de la entrada</Text>
        </View>
      )}

      {/* Barra superior: volver + evento + contador */}
      <View style={s.topBar}>
        <View style={s.topRow}>
          <Pressable onPress={onBack} accessibilityRole="button" hitSlop={12}><Text style={s.back}>← Eventos</Text></Pressable>
          <Pressable onPress={toggleSound} accessibilityRole="button" hitSlop={12} testID="sound">
            <Text style={[s.back, sound && { color: C.lamp }]}>{sound ? 'Sonido: sí' : 'Sonido: no'}</Text>
          </Pressable>
        </View>
        <Text style={s.evName} numberOfLines={1}>{event.name}</Text>
        <View style={s.bar}><View style={[s.fill, { width: `${pct}%` }]} /></View>
        {banner && (
          <Pressable onPress={banner.onPress} disabled={!banner.onPress} style={[s.banner, { backgroundColor: banner.bg }]} testID="banner">
            <Text style={[s.bannerT, { color: banner.fg }]}>{banner.text}</Text>
          </Pressable>
        )}
        <Text style={s.count} testID="counter"><Text style={s.countN}>{counts.entered}</Text> de {counts.expected} ingresaron</Text>
      </View>

      {/* Barra inferior */}
      <View style={s.bottom}>
        {(Platform.OS === 'web' || __DEV__) && (
          <View style={s.manualRow}>
            <TextInput
              style={s.manualInput} value={manual} onChangeText={setManual} placeholder="Código (solo pruebas)"
              placeholderTextColor={C.muted} autoCapitalize="none" autoCorrect={false} testID="manual"
            />
            <Btn title="Probar" kind="quiet" onPress={() => { submit(manual); setManual(''); }} style={{ minHeight: 44 }} />
          </View>
        )}
        <View style={s.actions}>
          <Btn title={torch ? 'Linterna: sí' : 'Linterna'} kind={torch ? 'primary' : 'quiet'} onPress={() => setTorch((v) => !v)} style={{ flex: 1 }} />
          <Btn title={`Zoom ${ZOOMS[zoomIdx].label}`} kind={zoomIdx ? 'primary' : 'quiet'} onPress={() => setZoomIdx((i) => (i + 1) % ZOOMS.length)} style={{ flex: 1 }} />
        </View>
        <View style={s.actions}>
          <Btn title="Buscar" kind="quiet" onPress={onSearch} style={{ flex: 1 }} />
          <Btn title="Mis escaneos" kind="quiet" onPress={onHistory} style={{ flex: 1 }} />
        </View>
      </View>

      {view && <ResultOverlay view={view} onDismiss={dismiss} />}
      {conflictView && <ResultOverlay view={conflictView} onDismiss={() => { setConflictView(null); clearConflicts(); }} />}
    </View>
  );
}

const s = StyleSheet.create({
  banner: { marginTop: 10, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  bannerT: { fontSize: 14, fontWeight: '800' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  permWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: C.bg },
  permT: { color: C.ink, fontSize: 26, fontWeight: '800' },
  permP: { color: C.muted, fontSize: 16, marginTop: 8, textAlign: 'center' },
  frameWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 250, height: 250, borderRadius: 18, borderWidth: 3, borderColor: C.lamp },
  frameHint: { color: '#fff', marginTop: 14, fontSize: 15, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 6 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 52, paddingHorizontal: 18, paddingBottom: 14, backgroundColor: 'rgba(14,19,25,0.88)' },
  back: { color: C.muted, fontSize: 15, fontWeight: '600' },
  evName: { color: C.ink, fontSize: 22, fontWeight: '800', marginTop: 6 },
  bar: { height: 6, borderRadius: 3, backgroundColor: C.raised, marginTop: 10, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: C.lamp },
  count: { color: C.muted, fontSize: 14, marginTop: 6 },
  countN: { color: C.ink, fontWeight: '800', fontSize: 16 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 30, backgroundColor: 'rgba(14,19,25,0.88)', gap: 10 },
  actions: { flexDirection: 'row', gap: 10 },
  manualRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  manualInput: { flex: 1, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: 8, color: C.ink, paddingHorizontal: 12, height: 44 },
});
