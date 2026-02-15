import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { doc, getDoc, getFirestore, updateDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AccountScreen = () => {
  const { user } = useAuth();
  const theme = useColorScheme() ?? 'light';
  const themeColors = Colors[theme];
  const insets = useSafeAreaInsets();
  const headerBase = 64;
  const headerHeight = headerBase + insets.top;
  const router = useRouter();
  const db = getFirestore();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    try {
      setSaving(true);
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { displayName: displayName.trim() });
      router.back();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      const parts = name.split(' ').filter(p => p.trim().length > 0);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return parts[0].substring(0, 2).toUpperCase();
    }
    if (email) return email.substring(0, 2).toUpperCase();
    return 'U?';
  };

  React.useEffect(() => {
    let mounted = true;
    if (!user) return;
    (async () => {
      try {
        const uref = doc(db, 'users', user.uid);
        const snap = await getDoc(uref);
        if (!mounted) return;
        if (snap.exists()) {
          const data = snap.data() as any;
          if (data?.displayName) setDisplayName(data.displayName);
        }
      } catch (e) { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, [user?.uid]);

  

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: '#f6f6f6' }]}> 
      <View style={[styles.headerSlot, { height: headerHeight, backgroundColor: '#f6f6f6', borderBottomColor: themeColors.border }]}> 
        <View style={styles.headerLayer}>
          <View style={[styles.headerContent, { borderColor: themeColors.border, paddingTop: insets.top }]}> 
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={22} color={themeColors.tint} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: themeColors.text }]}>Konto</Text>
            <View style={{ width: 44 }} />
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Top info card: avatar + basic contact/info */}
        <Text style={[styles.cardHeader, { color: themeColors.text, opacity: 0.70 }]}>{'Informacje'}</Text>
        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <View style={styles.cardRow}>
              <View style={styles.avatarWrapper}>
                <View style={[styles.avatarLargeSmall, { backgroundColor: '#ef7155' }]}> 
                  <Text style={styles.avatarTextSmall}>{getInitials(displayName || undefined, user?.email || undefined)}</Text>
                </View>
                  <TouchableOpacity style={styles.avatarOverlay} onPress={() => { /* placeholder */ }}>
                    <Ionicons name="camera" size={16} color={'#fff'} style={{ transform: [{ translateY: -1 }] }} />
                  </TouchableOpacity>
              </View>
              <View style={{ flex: 1, marginLeft: 12, marginTop: 4 }}>
                <Text style={[styles.cardText, { color: themeColors.text, fontSize: 20, fontWeight: '700' }]}>{displayName || user?.displayName || ''}</Text>
                <Text style={[styles.cardSubText, { color: themeColors.textMuted, fontSize: 14, opacity: 0.8 }]} numberOfLines={1}>{user?.email || ''}</Text>
              </View>
            </View>
          </View>

        {/* Combined card: Twoja nazwa - change password & email in one tile */}
        <Text style={[styles.cardHeader, { color: themeColors.text, opacity: 0.70 }]}>{'Informacje konta'}</Text>
        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={{ marginTop: 8 }}>
            <View style={[styles.inputRow, { marginBottom: 6 }]}>
              <Ionicons name="person" size={18} color={'#000'} style={{ marginRight: 8, alignSelf: 'center' }} />
              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Pseudonim</Text>
            </View>
            <TextInput value={displayName} onChangeText={setDisplayName} style={[styles.inputInline, { borderColor: themeColors.border, color: themeColors.text }]} placeholderTextColor={themeColors.textMuted} />

            <View style={[styles.inputRow, { marginTop: 12, marginBottom: 6 }]}>
              <Ionicons name="mail" size={18} color={'#000'} style={{ marginRight: 8, alignSelf: 'center' }} />
              <Text style={[styles.inputLabel, { color: themeColors.text }]}>E-mail</Text>
            </View>
            <View style={[styles.inputInline, { borderWidth: 0, backgroundColor: themeColors.input, justifyContent: 'center', paddingHorizontal: 12 }]} pointerEvents="none"> 
              <Text style={{ color: themeColors.textMuted, opacity: 0.9 }}>{user?.email || '—'}</Text>
            </View>

            <View style={[styles.inputRow, { marginTop: 12, marginBottom: 6 }]}>
              <Ionicons name="key" size={18} color={'#000'} style={{ marginRight: 8, alignSelf: 'center' }} />
              <Text style={[styles.inputLabel, { color: themeColors.text }]}>Hasło</Text>
            </View>
            <View style={[styles.inputInline, { borderWidth: 0, backgroundColor: themeColors.input, justifyContent: 'center', paddingHorizontal: 12 }]} pointerEvents="none"> 
              <Text style={{ color: themeColors.textMuted, opacity: 0.9 }}>{'********'}</Text>
            </View>
          </View>
        </View>
        <Text style={[styles.smallNote, { color: themeColors.textMuted }]}>Zmiana hasła i e-maila jest tymczasowo nieaktywna — skontaktuj się z administracją</Text>

        <TouchableOpacity style={[styles.saveButton, { backgroundColor: themeColors.tint }]} onPress={handleSave} disabled={saving}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Zapis...' : 'Zapisz zmiany'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerSlot: { height: 64 },
  headerLayer: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%' },
  headerContent: { paddingTop: 0, paddingBottom: 0, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', height: '100%', justifyContent: 'flex-start' },
  backButton: { width: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', transform: [{ translateX: 8 }] },
  content: { padding: 16 },
  card: { borderRadius: 20, padding: 14, marginBottom: 14, borderWidth: 0, overflow: 'hidden' },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  avatarLargeSmall: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  avatarTextSmall: { color: 'white', fontSize: 22, fontWeight: '700' },
  avatarWrapper: { width: 88, alignItems: 'center', justifyContent: 'center' },
  avatarOverlay: { position: 'absolute', right: 4, bottom: -4, width: 28, height: 28, borderRadius: 14, backgroundColor: '#2F80ED', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 0, shadowColor: 'transparent', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, zIndex: 3 },
  /* avatarGradientOverlay removed — no dark overlay */
  changeLink: { marginTop: 6, fontSize: 13, fontWeight: '600' },
  cardTitle: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  cardHeader: { fontSize: 13, fontWeight: '500', marginBottom: 10, paddingHorizontal: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardText: { fontSize: 16, marginBottom: 2 },
  cardSubText: { fontSize: 13 },
  inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  linkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  linkText: { fontSize: 14, fontWeight: '600' },
  inputInline: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, backgroundColor: 'transparent' },
  saveButton: { height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  smallNote: { fontSize: 13, marginTop: -6 }
  ,
  headerShadow: { shadowColor: '#000', shadowOffset: { width: 0, height: 1.2 }, shadowOpacity: 0.08, shadowRadius: 2.5, elevation: 2 }
});

export default AccountScreen;
