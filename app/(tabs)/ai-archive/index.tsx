
import { ConfirmationModal } from '@/components/ConfirmationModal';
import TabTransition from '@/components/TabTransition';
import { ANIM_FADE_DURATION, ANIM_TRANSLATE_DURATION } from '@/constants/animations';
import { Colors } from '@/constants/theme';
import { db } from '@/lib/firebase';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { collection, doc, getDocs, onSnapshot, orderBy, query, writeBatch } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';


// Typy
interface AiConversation {
  id: string; 
  userContact: string;
  createdAt: any; 
  lastActivity: any; 
  messageCount: number;
}

const AiConversationListItem = ({ item, themeColors, selectionMode, isSelected, onSelect, onDeselect }: { item: AiConversation, themeColors: any, selectionMode: boolean, isSelected: boolean, onSelect: (id: string) => void, onDeselect: (id: string) => void }) => {
    const router = useRouter();
    // Wyświetlamy datę ostatniej aktywności, która odpowiada sortowaniu
    const date = item.lastActivity?.toDate ? new Date(item.lastActivity.toDate()) : new Date();

    const formattedDate = date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const formattedTime = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

    const handlePress = () => {
        if (selectionMode) {
            isSelected ? onDeselect(item.id) : onSelect(item.id);
        } else {
            // POPRAWKA: Użycie poprawnej ścieżki nawigacji
            router.push((`/ai-archive/${item.id}`) as any);
        }
    };

    const handleLongPress = () => {
        if (!selectionMode) {
            onSelect(item.id);
        }
    };

    const animatedContentStyle = useAnimatedStyle(() => {
        return {
            marginLeft: withTiming(selectionMode ? 40 : 0, { duration: ANIM_TRANSLATE_DURATION, easing: Easing.inOut(Easing.ease) }),
        };
    });

    return (
        <TouchableOpacity onPress={handlePress} onLongPress={handleLongPress} style={[styles.itemContainer, { borderBottomColor: themeColors.border }, isSelected && { backgroundColor: themeColors.selection }]}>
            {selectionMode && (
                <Animated.View entering={FadeIn.duration(ANIM_FADE_DURATION)} exiting={FadeOut.duration(ANIM_FADE_DURATION)} style={styles.checkboxContainer}>
                    <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={isSelected ? themeColors.tint : themeColors.textMuted}/>
                </Animated.View>
            )}
            <Animated.View style={[styles.slidingContainer, animatedContentStyle]}>
                 <View style={[styles.avatar, { backgroundColor: themeColors.input }]}>
                    <Ionicons name="chatbubble-ellipses-outline" size={24} color={themeColors.textMuted} />
                </View>
                <View style={styles.textContainer}>
                    <Text style={[styles.contactName, { color: themeColors.text }]}>{item.userContact || '(bez nazwy)'}</Text>
                    <Text style={[styles.infoText, { color: themeColors.textMuted }]}>Zobacz całą rozmowę</Text>
                </View>
            </Animated.View>
            <View style={styles.metaContainer}>
                <Text style={[styles.timestamp, { color: themeColors.textMuted }]}>{`${formattedDate} ${formattedTime}`}</Text>
                <Text style={[styles.messageCount, { color: themeColors.textMuted }]}>{`Wiadomości: ${item.messageCount || 0}`}</Text>
            </View>
        </TouchableOpacity>
    );
};


