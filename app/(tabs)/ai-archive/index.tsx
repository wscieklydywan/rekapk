
import { ConfirmationModal } from '@/components/ConfirmationModal';
import TabTransition from '@/components/TabTransition';
import { ANIM_FADE_DURATION, ANIM_TRANSLATE_DURATION } from '@/constants/animations';
import { Colors } from '@/constants/theme';
import { useTapHighlight } from '@/hooks/useTapHighlight';
import { db } from '@/lib/firebase';
import { deleteCollectionInBatches } from '@/lib/firestore-utils';
import { showMessage } from '@/lib/showMessage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';


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

    const formattedDate = React.useMemo(() => {
        const d = date;
        const now = new Date();
        const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
        const daysDiff = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / (1000 * 60 * 60 * 24));
        const time = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

        if (daysDiff === 0) return time;
        if (daysDiff === 1) return `wczoraj o ${time}`;
        if (daysDiff > 1 && daysDiff < 7) {
            const weekday = new Intl.DateTimeFormat('pl-PL', { weekday: 'short' }).format(d);
            return `${weekday} o ${time}`;
        }
        const day = d.getDate();
        const monthShort = new Intl.DateTimeFormat('pl-PL', { month: 'short' }).format(d);
        if (d.getFullYear() === now.getFullYear()) return `${day} ${monthShort} o ${time}`;
        return `${day} ${monthShort} ${d.getFullYear()} o ${time}`;
    }, [date]);

    const { isPressed, handlePress } = useTapHighlight(() => {
        if (selectionMode) {
            // If selection mode active, do selection toggle immediately instead of navigation
            isSelected ? onDeselect(item.id) : onSelect(item.id);
            return;
        }
        router.push((`/ai-archive/${item.id}`) as any);
    });

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
        <Pressable onPress={handlePress} onLongPress={handleLongPress} style={[styles.itemContainer, { borderBottomColor: themeColors.border }, (isSelected || isPressed) && { backgroundColor: themeColors.selection }]}>
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
                <Text style={[styles.timestamp, { color: themeColors.textMuted }]}>{formattedDate}</Text>
                <Text style={[styles.messageCount, { color: themeColors.textMuted }]}>{`Wiadomości: ${item.messageCount || 0}`}</Text>
            </View>
        </Pressable>
    );
};

const AiConversationListItemMemo = React.memo(AiConversationListItem, (prev, next) => {
    const sameId = prev.item.id === next.item.id;
    const sameSelected = prev.isSelected === next.isSelected;
    const sameSelectionMode = prev.selectionMode === next.selectionMode;
    const sameCount = (prev.item.messageCount || 0) === (next.item.messageCount || 0);
    
    if (!sameId || !sameSelected || !sameSelectionMode || !sameCount) return false;
    return true;
});

