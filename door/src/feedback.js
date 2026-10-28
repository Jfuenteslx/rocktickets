import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { getItem, setItem } from './storage';

// Cada resultado suena y vibra distinto, para poder trabajar sin mirar la pantalla en un local oscuro:
//   ok   → tono ascendente + vibración corta
//   bad  → tono grave y áspero + vibración larga doble
//   warn → doble tono medio + tres vibraciones cortas
const SOURCES = {
  ok: require('../assets/sounds/ok.wav'),
  bad: require('../assets/sounds/bad.wav'),
  warn: require('../assets/sounds/warn.wav'),
};
const PATTERNS = { ok: [0, 90], bad: [0, 350, 120, 350], warn: [0, 120, 90, 120, 90, 120] };

let players = null;
let muted = false;

function ensurePlayers() {
  if (players) return players;
  try {
    players = {};
    for (const k of Object.keys(SOURCES)) players[k] = createAudioPlayer(SOURCES[k]);
  } catch {
    players = {}; // sin audio: queda la vibración
  }
  return players;
}

// Se llama una vez al abrir el escáner: carga el ajuste guardado y deja el audio listo
export async function initFeedback() {
  muted = (await getItem('rt-muted')) === '1';
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
  } catch { /* no crítico */ }
  ensurePlayers();
  return muted;
}

export async function setMuted(value) {
  muted = value;
  await setItem('rt-muted', value ? '1' : null);
}

export function signal(tone) {
  // Vibración: en Android con patrón propio; en iPhone solo hay "golpes" del sistema
  try {
    if (Platform.OS === 'android') Vibration.vibrate(PATTERNS[tone] ?? PATTERNS.warn);
    else if (Platform.OS === 'ios') {
      const T = Haptics.NotificationFeedbackType;
      Haptics.notificationAsync(tone === 'ok' ? T.Success : tone === 'bad' ? T.Error : T.Warning);
    }
  } catch { /* sin vibración */ }
  if (muted) return;
  try {
    const p = ensurePlayers()[tone];
    if (!p) return;
    p.seekTo(0)?.catch?.(() => {});
    p.play();
  } catch { /* sin sonido */ }
}
