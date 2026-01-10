
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, useColorScheme, TouchableOpacity, ScrollView, AppState, Platform, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import * as Linking from 'expo-linking';
import { getAuth, signOut } from 'firebase/auth';
import { doc, getFirestore, onSnapshot, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { SelectionModal } from '@/components/SelectionModal';
import * as Notifications from 'expo-notifications';

const APP_VERSION = "1.0.5";

const SettingRow = ({ item, themeColors, isFirst, isLast }: { item: any, themeColors: any, isFirst: boolean, isLast: boolean }) => (
  <TouchableOpacity 
    style={[
      styles.settingRow, 
      !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: themeColors.border }
    ]}
    onPress={item.onPress}
    disabled={!item.onPress}
  >
    <Ionicons name={item.icon} size={22} color={item.iconColor || themeColors.textMuted} style={styles.settingIcon}/>
    <Text style={[styles.settingLabel, { color: item.textColor || themeColors.text }]}>{item.label}</Text>
    <View style={styles.settingValueContainer}>
      {item.value && <Text style={[styles.settingValue, { color: themeColors.textMuted }]}>{item.value}</Text>}
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

  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<boolean | null>(null);
  const [notificationMode, setNotificationMode] = useState<'assigned' | 'all'>('assigned');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [modeSelectionModalVisible, setModeSelectionModalVisible] = useState(false);
  const [isNameModalVisible, setNameModalVisible] = useState(false);
  const [tempDisplayName, setTempDisplayName] = useState(displayName);

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

  const openAppSettings = () => Platform.OS !== 'web' && Linking.openSettings();
  const openPrivacyPolicy = () => Linking.openURL('https://reklamour.pl').catch(() => {});

  const notificationModeOptions = [
    { label: 'Tylko moje i nieprzypisane', value: 'assigned' },
    { label: 'Wszystkie czaty', value: 'all' },
  ];

  const sections = useMemo(() => [
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
      ]
    },
    {
      title: 'Powiadomienia o czatach',
      items: [
        {
          id: 'chatNotifications',
          label: 'Otrzymuj powiadomienia',
          icon: 'chatbubble-ellipses-outline',
          value: notificationMode === 'all' ? 'Wszystkie czaty' : 'Tylko moje i nieprzypisane',
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
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      <ConfirmationModal visible={logoutModalVisible} onClose={() => setLogoutModalVisible(false)} title="Wylogowanie" message="Czy na pewno chcesz się wylogować?" confirmText="Wyloguj się" cancelText="Anuluj" onConfirm={handleLogout} variant="destructive" />
      <SelectionModal visible={modeSelectionModalVisible} onClose={() => setModeSelectionModalVisible(false)} title="Wybierz tryb powiadomień" options={notificationModeOptions} onSelect={handleModeUpdate} currentValue={notificationMode} />
      
      <Modal visible={isNameModalVisible} transparent={true} animationType="fade" onRequestClose={() => setNameModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBackdrop}>
            <View style={[styles.modalContainer, { backgroundColor: themeColors.card }]}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Zmień swój pseudonim</Text>
                <TextInput 
                    style={[styles.input, { color: themeColors.text, backgroundColor: themeColors.background, borderColor: themeColors.border }]} 
                    value={tempDisplayName} 
                    onChangeText={setTempDisplayName} 
                    placeholder="Wpisz pseudonim" 
                    placeholderTextColor={themeColors.textMuted}
                />
                <View style={styles.modalActions}>
                    <TouchableOpacity style={styles.modalButton} onPress={() => setNameModalVisible(false)}><Text style={{ color: themeColors.text }}>Anuluj</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.modalButton, styles.modalButtonConfirm]} onPress={handleDisplayNameUpdate}><Text style={{ color: themeColors.tint }}>Zapisz</Text></TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
      </Modal>

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
              {section.items.map((item, index) => (
                <SettingRow key={item.id} item={item} isFirst={index === 0} isLast={index === section.items.length - 1} themeColors={themeColors} />
              ))}
            </View>
          </View>
        ))}
        
        <View style={styles.appInfoFooter}>
            <Text style={[styles.footerText, { color: themeColors.textMuted }]}>Reklamour</Text>
            <Text style={[styles.footerText, { color: themeColors.textMuted }]}>Wersja {APP_VERSION}</Text>
        </View>
      </ScrollView>
    </View>
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
  settingLabel: { fontSize: 16, flex: 1 },
  settingValueContainer: { flexDirection: 'row', alignItems: 'center' },
  settingValue: { fontSize: 16, marginRight: 5 },
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
