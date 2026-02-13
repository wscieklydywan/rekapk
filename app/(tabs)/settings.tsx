
import AnimatedModal from '@/components/AnimatedModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { getAuth, signOut } from 'firebase/auth';
import { doc, getFirestore, onSnapshot, updateDoc } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, ScrollView, StatusBar, StyleSheet, Switch, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { getAnimationsEnabled, setAnimationsEnabled } from '@/components/animationPreference';
import { SelectionModal } from '@/components/SelectionModal';
import TabTransition from '@/components/TabTransition';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

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
      styles.settingRowLarge
    ]}
    onPress={item.onPress}
    disabled={!item.onPress}
  >
      <View style={[styles.iconCircleSmall, { backgroundColor: item.iconColor || themeColors.tint }]}> 
        <Ionicons name={item.icon} size={20} color={'white'} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={[styles.settingLabelLarge, { color: item.textColor || themeColors.text }]} numberOfLines={1} ellipsizeMode="tail">{item.label}</Text>
      {item.value ? <Text style={[styles.settingSubtitle, { color: themeColors.textMuted }]} numberOfLines={1}>{item.value}</Text> : null}
    </View>
    {/* chevron removed per design */}
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
    { label: 'Tylko moje i nieprzypisane', shortLabel: 'Tylko moje', value: 'assigned' },
    { label: 'Wszystkie czaty', shortLabel: 'Wszystkie', value: 'all' },
  ];

  const currentNotificationShort = notificationModeOptions.find(o => o.value === notificationMode)?.shortLabel || '';
  const selectionOptions = notificationModeOptions.map(o => ({ label: o.label, value: o.value }));

  const router = useRouter();
  const [hasScrolled, setHasScrolled] = useState(false);

  const sections = useMemo<SettingsSection[]>(() => [
    {
      title: 'Ustawienia Główne',
        items: [
        {
          id: 'account',
          label: 'Konto',
          icon: 'person-circle-outline',
          value: displayName,
          iconColor: '#3b82f6',
          onPress: () => { try { router.push('/settings/account' as any); } catch {} }
        },
        {
          id: 'notifications',
          label: 'Powiadomienia',
          icon: 'notifications-outline',
          value: notificationStatus === null ? '...' : (notificationStatus ? 'Włączone' : 'Wyłączone'),
          iconColor: '#ef4444',
          onPress: () => { try { router.push('/settings/notifications' as any); } catch {} }
        },
        {
          id: 'chatSettings',
          label: 'Ustawienia czatu',
          icon: 'chatbubble-ellipses-outline',
          iconColor: '#9CA3AF',
          textColor: themeColors.textMuted,
          onPress: undefined
        },
        {
          id: 'theme',
          label: 'Motyw',
          icon: 'color-palette-outline',
          value: 'Zmień motyw',
          iconColor: '#9CA3AF',
          textColor: themeColors.textMuted,
          onPress: undefined
        }
      ]
    },
    // combine items into simpler sections — subpages handle details
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
    <TabTransition tabIndex={3} quick={true} style={{ flex: 1, backgroundColor: '#f6f6f6' }}>
      <StatusBar backgroundColor="#f6f6f6" barStyle="dark-content" />

      <ConfirmationModal visible={logoutModalVisible} onClose={() => setLogoutModalVisible(false)} title="Wylogowanie" message="Czy na pewno chcesz się wylogować?" confirmText="Wyloguj się" cancelText="Anuluj" onConfirm={handleLogout} variant="destructive" />
      <SelectionModal visible={modeSelectionModalVisible} onClose={() => setModeSelectionModalVisible(false)} title="Wybierz tryb powiadomień" options={selectionOptions} onSelect={handleModeUpdate} currentValue={notificationMode} />

      <AnimatedModal visible={isNameModalVisible} onClose={() => setNameModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: '100%' }}>
          <View style={[styles.modalContainer, { backgroundColor: themeColors.card }]}> 
            <View style={styles.iconInlineWrapper} pointerEvents="none">
              <View style={[styles.iconCircle, { backgroundColor: '#ef7155' }]}> 
                <Ionicons name="person" size={20} color="white" />
              </View>
            </View>
            <Text style={[styles.modalTitle, { color: themeColors.text, marginTop: 8 }]}>Zmień swój pseudonim</Text>
          </View>
        </KeyboardAvoidingView>
      </AnimatedModal>

      <View style={[styles.headerSlot, { borderBottomColor: themeColors.border }, hasScrolled ? styles.headerShadow : undefined]}> 
        <Animated.View style={styles.headerLayer}> 
          <View style={[styles.headerContent, { backgroundColor: '#f6f6f6' }]}> 
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>Ustawienia</Text>
          </View>
        </Animated.View>
      </View>

      <ScrollView style={{flex: 1, backgroundColor: '#f6f6f6'}} contentContainerStyle={styles.scrollContent} onScroll={(e) => setHasScrolled(e.nativeEvent.contentOffset.y > 5)} scrollEventThrottle={16}>
        <View style={[styles.userHeaderContainerCentered, { backgroundColor: '#f6f6f6' }]}> 
          <View style={[styles.avatarLarge, { backgroundColor: '#ef7155' }]}> 
            <Text style={styles.avatarTextLarge}>{getInitials(displayName)}</Text>
          </View>
          <Text style={[styles.headerNameCenter, { color: themeColors.text }]}>{displayName}</Text>
          <Text style={[styles.headerEmailCenter, { color: themeColors.textMuted }]}>{user?.email || ''}</Text>
        </View>

        {sections.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>{section.title}</Text>
            <View style={[
                styles.listContainer, 
                { 
                  backgroundColor: '#ffffff', 
                  borderColor: section.isDestructive ? themeColors.danger : themeColors.border,
                  borderWidth: section.isDestructive ? 1 : 0
                }
            ]}>
              {section.items.map((item, index) => {
                const isFirst = index === 0;
                if (item.id === 'animations') {
                  return (
                    <View key={item.id}>
                      {!isFirst && <View style={[styles.rowSeparator, { backgroundColor: themeColors.border }]} />}
                      <View style={[styles.settingRow, !isFirst && { borderTopWidth: 0 }]}>
                        <Ionicons name={item.icon} size={22} color={item.iconColor || themeColors.textMuted} style={styles.settingIcon}/>
                        <Text style={[styles.settingLabel, { color: item.textColor || themeColors.text }]} numberOfLines={1} ellipsizeMode="tail">{item.label}</Text>
                        <View style={styles.settingValueContainer}>
                          <Switch value={!!animationsEnabled} onValueChange={toggleAnimations} thumbColor={animationsEnabled ? themeColors.tint : undefined} trackColor={{ true: themeColors.tint + '66', false: undefined }} />
                        </View>
                      </View>
                    </View>
                  );
                }
                return (
                  <View key={item.id}>
                    {!isFirst && <View style={[styles.rowSeparator, { backgroundColor: themeColors.border }]} />}
                    <SettingRow item={item} isFirst={isFirst} isLast={index === section.items.length - 1} themeColors={themeColors} />
                  </View>
                );
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
  headerSlot: { height: 64, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  headerLayer: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%' },
  headerContent: { paddingTop: 12, paddingBottom: 8, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', height: '100%', backgroundColor: '#f6f6f6' },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  scrollContent: { paddingBottom: 30 },
  userHeaderContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 20, paddingTop: 20 },
  userHeaderContainerCentered: { alignItems: 'center', marginBottom: 18, paddingTop: 18 },
  avatar: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  avatarLarge: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  avatarTextLarge: { color: 'white', fontSize: 36, fontWeight: '700' },
  headerName: { fontSize: 18, fontWeight: '600' },
  headerNameCenter: { fontSize: 20, fontWeight: '700', marginBottom: 2 },
  headerEmail: { fontSize: 14, marginTop: 2 },
  headerEmailCenter: { fontSize: 14, color: '#666' },
  section: { marginBottom: 25 },
  sectionTitle: { fontSize: 13, fontWeight: '500', marginBottom: 10, paddingHorizontal: 25, textTransform: 'uppercase', letterSpacing: 0.5 },
  listContainer: { marginHorizontal: 15, borderRadius: 20, overflow: 'hidden' },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, height: 52 },
  settingRowLarge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, height: 72 },
  settingIcon: { marginRight: 15, width: 22 },
  settingLabel: { fontSize: 16, flex: 1, flexShrink: 1 },
  settingLabelLarge: { fontSize: 16, fontWeight: '600' },
  settingSubtitle: { fontSize: 13, marginTop: 4 },
  settingValueContainer: { flexDirection: 'row', alignItems: 'center', maxWidth: '50%' },
  settingValue: { fontSize: 16, marginRight: 5, textAlign: 'right' },
  iconCircleSmall: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowSeparator: { height: StyleSheet.hairlineWidth, marginLeft: 68, marginRight: 18 },
  appInfoFooter: { marginTop: 10, alignItems: 'center' },
  footerText: { fontSize: 12, lineHeight: 18 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { width: '100%', borderRadius: 12, padding: 20, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 15, textAlign: 'center' },
  input: { height: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 15, fontSize: 16, marginBottom: 20, width: '100%' },
  iconInlineWrapper: {
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -10 }],
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  modalActionsRow: { flexDirection: 'row', justifyContent: 'center', width: '100%', transform: [{ translateY: 10 }] },
  modalButton: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flex: 1, marginHorizontal: 6 },
  modalButtonCancel: { backgroundColor: 'transparent', borderWidth: 1 },
  modalButtonConfirmFull: { marginLeft: 8 }
  ,
  headerShadow: { shadowColor: '#000', shadowOffset: { width: 0, height: 1.2 }, shadowOpacity: 0.08, shadowRadius: 2.5, elevation: 2 }
});

export default SettingsScreen;
