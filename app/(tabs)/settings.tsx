
import AnimatedModal from '@/components/AnimatedModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { getAuth, signOut } from 'firebase/auth';
import { doc, getFirestore, onSnapshot, updateDoc } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useColorScheme, View } from 'react-native';

import { SelectionModal } from '@/components/SelectionModal';
import TabTransition from '@/components/TabTransition';
import { getAnimationsEnabled, setAnimationsEnabled } from '@/components/animationPreference';
import * as Notifications from 'expo-notifications';

const APP_VERSION = "1.0.5";

type SettingItem = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value?: string;
  onPress?: () => void | Promise<void>;
  iconColor?: string;
  textColor?: string;
};

type SettingsSection = {
  title: string;
  isDestructive?: boolean;
  items: SettingItem[];
};

const SettingRow = ({ item, themeColors, isFirst, isLast }: { item: SettingItem, themeColors: any, isFirst: boolean, isLast: boolean }) => (
  <TouchableOpacity 
    style={[
      styles.settingRow, 
      !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: themeColors.border }
    ]}
    onPress={item.onPress}
    disabled={!item.onPress}
  >
    <Ionicons name={item.icon} size={22} color={item.iconColor || themeColors.textMuted} style={styles.settingIcon}/>
    <Text style={[styles.settingLabel, { color: item.textColor || themeColors.text }]} numberOfLines={1} ellipsizeMode="tail">{item.label}</Text>
    <View style={styles.settingValueContainer}>
      {item.value && <Text style={[styles.settingValue, { color: themeColors.textMuted }]} numberOfLines={1} ellipsizeMode="tail">{item.value}</Text>}
      {item.onPress && <Ionicons name="chevron-forward" size={20} color={themeColors.textMuted} />}
    </View>
  </TouchableOpacity>
);

