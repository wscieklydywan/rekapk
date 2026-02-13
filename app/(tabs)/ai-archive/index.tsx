
import { ConfirmationModal } from '@/components/ConfirmationModal';
import TabTransition from '@/components/TabTransition';
import { ANIM_FADE_DURATION, ANIM_TRANSLATE_DURATION } from '@/constants/animations';
import { Colors } from '@/constants/theme';
import { useTapHighlight } from '@/hooks/useTapHighlight';
import { db } from '@/lib/firebase';
import { deleteCollectionInBatches } from '@/lib/firestore-utils';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StatusBar, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

// Lighten a hex color by moving it towards white by `amount` (0..1).
const lightenHex = (hex: string, amount = 0.6) => {
    try {
        if (!hex || hex[0] !== '#') return hex;
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0,2), 16);
        const g = parseInt(h.substring(2,4), 16);
        const b = parseInt(h.substring(4,6), 16);
        const nr = Math.round(r + (255 - r) * amount);
        const ng = Math.round(g + (255 - g) * amount);
        const nb = Math.round(b + (255 - b) * amount);
        const toHex = (v: number) => v.toString(16).padStart(2, '0');
        return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
    } catch (e) { return hex; }
};


// Typy
interface AiConversation {
  id: string; 
  userContact: string;
  createdAt: any; 
  lastActivity: any; 
  messageCount: number;
}