const AiArchiveScreen = () => {
    const theme = useColorScheme() ?? 'light';
    const themeColors = { ...Colors[theme], selection: theme === 'light' ? '#E8F0FE' : '#2A2A3D', danger: '#FF3B30' };
    const navigation = useNavigation();

    const [allConversations, setAllConversations] = useState<AiConversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [canScroll, setCanScroll] = useState(false);
    const [modalConfig, setModalConfig] = useState<any>(null);
    const modalLockRef = useRef(false);
    const modalTimerRef = useRef<number | null>(null);
    const containerHeightRef = useRef<number>(0);
    const contentHeightRef = useRef<number>(0);
    const jellyY = useSharedValue(0);
    const canScrollSV = useSharedValue(false);
    const JELLY_MULT = 6;

    const jellyStyle = useAnimatedStyle(() => ({ transform: [{ translateY: jellyY.value }] }));

    const AnimatedFlatList = Animated.createAnimatedComponent(FlatList) as unknown as typeof FlatList;

    const makeGestureForList = useCallback(() => {
        const isScrollable = contentHeightRef.current > containerHeightRef.current;
        if (isScrollable) return Gesture.Tap();

        return Gesture.Pan()
            .activeOffsetY([-5, 5])
            .failOffsetX([-10, 10])
            .onUpdate((e) => {
                if (canScrollSV.value) return;
                const damped = Math.tanh(e.translationY / 90) * JELLY_MULT;
                jellyY.value = damped;
            })
            .onEnd(() => {
                try { cancelAnimation(jellyY); } catch (e) {}
                jellyY.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.cubic) });
            });
    }, []);
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
                setTimeout(doBlur, 60);
                setTimeout(doBlur, 120);
            } catch (e) { /* ignore */ }
        }

        // clear scheduled modal shows
        if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }

        setModalConfig(null);
        modalLockRef.current = true;
        try { if (typeof window !== 'undefined') { (window as any).__modalIsClosing = true; (window as any).__modalSuppressedUntil = Date.now() + 280; } } catch(e) {}
        setTimeout(() => { try { if (typeof window !== 'undefined') (window as any).__modalIsClosing = false; } catch(e) {} modalLockRef.current = false; }, 260);
    };

    const showModal = (config: { title: string; message?: string; confirmText?: string; onConfirm?: () => void; cancelText?: string; variant?: 'destructive' | 'secondary' }) => {
        try {
            if (typeof window !== 'undefined' && (window as any).__modalIsClosing) {
                const until = (window as any).__modalSuppressedUntil || 0;
                const now = Date.now();
                const delay = Math.max(until - now + 60, 420);
                if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }
                modalTimerRef.current = window.setTimeout(() => {
                    const safe = (v?: string) => (typeof v === 'string' && v.trim().length > 0 ? v : undefined);
                    const hadEmptyString = (config && ((config.title === '') || (config.message === '') || (config.confirmText === '')));
                    if ((global as any).__DEV__ && hadEmptyString) {
                        console.warn('showModal called with empty-string fields — normalizing to avoid blank modal', { original: config });
                        console.warn(new Error().stack);
                    }
                    const normalized = { title: safe(config?.title), message: safe(config?.message), confirmText: safe(config?.confirmText) ?? 'OK', cancelText: safe(config?.cancelText), onConfirm: config?.onConfirm, variant: config?.variant } as any;
                    if (modalLockRef.current) {
                        modalTimerRef.current = window.setTimeout(() => { setModalConfig(normalized); modalTimerRef.current = null; }, 420);
                    } else {
                        setModalConfig(normalized);
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
                            modalTimerRef.current = window.setTimeout(() => {
                                const normalized = { title: config.title ?? '', message: config.message ?? '', confirmText: config.confirmText ?? 'OK', cancelText: config.cancelText, onConfirm: config.onConfirm, variant: config.variant } as any;
                                setModalConfig(normalized);
                                modalTimerRef.current = null;
                            }, 420);
                        } else {
                            const normalized = { title: config.title ?? '', message: config.message ?? '', confirmText: config.confirmText ?? 'OK', cancelText: config.cancelText, onConfirm: config.onConfirm, variant: config.variant } as any;
                            setModalConfig(normalized);
                            modalTimerRef.current = null;
                        }
                    }, delay);
                    return;
                }
            }
        } catch(e) {}

        if (modalLockRef.current) {
            if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }
            modalTimerRef.current = window.setTimeout(() => {
                const safe = (v?: string) => (typeof v === 'string' && v.trim().length > 0 ? v : undefined);
                const hadEmptyString = (config && ((config.title === '') || (config.message === '') || (config.confirmText === '')));
                if ((global as any).__DEV__ && hadEmptyString) {
                    console.warn('showModal called with empty-string fields — normalizing to avoid blank modal', { original: config });
                    console.warn(new Error().stack);
                }
                const normalized = { title: safe(config?.title), message: safe(config?.message), confirmText: safe(config?.confirmText) ?? 'OK', cancelText: safe(config?.cancelText), onConfirm: config?.onConfirm, variant: config?.variant } as any;
                setModalConfig(normalized);
                modalTimerRef.current = null;
            }, 420);
        } else {
            const safe = (v?: string) => (typeof v === 'string' && v.trim().length > 0 ? v : undefined);
            const hadEmptyString = (config && ((config.title === '') || (config.message === '') || (config.confirmText === '')));
            if ((global as any).__DEV__ && hadEmptyString) {
                console.warn('showModal called with empty-string fields — normalizing to avoid blank modal', { original: config });
                console.warn(new Error().stack);
            }
            const normalized = { title: safe(config?.title), message: safe(config?.message), confirmText: safe(config?.confirmText) ?? 'OK', cancelText: safe(config?.cancelText), onConfirm: config?.onConfirm, variant: config?.variant } as any;
            setModalConfig(normalized);
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
            
            // optimistic remove
            const prev = allConversations;
            setAllConversations(prevConvs => prevConvs.filter(conv => !itemsToDelete.includes(conv.id)));

            try {
                // delete each conversation's messages in safe chunks, then remove its document
                for (const conversationId of itemsToDelete) {
                    await deleteCollectionInBatches(db, collection(db, 'ai_conversations', conversationId, 'messages'));
                    await deleteDoc(doc(db, 'ai_conversations', conversationId));
                }
            } catch (error) {
                console.error("Błąd podczas usuwania rozmów:", error);
                try { setAllConversations(prev); } catch (e) { /* ignore */ }
                showMessage({ message: 'Usuwanie nie powiodło się', description: 'Nie udało się usunąć rozmów — przywrócono listę.', duration: 4000, position: 'bottom', floating: true, backgroundColor: themeColors.danger + 'EE', color: '#fff', style: { alignSelf: 'center', minWidth: 260, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 16 } });
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
        <TabTransition tabIndex={2} quick={true} style={{ flex: 1, backgroundColor: themeColors.background }}>
            {modalConfig?.title && modalConfig?.confirmText && (
              <ConfirmationModal
                visible={true}
                onClose={closeModal}
                title={modalConfig.title}
                message={modalConfig.message || ''}
                confirmText={modalConfig.confirmText}
                cancelText={modalConfig.cancelText}
                variant={modalConfig.variant}
                onConfirm={() => {
                    const onConfirmAction = modalConfig?.onConfirm;
                    closeModal();
                    if (onConfirmAction) {
                        setTimeout(() => { try { onConfirmAction(); } catch (e) { console.error(e); } }, 160);
                    }
                }}
              />
            )}
            <View style={styles.headerArea}>
                 <Animated.View style={[styles.headerWrapper, defaultHeaderStyle]} pointerEvents={!selectionMode ? 'auto' : 'none'}>
                    <View style={[styles.mainHeader, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
                        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Archiwum AI</Text>
                    </View>
                </Animated.View>
                <Animated.View style={[styles.headerWrapper, selectionHeaderStyle]} pointerEvents={selectionMode ? 'auto' : 'none'}>
                    <View style={[styles.mainHeader, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border, justifyContent: 'space-between' }]}>
                        <Pressable onPress={exitSelectionMode}><Text style={{ color: themeColors.tint, fontSize: 17, fontWeight: '600' }}>Anuluj</Text></Pressable>
                        <Text style={[styles.selectionTitle, {color: themeColors.text}]}>{`Zaznaczono: ${selectedItems.length}`}</Text>
                        <Pressable onPress={handleDeleteSelected} disabled={selectedItems.length === 0}>
                            <Ionicons name="trash-outline" size={24} color={selectedItems.length > 0 ? themeColors.danger : themeColors.textMuted} />
                        </Pressable>
                    </View>
                </Animated.View>
            </View>
           
            {loading && allConversations.length === 0 ? (
                <ActivityIndicator style={{ flex: 1 }} />
            ) : (
                <View style={{ flex: 1 }} onLayout={(e) => { containerHeightRef.current = e.nativeEvent.layout.height; const cs = contentHeightRef.current > containerHeightRef.current; canScrollSV.value = cs; setCanScroll(cs); }}>
                    { (contentHeightRef.current > containerHeightRef.current) ? (
                        <AnimatedFlatList
                            data={allConversations}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => <AiConversationListItemMemo item={item} themeColors={themeColors} selectionMode={selectionMode} isSelected={selectedItems.includes(item.id)} onSelect={handleSelect} onDeselect={handleDeselect} />}
                            ListEmptyComponent={<Text style={styles.emptyListText}>Brak rozmów</Text>}
                            contentContainerStyle={{ paddingTop: 10 }}
                            extraData={{selectionMode, selectedItems}}
                            scrollEnabled={true}
                            onContentSizeChange={(_, h) => { contentHeightRef.current = h; const cs = contentHeightRef.current > containerHeightRef.current; canScrollSV.value = cs; setCanScroll(cs); }}
                        />
                    ) : (
                        <GestureDetector gesture={makeGestureForList()}>
                            <Animated.View style={[{ flex: 1 }, jellyStyle]}>
                                <AnimatedFlatList
                                    data={allConversations}
                                    keyExtractor={(item) => item.id}
                                    renderItem={({ item }) => <AiConversationListItemMemo item={item} themeColors={themeColors} selectionMode={selectionMode} isSelected={selectedItems.includes(item.id)} onSelect={handleSelect} onDeselect={handleDeselect} />}
                                    ListEmptyComponent={<Text style={styles.emptyListText}>Brak rozmów</Text>}
                                    contentContainerStyle={{ paddingTop: 10 }}
                                    extraData={{selectionMode, selectedItems}}
                                    scrollEnabled={false}
                                    onContentSizeChange={(_, h) => { contentHeightRef.current = h; const cs = contentHeightRef.current > containerHeightRef.current; canScrollSV.value = cs; setCanScroll(cs); }}
                                />
                            </Animated.View>
                        </GestureDetector>
                    )}
                </View>
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