const SettingsScreen = () => {
  const { user } = useAuth();
  const theme = useColorScheme() ?? 'light';
  const themeColors = Colors[theme];
  const auth = getAuth();
  const db = getFirestore();


  const [notificationStatus, setNotificationStatus] = useState<boolean | null>(null);
  const [notificationMode, setNotificationMode] = useState<'assigned' | 'all'>('assigned');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [modeSelectionModalVisible, setModeSelectionModalVisible] = useState(false);
  const [isNameModalVisible, setNameModalVisible] = useState(false);
  const [tempDisplayName, setTempDisplayName] = useState(displayName);
  const [animationsEnabled, setAnimationsEnabledState] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    getAnimationsEnabled().then(v => { if (mounted) setAnimationsEnabledState(v); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const toggleAnimations = async (v: boolean) => {
    try { await setAnimationsEnabled(v); setAnimationsEnabledState(v); } catch (e) {}
  };

  useEffect(() => {
    const checkPermissions = async () => {
      const { status } = await Notifications.getPermissionsAsync();
      setNotificationStatus(status === 'granted');
    };
    checkPermissions();
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') checkPermissions();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setNotificationMode(data.notificationSettings?.mode || 'assigned');
        setDisplayName(data.displayName || user.email || '');
        setTempDisplayName(data.displayName || user.email || '');
      }
    });
    return () => unsubscribe();
  }, [user]);

  const handleLogout = () => {
    setLogoutModalVisible(false);
    signOut(auth).catch(error => console.error("Logout Error: ", error));
  };

  const handleModeUpdate = async (newMode: string) => {
    if (!user || (newMode !== 'assigned' && newMode !== 'all')) return;
    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, { 'notificationSettings.mode': newMode });
    setModeSelectionModalVisible(false);
  };

  const handleDisplayNameUpdate = async () => {
      if (!user || !tempDisplayName.trim()) return;
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { displayName: tempDisplayName.trim() });
      setNameModalVisible(false);
  }

  const openAppSettings = async () => {
    if (Platform.OS !== 'web') {
      try {
        await Linking.openSettings();
      } catch (e) {}
    }
  };

  const openPrivacyPolicy = async () => {
    try {
      await Linking.openURL('https://reklamour.pl');
    } catch (e) {}
  };

  const notificationModeOptions = [
    { label: 'Tylko moje i nieprzypisane', shortLabel: 'Moje i nieprzyp.', value: 'assigned' },
    { label: 'Wszystkie czaty', shortLabel: 'Wszystkie', value: 'all' },
  ];

  const currentNotificationShort = notificationModeOptions.find(o => o.value === notificationMode)?.shortLabel || '';
  const selectionOptions = notificationModeOptions.map(o => ({ label: o.label, value: o.value }));

  const sections = useMemo<SettingsSection[]>(() => [
    {
      title: 'Ustawienia Główne',
      items: [
        { 
          id: 'displayName', 
          label: 'Pseudonim', 
          icon: 'person-circle-outline', 
          value: displayName, 
          onPress: () => setNameModalVisible(true) 
        },
        {
          id: 'notifications', 
          label: 'Powiadomienia', 
          icon: 'notifications-outline', 
          value: notificationStatus === null ? '...' : (notificationStatus ? 'Włączone' : 'Wyłączone'), 
          onPress: openAppSettings 
        },
        {
          id: 'animations',
          label: 'Animacje interfejsu',
          icon: 'options-outline'
        },
      ]
    },
    {
      title: 'Powiadomienia o czatach',
      items: [
        {
          id: 'chatNotifications',
          label: 'Otrzymuj powiadomienia',
          icon: 'chatbubble-ellipses-outline',
          value: currentNotificationShort,
          onPress: () => setModeSelectionModalVisible(true)
        }
      ]
    },
    {
      title: 'Informacje',
      items: [
        { id: 'privacy', label: 'Polityka prywatności', icon: 'shield-checkmark-outline', onPress: openPrivacyPolicy },
      ]
    },
    {
        title: 'Zarządzanie kontem',
        isDestructive: true, 
        items: [
            { id: 'logout', label: 'Wyloguj się', icon: 'log-out-outline', onPress: () => setLogoutModalVisible(true), textColor: themeColors.danger, iconColor: themeColors.danger },
        ]
    }
  ], [notificationStatus, notificationMode, displayName]);

  const getInitials = (name: string) => {
      return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  }

  return (
    <TabTransition tabIndex={3} style={{ flex: 1, backgroundColor: themeColors.background }}>

      <ConfirmationModal visible={logoutModalVisible} onClose={() => setLogoutModalVisible(false)} title="Wylogowanie" message="Czy na pewno chcesz się wylogować?" confirmText="Wyloguj się" cancelText="Anuluj" onConfirm={handleLogout} variant="destructive" />
      <SelectionModal visible={modeSelectionModalVisible} onClose={() => setModeSelectionModalVisible(false)} title="Wybierz tryb powiadomień" options={selectionOptions} onSelect={handleModeUpdate} currentValue={notificationMode} />
      
      <AnimatedModal visible={isNameModalVisible} onClose={() => setNameModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: '100%' }}>
            <View style={[styles.modalContainer, { backgroundColor: themeColors.card }]}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Zmień swój pseudonim</Text>
                <TextInput 
                    nativeID="settings-display-name"
                    style={[styles.input, { color: themeColors.text, backgroundColor: themeColors.background, borderColor: themeColors.border }]} 
                    value={tempDisplayName} 
                    onChangeText={setTempDisplayName} 
                    placeholder="Wpisz pseudonim" 
                    placeholderTextColor={themeColors.textMuted}
                    autoComplete="name"
                />
                <View style={styles.modalActions}>
                    <TouchableOpacity style={styles.modalButton} onPress={() => setNameModalVisible(false)}><Text style={{ color: themeColors.text }}>Anuluj</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.modalButton, styles.modalButtonConfirm]} onPress={handleDisplayNameUpdate}><Text style={{ color: themeColors.tint }}>Zapisz</Text></TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
      </AnimatedModal>

      <View style={[styles.headerArea, { backgroundColor: themeColors.background }]}>
        <View style={[styles.headerContainer, { borderBottomColor: themeColors.border }]}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Ustawienia</Text>
        </View>
      </View>
      
      <ScrollView style={{flex: 1}} contentContainerStyle={styles.scrollContent}>
        <View style={styles.userHeaderContainer}>
          <View style={[styles.avatar, { backgroundColor: themeColors.tint }]}>
              <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
          </View>
          <View>
            <Text style={[styles.headerName, { color: themeColors.text }]}>{displayName}</Text>
            <Text style={[styles.headerEmail, { color: themeColors.textMuted }]}>{user?.email || ''}</Text>
          </View>
        </View>
        
        {sections.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>{section.title}</Text>
            <View style={[
                styles.listContainer, 
                { 
                  backgroundColor: themeColors.card, 
                  borderColor: section.isDestructive ? themeColors.danger : themeColors.border,
                  borderWidth: section.isDestructive ? 1 : StyleSheet.hairlineWidth
                }
            ]}>
              {section.items.map((item, index) => {
                if (item.id === 'animations') {
                  return (
                    <View key={item.id} style={[styles.settingRow, ! (index === 0) && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: themeColors.border }]}>
                      <Ionicons name={item.icon} size={22} color={item.iconColor || themeColors.textMuted} style={styles.settingIcon}/>
                      <Text style={[styles.settingLabel, { color: item.textColor || themeColors.text }]} numberOfLines={1} ellipsizeMode="tail">{item.label}</Text>
                      <View style={styles.settingValueContainer}>
                        <Switch value={!!animationsEnabled} onValueChange={toggleAnimations} thumbColor={animationsEnabled ? themeColors.tint : undefined} trackColor={{ true: themeColors.tint + '66', false: undefined }} />
                      </View>
                    </View>
                  );
                }
                return <SettingRow key={item.id} item={item} isFirst={index === 0} isLast={index === section.items.length - 1} themeColors={themeColors} />
              })}
            </View>
          </View>
        ))}
        
        <View style={styles.appInfoFooter}>
            <Text style={[styles.footerText, { color: themeColors.textMuted }]}>Reklamour</Text>
            <Text style={[styles.footerText, { color: themeColors.textMuted }]}>Wersja {APP_VERSION}</Text>
        </View>
      </ScrollView>
    </TabTransition>
  );
};