const AiArchiveScreen = () => {
    const theme = useColorScheme() ?? 'light';
    const themeColors = { ...Colors[theme], selection: theme === 'light' ? '#E8F0FE' : '#2A2A3D', danger: '#FF3B30' };
    const navigation = useNavigation();

    const [allConversations, setAllConversations] = useState<AiConversation[]>([]);
    const [loading, setLoading] = useState(true);
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

        // clear scheduled modal shows
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

    useEffect(() => {
        const q = query(collection(db, 'ai_conversations'), orderBy('lastActivity', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const convs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AiConversation));
            setAllConversations(convs);
            setLoading(false);
        }, (error) => { console.error("Błąd AI:", error); setLoading(false); });
        return () => unsubscribe();
    }, []);

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
            
            setAllConversations(prevConvs => prevConvs.filter(conv => !itemsToDelete.includes(conv.id)));

            try {
                const batch = writeBatch(db);
                for (const conversationId of itemsToDelete) {
                    const messagesRef = collection(db, 'ai_conversations', conversationId, 'messages');
                    const messagesSnapshot = await getDocs(messagesRef);
                    messagesSnapshot.forEach(doc => batch.delete(doc.ref));

                    const convDocRef = doc(db, 'ai_conversations', conversationId);
                    batch.delete(convDocRef);
                }
                await batch.commit();
            } catch (error) {
                console.error("Błąd podczas usuwania rozmów:", error);
            }
        };
        
        showModal({
            title: selectedItems.length > 1 ? `Usuń rozmowy (${selectedItems.length})` : 'Usuń rozmowę',
            message: 'Czy na pewno chcesz trwale usunąć zaznaczone rozmowy i wszystkie ich wiadomości? Tej operacji nie można cofnąć.',
            confirmText: 'Usuń',
            cancelText: 'Anuluj',
            onConfirm: performDelete,
            variant: 'destructive'
        });
    };
    
    const headerOpacityAnim = useSharedValue(selectionMode ? 1 : 0); // CORRECTED INITIALIZATION
    useEffect(() => { headerOpacityAnim.value = withTiming(selectionMode ? 1 : 0, { duration: ANIM_FADE_DURATION }); }, [selectionMode]);
    const defaultHeaderStyle = useAnimatedStyle(() => ({ opacity: 1 - headerOpacityAnim.value }));
    const selectionHeaderStyle = useAnimatedStyle(() => ({ opacity: headerOpacityAnim.value }));

    return (
        <TabTransition tabIndex={2} style={{ flex: 1, backgroundColor: themeColors.background }}>
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
                        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Archiwum AI</Text>
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
           
            {loading && allConversations.length === 0 ? (
                <ActivityIndicator style={{ flex: 1 }} />
            ) : (
                <FlatList
                    data={allConversations}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => <AiConversationListItem item={item} themeColors={themeColors} selectionMode={selectionMode} isSelected={selectedItems.includes(item.id)} onSelect={handleSelect} onDeselect={handleDeselect} />}
                    ListEmptyComponent={<Text style={styles.emptyListText}>Brak rozmów</Text>}
                    contentContainerStyle={{ paddingTop: 10 }}
                    extraData={{selectionMode, selectedItems}}
                />
            )}

        </TabTransition>
    );
};

const styles = StyleSheet.create({
    headerArea: { height: 95 },
    headerWrapper: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%' },
    mainHeader: { paddingTop: 50, paddingBottom: 15, paddingHorizontal: 20, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', height: '100%' },
    headerTitle: { fontSize: 24, fontWeight: 'bold' },
    selectionTitle: { fontSize: 18, fontWeight: 'bold' },
    itemContainer: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 15, alignItems: 'center', borderBottomWidth: 1 },
    checkboxContainer: { position: 'absolute', left: 15, top: 12, bottom: 12, justifyContent: 'center' },
    slidingContainer: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    textContainer: { flex: 1, justifyContent: 'center' },
    contactName: { fontSize: 16, fontWeight: '600', marginBottom: 5 },
    infoText: { fontSize: 14 },
    metaContainer: { position: 'absolute', right: 15, top: 12, bottom: 12, alignItems: 'flex-end', justifyContent: 'space-between' },
    timestamp: { fontSize: 12, marginBottom: 8 },
    messageCount: { fontSize: 12, fontWeight: '500' },
    emptyListText: { textAlign: 'center', marginTop: 50 },
});

export default AiArchiveScreen;
