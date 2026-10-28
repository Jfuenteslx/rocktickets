import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { C } from '../theme';
import { Btn } from '../ui';
import { api, setBase, setToken, getBase } from '../api';
import { setItem } from '../storage';

export default function Login({ initialBase, onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(initialBase);
  const [showServer, setShowServer] = useState(!initialBase);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!server.trim()) { setShowServer(true); return setError('Escribe la dirección del servidor.'); }
    if (!email.trim() || !password) return setError('Escribe tu correo y tu contraseña.');
    setBusy(true); setError('');
    setBase(server);
    try {
      const data = await api.post('/auth/login', { email: email.trim().toLowerCase(), password });
      if (data.user.role === 'ORGANIZADOR') {
        setError('Esta app es para el personal de puerta. Los organizadores usan el panel web.');
        return;
      }
      setToken(data.token);
      await setItem('rt-base', getBase());
      await onLoggedIn(data);
    } catch (e) {
      setToken(null);
      setError(e.status === 0 ? `No se pudo conectar con ${getBase()}. Revisa la dirección y que el celular esté en la misma red.` : e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Text style={s.brand}>ROCKTICKETS</Text>
        <Text style={s.h1}>Puerta</Text>
        <Text style={s.lead}>Entra con la cuenta que te dio la organización.</Text>

        <Text style={s.label}>Correo</Text>
        <TextInput
          style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
          keyboardType="email-address" textContentType="username" placeholder="tu@correo.com" placeholderTextColor={C.muted}
          testID="email"
        />
        <Text style={s.label}>Contraseña</Text>
        <TextInput
          style={s.input} value={password} onChangeText={setPassword} secureTextEntry textContentType="password"
          placeholder="••••••••" placeholderTextColor={C.muted} onSubmitEditing={submit} testID="password"
        />

        {showServer ? (
          <>
            <Text style={s.label}>Servidor</Text>
            <TextInput
              style={s.input} value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false}
              keyboardType="url" placeholder="http://192.168.1.10:3000" placeholderTextColor={C.muted} testID="server"
            />
            <Text style={s.hint}>Dirección de la API de Rocktickets. En pruebas, la IP de tu computadora.</Text>
          </>
        ) : (
          <Pressable onPress={() => setShowServer(true)} accessibilityRole="button">
            <Text style={s.link}>Servidor: {server} · cambiar</Text>
          </Pressable>
        )}

        {!!error && <Text style={s.error} accessibilityRole="alert">{error}</Text>}
        <Btn title={busy ? 'Entrando…' : 'Entrar'} onPress={submit} disabled={busy} style={{ marginTop: 22 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 24, paddingTop: 72 },
  brand: { color: C.lamp, fontWeight: '800', letterSpacing: 3, fontSize: 13 },
  h1: { color: C.ink, fontSize: 52, fontWeight: '800', marginTop: 4 },
  lead: { color: C.muted, fontSize: 16, marginTop: 6, marginBottom: 26 },
  label: { color: C.ink, fontWeight: '600', fontSize: 14, marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: 8, color: C.ink,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 16,
  },
  hint: { color: C.muted, fontSize: 13, marginTop: 6, lineHeight: 18 },
  link: { color: C.muted, fontSize: 14, marginTop: 18, textDecorationLine: 'underline' },
  error: { color: C.bad, fontSize: 15, marginTop: 18, lineHeight: 21 },
});
