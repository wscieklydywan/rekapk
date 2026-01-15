
import { useFormContext } from '@/app/contexts/FormProvider';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import TabTransition from '@/components/TabTransition';
import { ANIM_FADE_DURATION, ANIM_TRANSLATE_DURATION } from '@/constants/animations';
import { Colors } from '@/constants/theme';
import { showMessage } from '@/lib/showMessage';
import { ContactForm } from '@/schemas';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { db } from '@/lib/firebase';
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';

const categoryTranslations: { [key: string]: string } = {
    'websites': 'Strony Internetowe',
    'seo': 'SEO i pozycjonowanie',
    'social_media': 'Social Media',
    'branding': 'Branding i identyfikacja',
    'analytics': 'Analityka i raporty',
    'other': 'Inne',
};

const getTranslatedSubject = (category?: string, service?: string): string => {
    const key = category || service;
    if (key && categoryTranslations[key]) {
        return categoryTranslations[key];
    }
    if (typeof key === 'string' && key.length > 0) {
        return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
    }
    return 'Formularz ogólny';
};

const AVATAR_COLORS = ['#c56b66', '#8c7aa8', '#5f9ac9', '#4caaa0', '#83a869', '#e59f49', '#7c635a', '#b0b86c', '#d15f8a', '#4baadd'];
const generateColor = (str: string) => {
    if (!str) return AVATAR_COLORS[0];
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const Avatar = ({ contactName }: { contactName: string }) => {
    const initial = contactName ? contactName.charAt(0).toUpperCase() : '?';
    const bgColor = generateColor(contactName || '');
    return (
        <View style={[styles.avatar, { backgroundColor: bgColor }]}>
            <Text style={styles.avatarText}>{initial}</Text>
        </View>
    );
};

const FormListItem = ({ item, themeColors, selectionMode, isSelected, onSelect, onDeselect }: { item: ContactForm, themeColors: any, selectionMode: boolean, isSelected: boolean, onSelect: (id: string) => void, onDeselect: (id: string) => void }) => {
    const router = useRouter();
    const isUnread = item.adminUnread > 0;

    const handlePress = () => {
        if (selectionMode) {
            isSelected ? onDeselect(item.id) : onSelect(item.id);
        } else {
             router.push({
                pathname: `/forms/${item.id}`,
                params: { contactName: item.userInfo.contact || 'Formularz' }
            } as any);
        }
    };

    const handleLongPress = () => {
        if (!selectionMode) {
            onSelect(item.id);
        }
    };

    const formattedDate = item.createdAt?.toDate ? new Date(item.createdAt.toDate()).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }) : '';
    
    const animatedContentStyle = useAnimatedStyle(() => {
        return {
            marginLeft: withTiming(selectionMode ? 40 : 0, { duration: ANIM_TRANSLATE_DURATION, easing: Easing.inOut(Easing.ease) }),
        };
    });

    return (
        <TouchableOpacity onPress={handlePress} onLongPress={handleLongPress} style={[styles.itemContainer, isSelected && { backgroundColor: themeColors.selection }]}>
             {selectionMode && (
                <Animated.View entering={FadeIn.duration(ANIM_FADE_DURATION)} exiting={FadeOut.duration(ANIM_FADE_DURATION)} style={styles.checkboxContainer}>
                    <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={isSelected ? themeColors.tint : themeColors.textMuted}/>
                </Animated.View>
            )}
            <Animated.View style={[styles.slidingContainer, animatedContentStyle]}>
                <Avatar contactName={item.userInfo.contact || 'Anonim'} />
                <View style={styles.textContainer}>
                    <View style={styles.lineOne}>
                        <Text style={[styles.contactName, { color: themeColors.text, fontWeight: isUnread ? 'bold' : 'normal' }]} numberOfLines={1}>
                            {item.userInfo.contact || 'Brak kontaktu'}
                        </Text>
                        <Text style={[styles.timestamp, { color: isUnread ? themeColors.tint : themeColors.textMuted }]}>{formattedDate}</Text>
                    </View>
                    <View style={styles.lineTwo}>
                        <Text style={[styles.subject, { color: themeColors.text, fontWeight: isUnread ? '600' : 'normal' }]} numberOfLines={1}>
                            {getTranslatedSubject((item as any).category, (item as any).service)} 
                        </Text>
                        {isUnread && <View style={[styles.unreadDot, { backgroundColor: themeColors.tint }]} />}
                    </View>
                </View>
            </Animated.View>
        </TouchableOpacity>
    );
};

