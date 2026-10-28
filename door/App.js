import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { C } from './src/theme';
import { api, setBase, setToken, setUnauthorizedHandler } from './src/api';
import { getItem, setItem } from './src/storage';
import { newDeviceId } from './src/format';
import Login from './src/screens/Login';
import Events from './src/screens/Events';
import Scan from './src/screens/Scan';
import History from './src/screens/History';
import Search from './src/screens/Search';
import { initOffline, startSyncLoop, syncNow } from './src/offline';

const DEFAULT_BASE = process.env.EXPO_PUBLIC_API_URL || '';

export default function App() {
  const [boot, setBoot] = useState(true);
  const [base, setBaseState] = useState(DEFAULT_BASE);
  const [user, setUser] = useState(null);
  const [deviceId, setDeviceId] = useState('');
  const [screen, setScreen] = useState('events'); // events | scan | history | search
  const [event, setEvent] = useState(null);

  const logout = useCallback(async () => {
    setToken(null);
    await setItem('rt-token', null);
    setUser(null); setEvent(null); setScreen('events');
  }, []);

  // Arranque: dispositivo, servidor guardado y sesión previa (se valida contra /auth/me)
  useEffect(() => {
    (async () => {
      let dev = await getItem('rt-device');
      if (!dev) { dev = newDeviceId(); await setItem('rt-device', dev); }
      setDeviceId(dev);
      const savedBase = (await getItem('rt-base')) || DEFAULT_BASE;
      setBaseState(savedBase);
      setBase(savedBase);
      setUnauthorizedHandler(logout);
      const t = await getItem('rt-token');
      if (t && savedBase) {
        setToken(t);
        try {
          const me = await api.get('/auth/me');
          if (me.role !== 'ORGANIZADOR') { setUser({ name: me.name, role: me.role, id: me.id }); await setItem('rt-uid', me.id); }
          else setToken(null);
        } catch (e) {
          if (e.status !== 0) { setToken(null); await setItem('rt-token', null); }
          else setUser({ name: 'Personal', role: 'STAFF_PUERTA', id: await getItem('rt-uid') }); // sin red: se deja entrar, las llamadas fallarán con aviso
        }
      }
      setBoot(false);
    })();
  }, [logout]);

  // Modo sin conexión: la cola pertenece al usuario; se envía sola cuando hay red
  useEffect(() => {
    if (!user?.id || !deviceId) return undefined;
    initOffline(user.id, deviceId).then(() => { startSyncLoop(); syncNow(); });
    return undefined;
  }, [user?.id, deviceId]);

  // Botón "atrás" de Android: vuelve una pantalla en lugar de cerrar la app
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'history' || screen === 'search') { setScreen('scan'); return true; }
      if (screen === 'scan') { setScreen('events'); setEvent(null); return true; }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  async function onLoggedIn(data) {
    await setItem('rt-token', data.token);
    await setItem('rt-uid', data.user.id);
    setUser({ name: data.user.name, role: data.user.role, id: data.user.id });
    setScreen('events');
  }

  let body;
  if (boot) body = <ActivityIndicator color={C.lamp} style={{ flex: 1 }} />;
  else if (!user) body = <Login initialBase={base} onLoggedIn={onLoggedIn} />;
  else if (screen === 'scan' && event) {
    body = <Scan event={event} deviceId={deviceId} onBack={() => { setScreen('events'); setEvent(null); }} onHistory={() => setScreen('history')} onSearch={() => setScreen('search')} />;
  } else if (screen === 'search' && event) {
    body = <Search event={event} deviceId={deviceId} onBack={() => setScreen('scan')} />;
  } else if (screen === 'history' && event) {
    body = <History event={event} onBack={() => setScreen('scan')} />;
  } else {
    body = <Events user={user} onOpen={(e) => { setEvent(e); setScreen('scan'); }} onLogout={logout} />;
  }

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      {body}
    </View>
  );
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: C.bg } });
