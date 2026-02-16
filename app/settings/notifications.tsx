import { SelectionModal } from '@/components/SelectionModal';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { doc, getFirestore, onSnapshot, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, useColorScheme, View } from 'react-native';

const notificationModeOptions = [
  { label: 'Tylko moje i nieprzypisane', shortLabel: 'Tylko moje', value: 'assigned' },
  { label: 'Wszystkie czaty', shortLabel: 'Wszystkie', value: 'all' },
];

const NotificationsScreen = () => {
  const theme = useColorScheme() ?? 'light';
  const themeColors = Colors[theme];
  const router = useRouter();
  const { user } = useAuth();
  const db = getFirestore();

  const [granted, setGranted] = useState<boolean | null>(null);
  const [notificationMode, setNotificationMode] = useState<'assigned' | 'all'>('assigned');
  const [modeSelectionVisible, setModeSelectionVisible] = useState(false);
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (mounted) setGranted(status === 'granted');
      } catch (e) {}
    };
    check();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') check();
    });
    return () => { mounted = false; sub.remove(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    const uref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(uref, snap => {
      if (!snap.exists()) return;
      const data = snap.data() as any;
      setNotificationMode(data.notificationSettings?.mode || 'assigned');
      setDisplayName(data.displayName || user.email || '');
    });
    return () => unsub();
  }, [user?.uid]);

  const openSystem = async () => {
    try { await Notifications.requestPermissionsAsync(); const { status } = await Notifications.getPermissionsAsync(); setGranted(status === 'granted'); } catch (e) {}
  }

  const handleModeUpdate = async (newMode: string) => {
    if (!user || (newMode !== 'assigned' && newMode !== 'all')) return;
    const uref = doc(db, 'users', user.uid);
    await updateDoc(uref, { 'notificationSettings.mode': newMode });
    setModeSelectionVisible(false);
  }

  const currentShort = notificationModeOptions.find(o => o.value === notificationMode)?.shortLabel || '';

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      const parts = name.split(' ').filter(p => p.trim().length > 0);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return parts[0].substring(0, 2).toUpperCase();
    }
    if (email) return email.substring(0, 2).toUpperCase();
    return 'U?';
  };

  const openAppSettings = async () => {
    try { await Linking.openSettings(); } catch (e) {}
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: '#f6f6f6' }]}> 
      <View style={[styles.headerSlot, { backgroundColor: '#f6f6f6', borderBottomColor: themeColors.border }]}> 
        <View style={styles.headerLayer}>
          <View style={[styles.headerContent, { borderColor: themeColors.border }]}> 
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={22} color={themeColors.tint} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: themeColors.text }]}>Powiadomienia</Text>
            <View style={{ width: 44 }} />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.cardHeader, { color: themeColors.text, opacity: 0.7 }]}>{'Powiadomienia'}</Text>
          <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={{ marginTop: 0 }}>
            <View>
              <TouchableOpacity style={[styles.inputRow, { justifyContent: 'space-between' }]} onPress={openAppSettings}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: themeColors.text }]}>Powiadomienia push</Text>
                      <Text style={[styles.smallSubtitle, { color: themeColors.textMuted }]}>Włącz powiadomienia aplikacji</Text>
                </View>
                <Switch value={!!granted} onValueChange={openAppSettings} thumbColor={granted ? themeColors.tint : undefined} trackColor={{ true: themeColors.tint + '66', false: undefined }} />
              </TouchableOpacity>

              <View style={[styles.rowSeparator, { backgroundColor: themeColors.border }]} />

              <TouchableOpacity style={[styles.inputRow, { marginTop: 0, justifyContent: 'space-between' }]} onPress={() => setModeSelectionVisible(true)}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: themeColors.text }]}>Tryb powiadomień</Text>
                  <Text style={[styles.smallSubtitle, { color: themeColors.textMuted } ]}>Wybierz, jakie powiadomienia{`\n`}chcesz otrzymywać</Text>
                </View>
                <Text style={{ color: themeColors.textMuted }}>{currentShort}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <SelectionModal visible={modeSelectionVisible} onClose={() => setModeSelectionVisible(false)} title="Wybierz tryb powiadomień" options={notificationModeOptions.map(o => ({ label: o.label, value: o.value }))} onSelect={handleModeUpdate} currentValue={notificationMode} />
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
  cardHeader: { fontSize: 13, fontWeight: '500', marginBottom: 10, paddingHorizontal: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardText: { fontSize: 16, marginBottom: 2 },
  cardSubText: { fontSize: 13 },
  inputLabel: { fontSize: 15, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 6 },
  rowSeparator: { height: StyleSheet.hairlineWidth, marginLeft: 6, marginRight: 6, marginVertical: 8 },
  smallNote: { fontSize: 13, lineHeight: 18 },
  smallSubtitle: { fontSize: 13, lineHeight: 18, marginTop: 4 },
});

export default NotificationsScreen;