const FormsListScreen = () => {
    const theme = useColorScheme() ?? 'light';
    const themeColors = { ...Colors[theme], selection: theme === 'light' ? '#E8F0FE' : '#2A2A3D', danger: '#FF3B30' };
    const { forms, loading, setForms } = useFormContext();
    const navigation = useNavigation();

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [modalConfig, setModalConfig] = useState<any>(null);
    const modalLockRef = useRef(false);
    const modalTimerRef = useRef<number | null>(null);
    const closeModal = () => {
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
            try {
                const doBlur = () => {
                    try { (document.activeElement as any)?.blur?.(); } catch (e) { /* ignore */ }
                    try {
                        const body = document.body as HTMLElement | null;
                        if (body) {
                            const prevTab = body.getAttribute('tabindex');
                            body.setAttribute('tabindex', '-1');
                            try { body.focus(); } catch (e) { /* ignore */ }
                            if (prevTab === null) body.removeAttribute('tabindex');
                            else body.setAttribute('tabindex', prevTab);
                        }
                    } catch (e) { /* ignore */ }
                };
                doBlur();
                setTimeout(doBlur, 10);
                setTimeout(doBlur, 140);
                setTimeout(doBlur, 300);
            } catch (e) { /* ignore */ }
        }

        // clear any scheduled modal shows
        if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }

        setModalConfig(null);
        modalLockRef.current = true;
        try { if (typeof window !== 'undefined') { (window as any).__modalIsClosing = true; (window as any).__modalSuppressedUntil = Date.now() + 720; } } catch(e) {}
        setTimeout(() => { try { if (typeof window !== 'undefined') (window as any).__modalIsClosing = false; } catch(e) {} modalLockRef.current = false; }, 660);
    };

    const showModal = (config: { title: string; message?: string; confirmText?: string; onConfirm?: () => void; cancelText?: string; variant?: 'destructive' | 'secondary' }) => {
        try {
            if (typeof window !== 'undefined' && (window as any).__modalIsClosing) {
                const until = (window as any).__modalSuppressedUntil || 0;
                const now = Date.now();
                const delay = Math.max(until - now + 60, 420);
                if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }
                modalTimerRef.current = window.setTimeout(() => {
                    if (modalLockRef.current) {
                        modalTimerRef.current = window.setTimeout(() => { setModalConfig(config as any); modalTimerRef.current = null; }, 420);
                    } else {
                        setModalConfig(config as any);
                        modalTimerRef.current = null;
                    }
                }, delay);
                return;
            }
            if (typeof window !== 'undefined') {
                const until = (window as any).__modalSuppressedUntil || 0;
                const now = Date.now();
                if (now < until) {
                    const delay = until - now + 40;
                    if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }
                    modalTimerRef.current = window.setTimeout(() => {
                        if (modalLockRef.current) {
                            modalTimerRef.current = window.setTimeout(() => { setModalConfig(config as any); modalTimerRef.current = null; }, 420);
                        } else {
                            setModalConfig(config as any);
                            modalTimerRef.current = null;
                        }
                    }, delay);
                    return;
                }
            }
        } catch(e) {}

        if (modalLockRef.current) {
            if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }
            modalTimerRef.current = window.setTimeout(() => { setModalConfig(config as any); modalTimerRef.current = null; }, 420);
        } else {
            setModalConfig(config as any);
        }
    }; 

    useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

    const sortedForms = useMemo(() => {
        return [...forms].sort((a, b) => {
            const aUnread = a.adminUnread > 0;
            const bUnread = b.adminUnread > 0;
            if (aUnread !== bUnread) return aUnread ? -1 : 1;
            return (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0);
        });
    }, [forms]);

    const enterSelectionMode = () => setSelectionMode(true);
    const exitSelectionMode = () => { setSelectionMode(false); setSelectedItems([]); };

    const handleSelect = (id: string) => {
        if (!selectionMode) enterSelectionMode();
        setSelectedItems(prev => [...prev, id]);
    };

    const handleDeselect = (id: string) => {
        setSelectedItems(prev => {
            const newSelection = prev.filter(i => i !== id);
            if (newSelection.length === 0) exitSelectionMode();
            return newSelection;
        });
    };

    const handleDeleteSelected = async () => {
        const performDelete = async () => {
            const itemsToDelete = [...selectedItems];
            closeModal();
            exitSelectionMode();
            
            setForms(prevForms => prevForms.filter(form => !itemsToDelete.includes(form.id)));

            try {
                const batch = writeBatch(db);
                for (const formId of itemsToDelete) {
                    const messagesRef = collection(db, 'contact_forms', formId, 'messages');
                    const messagesSnapshot = await getDocs(messagesRef);
                    messagesSnapshot.forEach(doc => batch.delete(doc.ref));
                    
                    const formDocRef = doc(db, 'contact_forms', formId);
                    batch.delete(formDocRef);
                }
                await batch.commit();
            } catch (error) {
                console.error("Błąd podczas usuwania formularzy i ich wiadomości:", error);
                showMessage({ message: 'Błąd', description: 'Nie udało się usunąć formularzy. Odśwież listę, aby zobaczyć aktualny stan.', type: 'danger', position: 'bottom', floating: true, backgroundColor: themeColors.danger, color: '#fff', style: { borderRadius: 8, marginHorizontal: 12, paddingVertical: 8 } });
            }
        };
        
        showModal({
            title: selectedItems.length > 1 ? `Usuń formularze (${selectedItems.length})` : 'Usuń formularz',
            message: 'Czy na pewno chcesz trwale usunąć zaznaczone formularze i wszystkie ich wiadomości? Tej operacji nie można cofnąć.',
            confirmText: 'Usuń',
            cancelText: 'Anuluj',
            onConfirm: performDelete,
            variant: 'destructive'
        });
    };

    const headerOpacityAnim = useSharedValue(selectionMode ? 1 : 0);
    useEffect(() => { headerOpacityAnim.value = withTiming(selectionMode ? 1 : 0, { duration: ANIM_FADE_DURATION }); }, [selectionMode]);
    const defaultHeaderStyle = useAnimatedStyle(() => ({ opacity: 1 - headerOpacityAnim.value }));
    const selectionHeaderStyle = useAnimatedStyle(() => ({ opacity: headerOpacityAnim.value }));

    return (
        <TabTransition tabIndex={1} style={{ flex: 1, backgroundColor: themeColors.background }}>
            <ConfirmationModal
                visible={!!modalConfig}
                onClose={closeModal}
                title={modalConfig?.title || ''}
                message={modalConfig?.message || ''}
                confirmText={modalConfig?.confirmText || ''}
                cancelText={modalConfig?.cancelText}
                variant={modalConfig?.variant}
                onConfirm={() => {
                    const onConfirmAction = modalConfig?.onConfirm;
                    closeModal();
                    if (onConfirmAction) {
                        setTimeout(() => { try { onConfirmAction(); } catch (e) { console.error(e); } }, 320);
                    }
                }}
            />
            <View style={styles.headerArea}>
                <Animated.View style={[styles.headerWrapper, defaultHeaderStyle]} pointerEvents={!selectionMode ? 'auto' : 'none'}>
                    <View style={[styles.mainHeader, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
                        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Formularze</Text>
                    </View>
                </Animated.View>
                <Animated.View style={[styles.headerWrapper, selectionHeaderStyle]} pointerEvents={selectionMode ? 'auto' : 'none'}>
                    <View style={[styles.mainHeader, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border, justifyContent: 'space-between' }]}>
                        <TouchableOpacity onPress={exitSelectionMode}><Text style={{ color: themeColors.tint, fontSize: 17, fontWeight: '600' }}>Anuluj</Text></TouchableOpacity>
                        <Text style={[styles.selectionTitle, {color: themeColors.text}]}>{`Zaznaczono: ${selectedItems.length}`}</Text>
                        <TouchableOpacity onPress={handleDeleteSelected} disabled={selectedItems.length === 0}>
                            <Ionicons name="trash-outline" size={24} color={selectedItems.length > 0 ? themeColors.danger : themeColors.textMuted} />
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>

            {loading && forms.length === 0 ? 
                <ActivityIndicator style={{ flex: 1 }} size="large" color={themeColors.tint} /> :
                <FlatList
                    data={sortedForms}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <FormListItem 
                            item={item} 
                            themeColors={themeColors} 
                            selectionMode={selectionMode} 
                            isSelected={selectedItems.includes(item.id)} 
                            onSelect={handleSelect} 
                            onDeselect={handleDeselect} 
                        />
                    )}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="mail-outline" size={50} color={themeColors.textMuted} />
                            <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>Twoja skrzynka jest pusta</Text>
                        </View>
                    }
                    contentContainerStyle={styles.listContainer}
                    ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: themeColors.border }]} />}
                    extraData={{ selectionMode, selectedItems }}
                />
            }

        </TabTransition>
    );
};

const styles = StyleSheet.create({
    headerArea: { height: 95 },
    headerWrapper: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%' },
    mainHeader: { paddingTop: 50, paddingBottom: 15, paddingHorizontal: 20, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', height: '100%' },
    headerTitle: { fontSize: 24, fontWeight: 'bold' },
    selectionTitle: { fontSize: 18, fontWeight: 'bold' },
    listContainer: { paddingBottom: 20 },
    itemContainer: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
    checkboxContainer: { position: 'absolute', left: 15, top: 12, bottom: 12, justifyContent: 'center' },
    slidingContainer: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    avatarText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
    textContainer: { flex: 1, justifyContent: 'center' },
    lineOne: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
    contactName: { fontSize: 16 },
    timestamp: { fontSize: 13, marginLeft: 8 },
    lineTwo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    subject: { fontSize: 14, flexShrink: 1, marginRight: 10 },
    unreadDot: { width: 9, height: 9, borderRadius: 5, marginLeft: 5 },
    separator: { height: 1, marginLeft: 68 }, 
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 150 },
    emptyText: { marginTop: 16, fontSize: 16 },
});

export default FormsListScreen;