const styles = StyleSheet.create({
  headerArea: { height: 95 },
  headerContainer: { paddingTop: 50, paddingBottom: 15, paddingHorizontal: 20, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', height: '100%' },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  scrollContent: { paddingBottom: 30 },
  userHeaderContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 20, paddingTop: 20 },
  avatar: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  avatarText: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  headerName: { fontSize: 18, fontWeight: '600' },
  headerEmail: { fontSize: 14, marginTop: 2 },
  section: { marginBottom: 25 },
  sectionTitle: { fontSize: 13, fontWeight: '500', marginBottom: 10, paddingHorizontal: 25, textTransform: 'uppercase', letterSpacing: 0.5 },
  listContainer: { marginHorizontal: 15, borderRadius: 12, overflow: 'hidden' },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, height: 52 },
  settingIcon: { marginRight: 15, width: 22 },
  settingLabel: { fontSize: 16, flex: 1, flexShrink: 1 },
  settingValueContainer: { flexDirection: 'row', alignItems: 'center', maxWidth: '50%' },
  settingValue: { fontSize: 16, marginRight: 5, textAlign: 'right' },
  appInfoFooter: { marginTop: 10, alignItems: 'center' },
  footerText: { fontSize: 12, lineHeight: 18 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { width: '90%', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 15, textAlign: 'center' },
  input: { height: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 15, fontSize: 16, marginBottom: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  modalButton: { paddingVertical: 10, paddingHorizontal: 15 },
  modalButtonConfirm: { marginLeft: 10 }
});

export default SettingsScreen;