const AiConversationListItem = ({ item, themeColors, selectionMode = false, selectionModeRef, selectionModeSV, isSelected, onSelect, onDeselect }: { item: AiConversation, themeColors: any, selectionMode: boolean, selectionModeRef?: React.MutableRefObject<boolean>, selectionModeSV?: Animated.SharedValue<number>, isSelected: boolean, onSelect: (id: string) => void, onDeselect: (id: string) => void }) => {
    const router = useRouter();
    // Lighten a hex color by moving it towards white by `amount` (0..1).
    const lightenHex = (hex: string, amount = 0.6) => {
        try {
            if (!hex || hex[0] !== '#') return hex;
            const h = hex.replace('#', '');
            const r = parseInt(h.substring(0,2), 16);
            const g = parseInt(h.substring(2,4), 16);
            const b = parseInt(h.substring(4,6), 16);
            const nr = Math.round(r + (255 - r) * amount);
            const ng = Math.round(g + (255 - g) * amount);
            const nb = Math.round(b + (255 - b) * amount);
            const toHex = (v: number) => v.toString(16).padStart(2, '0');
            return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
        } catch (e) { return hex; }
    };
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
        if (selectionModeRef?.current || selectionMode) {
            isSelected ? onDeselect(item.id) : onSelect(item.id);
            return;
        }
        router.push((`/ai-archive/${item.id}`) as any);
    });

    const handleLongPress = () => {
        if (!(selectionModeRef?.current || selectionMode)) {
            onSelect(item.id);
        }
    };

    // ANIMACJA: tylko prop selectionMode steruje animacją przesuwania!
    const animatedContentStyle = useAnimatedStyle(() => {
        // use selectionModeSV (shared value) to drive a smooth UI-thread animation
        const sv = (selectionModeSV ? selectionModeSV.value : (selectionMode ? 1 : 0));
        return {
            transform: [{ translateX: sv * 40 }],
            marginRight: 0
        };
    });

    const separatorColor = lightenHex(themeColors.border, 0.6);

    return (
        <Pressable onPress={handlePress} onLongPress={handleLongPress} style={[styles.itemContainer, { borderBottomColor: separatorColor }, (isSelected || isPressed) && { backgroundColor: themeColors.selection }]}>
            <View style={[styles.checkboxContainer, { opacity: selectionMode ? 1 : 0 }]} pointerEvents={isSelected ? 'auto' : 'none'}>
                <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={isSelected ? themeColors.tint : themeColors.textMuted}/>
            </View>
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
    const subtleBorder = lightenHex(themeColors.border, 0.80);
    const navigation = useNavigation();

    const [allConversations, setAllConversations] = useState<AiConversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    // ref do natychmiastowej obsługi selection mode (jak w czatach)
    const selectionModeRef = useRef(selectionMode);
    useEffect(() => { selectionModeRef.current = selectionMode; }, [selectionMode]);
    const [canScroll, setCanScroll] = useState(false);
    const [modalConfig, setModalConfig] = useState<any>(null);
    const modalLockRef = useRef(false);
    const modalTimerRef = useRef<number | null>(null);
    const containerHeightRef = useRef<number>(0);
    const contentHeightRef = useRef<number>(0);
    const jellyY = useSharedValue(0);
    const canScrollSV = useSharedValue(false);
    // Shared value to drive selection-mode slide animation reliably from UI thread
    const selectionModeSV = useSharedValue(selectionMode ? 1 : 0);
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

    const enterSelectionMode = () => {
        selectionModeRef.current = true;
        setSelectionMode(true);
        try { selectionModeSV.value = withTiming(1, { duration: ANIM_TRANSLATE_DURATION, easing: Easing.inOut(Easing.ease) } as any); } catch(e) {}
    };
    const exitSelectionMode = () => {
        selectionModeRef.current = false;
        setSelectionMode(false);
        setSelectedItems([]);
        try { selectionModeSV.value = withTiming(0, { duration: ANIM_TRANSLATE_DURATION, easing: Easing.inOut(Easing.ease) } as any); } catch(e) {}
    };

    const handleSelect = (id: string) => {
        if (!(selectionModeRef.current || selectionMode)) enterSelectionMode();
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
            <StatusBar backgroundColor="#2b2f33" barStyle="light-content" />
            <View style={[styles.headerSlot, { backgroundColor: '#2b2f33', borderBottomColor: 'transparent' }]}> 
                <Animated.View style={[styles.headerLayer, { zIndex: 10 }, defaultHeaderStyle]} pointerEvents={!selectionMode ? 'auto' : 'none'}>
                    <View style={[styles.headerContent, { paddingTop: 6, paddingBottom: 6, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}> 
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.headerTitle, { color: '#ffffff' }]}>Archiwum AI</Text>
                        </View>
                        <View style={{ marginLeft: 12 }}>
                            {/* no subtitle for this tab */}
                        </View>
                    </View>
                </Animated.View>
                <Animated.View style={[styles.headerLayer, { zIndex: 10 }, selectionHeaderStyle]} pointerEvents={selectionMode ? 'auto' : 'none'}>
                    <View style={[styles.headerContent, { justifyContent: 'space-between', paddingTop: 0, paddingBottom: 6, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }]}> 
                        <Pressable onPress={exitSelectionMode} style={{ padding: 8, marginTop: -36 }}>
                            <Ionicons name="arrow-back" size={24} color={'#ffffff'} />
                        </Pressable>
                        <Text style={[styles.selectionTitle, { color: '#ffffff', textAlign: 'center', marginTop: -36 }]}>{`Zaznaczono: ${selectedItems.length}`}</Text>
                        <Pressable onPress={handleDeleteSelected} disabled={selectedItems.length === 0} style={{ padding: 8, marginTop: -36 }}>
                            <Ionicons name="trash-outline" size={24} color={selectedItems.length > 0 ? themeColors.danger : 'rgba(255,255,255,0.7)'} />
                        </Pressable>
                    </View>
                </Animated.View>
            </View>
           
            {loading && allConversations.length === 0 ? (
                <ActivityIndicator style={{ flex: 1 }} />
            ) : (
                <View style={{ flex: 1 }} onLayout={(e) => { containerHeightRef.current = e.nativeEvent.layout.height; const cs = contentHeightRef.current > containerHeightRef.current; canScrollSV.value = cs; setCanScroll(cs); }}>
                    <View style={[styles.contentCard, { backgroundColor: themeColors.card, marginTop: -48, paddingTop: 0, zIndex: 1 }]}> 
                        <View style={[styles.contentCardInner, { backgroundColor: 'transparent' }]}> 
                            <View style={{ paddingHorizontal: 10, paddingTop: 0 }} />
                        </View>
                        { (contentHeightRef.current > containerHeightRef.current) ? (
                            <AnimatedFlatList
                                data={allConversations}
                                keyExtractor={(item) => item.id}
                                renderItem={({ item }) => <AiConversationListItemMemo item={item} themeColors={themeColors} selectionMode={selectionMode} selectionModeRef={selectionModeRef} selectionModeSV={selectionModeSV} isSelected={selectedItems.includes(item.id)} onSelect={handleSelect} onDeselect={handleDeselect} />}
                                ListEmptyComponent={<Text style={styles.emptyListText}>Brak rozmów</Text>}
                                contentContainerStyle={{ paddingTop: 0 }}
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
                                        renderItem={({ item }) => <AiConversationListItemMemo item={item} themeColors={themeColors} selectionMode={selectionMode} selectionModeRef={selectionModeRef} selectionModeSV={selectionModeSV} isSelected={selectedItems.includes(item.id)} onSelect={handleSelect} onDeselect={handleDeselect} />}
                                        ListEmptyComponent={<Text style={styles.emptyListText}>Brak rozmów</Text>}
                                        contentContainerStyle={{ paddingTop: 0 }}
                                        extraData={{selectionMode, selectedItems}}
                                        scrollEnabled={false}
                                        onContentSizeChange={(_, h) => { contentHeightRef.current = h; const cs = contentHeightRef.current > containerHeightRef.current; canScrollSV.value = cs; setCanScroll(cs); }}
                                    />
                                </Animated.View>
                            </GestureDetector>
                        )}
                    </View>
                </View>
            )}

        </TabTransition>
    );
};

const styles = StyleSheet.create({
    headerSlot: { height: 110 },
    headerLayer: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%', zIndex: 10 },
    headerContent: { paddingTop: 6, paddingBottom: 8, paddingHorizontal: 20, flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', height: '100%' },
    headerTitle: { fontSize: 24, fontWeight: 'bold', marginTop: -40 },
    selectionTitle: { fontSize: 18, fontWeight: 'bold' },
    contentCard: { flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', marginTop: -18, paddingTop: 18 },
    contentCardInner: { flex: 1, padding: 6, paddingTop: 0, paddingBottom: 0 },
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
