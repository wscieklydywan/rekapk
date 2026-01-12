
import { useChatContext } from '@/app/contexts/ChatProvider';
import TabTransition from '@/components/TabTransition';
import { addAnimationListener, getAnimationsEnabled, removeAnimationListener } from '@/components/animationPreference';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { Chat, User } from '@/schemas';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { FlatList, TouchableOpacity } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeOut, Layout, SlideInLeft, SlideInRight, SlideOutLeft, SlideOutRight, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ConfirmationModal } from '@/components/ConfirmationModal';
import { showMessage } from 'react-native-flash-message';

const statusColors = {
    active: '#3CB371',
    waiting: '#F2C037',
    closed: '#9B9B9B'
};

const getInitials = (name?: string, email?: string): string => {
    if (name) {
        const nameParts = name.split(' ').filter(p => p.trim().length > 0);
        if (nameParts.length >= 2) {
            return (nameParts[0][0] + nameParts[1][0]).toUpperCase();
        }
        if (nameParts.length === 1 && nameParts[0].length >= 2) {
            return nameParts[0].substring(0, 2).toUpperCase();
        }
        if (nameParts.length === 1) {
            return nameParts[0][0].toUpperCase();
        }
    }
    if (email) {
        return email.substring(0, 2).toUpperCase();
    }
    return 'AD'; 
};

const styles = StyleSheet.create({
    headerArea: { height: 95 },
    headerWrapper: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%' },
    headerContainer: { paddingTop: 50, paddingBottom: 15, paddingHorizontal: 20, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: '100%' },
    headerTitle: { fontSize: 24, fontWeight: 'bold' },
    headerSubtitle: { fontSize: 16, fontWeight: '600' },
    selectionTitle: { fontSize: 18, fontWeight: 'bold' },
    filterOuterContainer: { height: 44, borderBottomWidth: 1, flexDirection: 'row' },
    filterContentContainer: { alignItems: 'center', paddingHorizontal: 10 },
    filterButton: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 18, marginHorizontal: 4 },
    filterText: { fontSize: 13, fontWeight: '600' },
    itemContainer: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 15, alignItems: 'center', borderBottomWidth: 1, overflow: 'hidden' },
    checkboxContainer: { position: 'absolute', left: 15, top: 12, bottom: 12, justifyContent: 'center', alignItems: 'center' },
    slidingContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 110 },
    avatarContainer: { position: 'relative', marginRight: 10 },
    avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
    textContainer: { flex: 1, justifyContent: 'center', overflow: 'hidden' },
    metaContainer: { position: 'absolute', right: 15, top: 12, bottom: 12, alignItems: 'flex-end', justifyContent: 'space-between' },
    contactName: { fontSize: 16, fontWeight: '600' },
    lastMessage: { fontSize: 14, marginTop: 4, color: 'gray' },
    unreadMessage: { fontWeight: 'bold', color: 'black' },
    placeholderText: { fontStyle: 'italic' },
    timestamp: { fontSize: 12, marginBottom: 8 },
    unreadBadge: { position: 'absolute', top: -2, right: -4, minWidth: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
    unreadCount: { color: 'white', fontSize: 12, fontWeight: 'bold' },
    adminBadge: { position: 'absolute', bottom: -2, left: -2, width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 2, backgroundColor: '#111827' },
    adminBadgeText: { color: 'white', fontSize: 9, fontWeight: 'bold' },
    bannedOverlay: { position: 'absolute', right: -4, bottom: -4, width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    statusText: { fontSize: 11, fontWeight: 'bold', color: 'white' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 150 },
    emptyText: { marginTop: 16, fontSize: 16 },
});

type FilterType = 'all' | 'active' | 'waiting' | 'closed';

interface ChatListItemProps {
    item: Chat;
    themeColors: { [key: string]: string };
    filter: FilterType;
    selectionMode: boolean;
    onSelect: (id: string) => void;
    onDeselect: (id: string) => void;
    isSelected: boolean;
    assignedAdmin?: User | null;
}

const ChatListItem = React.memo(({ item, themeColors, filter, selectionMode, onSelect, onDeselect, isSelected, assignedAdmin }: ChatListItemProps) => {
    const router = useRouter();

    const handlePress = () => {
        if (selectionMode) {
            isSelected ? onDeselect(item.id) : onSelect(item.id);
        } else {
            const contactName = encodeURIComponent(item.userInfo.contact || '');
            router.push((`/conversation/${item.id}?status=${item.status}&lastFilter=${filter}&contactName=${contactName}`) as any);
        }
    };

    const handleLongPress = () => {
        if (!selectionMode) {
            onSelect(item.id);
        }
    };
    
    const animatedContentStyle = useAnimatedStyle(() => {
        return {
            marginLeft: withTiming(selectionMode ? 40 : 0, {
                duration: 250,
                easing: Easing.inOut(Easing.ease),
            }),
        };
    });

    const messagePreview = useMemo(() => item.lastMessage ? (item.lastMessageSender === 'admin' ? `Ty: ${item.lastMessage}` : item.lastMessage) : 'Oczekiwanie na wiadomość...', [item.lastMessage, item.lastMessageSender]);
    const isPlaceholder = useMemo(() => !item.lastMessage, [item.lastMessage]);
    
    const statusInfo = useMemo(() => {
        if (item.status === 'closed') {
            return { text: 'Zamknięty', style: [styles.statusBadge, { backgroundColor: statusColors.closed }] };
        }
        if (item.status === 'waiting') {
            return { text: 'Oczekujący', style: [styles.statusBadge, { backgroundColor: statusColors.waiting }] };
        }
        return { text: 'Aktywny', style: [styles.statusBadge, { backgroundColor: statusColors.active }] };
    }, [item.status]);

    const isUnread = useMemo(() => item.adminUnread > 0 || item.status === 'waiting', [item.adminUnread, item.status]);
    const unreadCountForBadge = useMemo(() => {
        if (item.adminUnread > 0) {
            return String(item.adminUnread);
        }
        if (item.status === 'waiting') {
            return '';
        }
        return '';
    }, [item.adminUnread, item.status]);

    return (
        <TouchableOpacity onPress={handlePress} onLongPress={handleLongPress} style={[styles.itemContainer, { borderBottomColor: themeColors.border }, isSelected && { backgroundColor: themeColors.selection }]}>
            {selectionMode && (
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.checkboxContainer}>
                    <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={isSelected ? themeColors.tint : themeColors.textMuted}/>
                </Animated.View>
            )}
            
            <Animated.View style={[styles.slidingContainer, animatedContentStyle]}>
                <View style={styles.avatarContainer}>
                    <View style={[styles.avatar, { backgroundColor: themeColors.input }]}> 
                        <Ionicons name="person-circle-outline" size={32} color={themeColors.textMuted} />
                        {item.userIsBanned && (
                            <View style={[styles.bannedOverlay, { backgroundColor: themeColors.background, borderColor: themeColors.background }]} pointerEvents="none">
                                <Ionicons name="lock-closed" size={14} color={themeColors.danger} />
                            </View>
                        )}
                    </View>
                    {isUnread && !selectionMode && (
                        <View style={[styles.unreadBadge, { backgroundColor: themeColors.tint, borderColor: themeColors.background }]}>
                            <Text style={styles.unreadCount}>{unreadCountForBadge}</Text>
                        </View>
                    )}
                    {assignedAdmin && !selectionMode && (
                        <View style={[styles.adminBadge, { borderColor: themeColors.background }]}>
                           <Text style={styles.adminBadgeText}>{getInitials(assignedAdmin.displayName, assignedAdmin.email)}</Text>
                        </View>
                   )}
                </View>
                <View style={styles.textContainer}>
                    <Text style={[styles.contactName, { color: themeColors.text }]} numberOfLines={1}>{item.userInfo.contact}</Text>
                    <Text style={[styles.lastMessage, { color: isUnread ? themeColors.text : themeColors.textMuted }, isUnread && styles.unreadMessage, isPlaceholder && styles.placeholderText]} numberOfLines={1}>{messagePreview}</Text>
                </View>
            </Animated.View>
            <View style={styles.metaContainer}>
                <Text style={[styles.timestamp, { color: themeColors.textMuted }]}>{item.lastMessageTimestamp?.toDate ? new Date(item.lastMessageTimestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</Text>
                <View style={statusInfo.style}><Text style={styles.statusText}>{statusInfo.text}</Text></View>
            </View>
        </TouchableOpacity>
    );
});

const ActiveChatsScreen = () => {
    const theme = useColorScheme() ?? 'light';
    const themeColors = { ...Colors[theme], selection: theme === 'light' ? '#E8F0FE' : '#2A2A3D', danger: '#FF3B30' };
    const { displayName } = useAuth();
    const navigation = useNavigation();
    const params = useLocalSearchParams<{ lastFilter?: string }>();
    
    const [filter, setFilter] = useState<FilterType>((params.lastFilter as FilterType) || 'all');
    const { chats: allChats, loading, setChats, admins } = useChatContext(); 
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedChats, setSelectedChats] = useState<string[]>([]);
    const [modalConfig, setModalConfig] = useState<{ title: string; message: string; confirmText: string; onConfirm: () => void; cancelText?: string; variant?: 'destructive' | 'secondary'; } | null>(null);
    // Prevent other modals from appearing immediately after this one closes (fixes the brief flash/blue-dot on web)
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

        // clear any pending modal shows
        if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }

        setModalConfig(null);
        modalLockRef.current = true;
        try { if (typeof window !== 'undefined') { (window as any).__modalIsClosing = true; (window as any).__modalSuppressedUntil = Date.now() + 720; } } catch(e) {}
        setTimeout(() => { try { if (typeof window !== 'undefined') (window as any).__modalIsClosing = false; } catch(e) {} modalLockRef.current = false; }, 660);
    };

    const showModal = (config: { title: string; message: string; confirmText?: string; onConfirm?: () => void; cancelText?: string; variant?: 'destructive' | 'secondary' }) => {
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

    const enterSelectionMode = () => setSelectionMode(true);
    const exitSelectionMode = () => {
        setSelectionMode(false);
        setSelectedChats([]);
    };

    const handleSelect = useCallback((chatId: string) => {
        if (!selectionMode) enterSelectionMode();
        setSelectedChats(prev => [...prev, chatId]);
    }, [selectionMode]);

    const handleDeselect = useCallback((chatId: string) => {
        setSelectedChats(prev => {
            const newSelection = prev.filter(id => id !== chatId);
            if (newSelection.length === 0) exitSelectionMode();
            return newSelection;
        });
    }, []);

    const handleDeleteSelected = async () => {
        const performDelete = async () => {
            const chatsToDelete = [...selectedChats];
            closeModal();
            exitSelectionMode();
            
            setChats((prevChats: Chat[]) => prevChats.filter((chat: Chat) => !chatsToDelete.includes(chat.id)));
            try {
                const batch = writeBatch(db);
                for (const chatId of chatsToDelete) {
                    const messagesRef = collection(db, 'chats', chatId, 'messages');
                    const messagesSnapshot = await getDocs(messagesRef);
                    messagesSnapshot.forEach(messageDoc => batch.delete(messageDoc.ref));
                    batch.delete(doc(db, 'chats', chatId));
                }
                await batch.commit();
            } catch (error) {
                console.error("Błąd podczas usuwania czatów:", error);
                showMessage({ message: 'Błąd', description: 'Nie udało się usunąć czatów. Odśwież listę, aby zobaczyć aktualny stan.', type: 'danger', position: 'bottom', floating: true, backgroundColor: themeColors.danger, color: '#fff', style: { borderRadius: 8, marginHorizontal: 12, paddingVertical: 8 } });
            }
        };
        
        showModal({
            title: selectedChats.length > 1 ? `Usuń czaty (${selectedChats.length})` : 'Usuń czat',
            message: 'Czy na pewno chcesz trwale usunąć zaznaczone czaty i wszystkie ich wiadomości? Tej operacji nie można cofnąć.',
            confirmText: 'Usuń',
            cancelText: 'Anuluj',
            onConfirm: performDelete,
            variant: 'destructive'
        });
    };
    
    const filteredChats = useMemo(() => {
        if (filter === 'active') return allChats.filter((chat: Chat) => chat.status === 'active');
        if (filter === 'waiting') return allChats.filter((chat: Chat) => chat.status === 'waiting');
        if (filter === 'closed') return allChats.filter((chat: Chat) => chat.status === 'closed');
        
        const activeAndWaiting = allChats.filter((chat: Chat) => chat.status !== 'closed');
        const closedChats = allChats.filter((chat: Chat) => chat.status === 'closed');
        return [...activeAndWaiting, ...closedChats];
    }, [allChats, filter]);

    const filters: { key: FilterType, title: string }[] = [{ key: 'all', title: 'Wszystkie' }, { key: 'active', title: 'Aktywne' }, { key: 'waiting', title: 'Oczekujące' }, { key: 'closed', title: 'Zamknięte' }];

    // Filter animation state & prefs
    const filterIndex = useMemo(() => filters.findIndex(f => f.key === filter), [filter]);
    const prevFilterIndexRef = useRef<number>(filterIndex);
    const [animationsEnabledLocal, setAnimationsEnabledLocal] = useState(true);
    const [reduceMotionLocal, setReduceMotionLocal] = useState(false);

    useEffect(() => {
        let mounted = true;
        getAnimationsEnabled().then(v => { if (mounted) setAnimationsEnabledLocal(v); }).catch(() => {});
        const onChange = (v: boolean) => { if (mounted) setAnimationsEnabledLocal(v); };
        addAnimationListener(onChange);
        AccessibilityInfo.isReduceMotionEnabled().then(v => { if (mounted) setReduceMotionLocal(v); }).catch(() => {});
        const reduceListener: any = (v: boolean) => { if (mounted) setReduceMotionLocal(v); };
        try {
            const maybe = (AccessibilityInfo as any).addEventListener?.('reduceMotionChanged', reduceListener);
            return () => { mounted = false; try { maybe?.remove?.(); } catch (e) {} removeAnimationListener(onChange); };
        } catch (e) { return () => { mounted = false; removeAnimationListener(onChange); }; }
    }, []);

    useEffect(() => { prevFilterIndexRef.current = filterIndex; }, [filterIndex]);

    const headerOpacityAnim = useSharedValue(selectionMode ? 1 : 0);
    useEffect(() => {
        headerOpacityAnim.value = withTiming(selectionMode ? 1 : 0, { duration: 250, easing: Easing.inOut(Easing.ease) });
    }, [selectionMode]);
    const defaultHeaderStyle = useAnimatedStyle(() => ({ opacity: 1 - headerOpacityAnim.value }));
    const selectionHeaderStyle = useAnimatedStyle(() => ({ opacity: headerOpacityAnim.value }));

    return (
        <TabTransition tabIndex={0} style={{ flex: 1, backgroundColor: themeColors.background }}>
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
                    <View style={[styles.headerContainer, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
                        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Livechat</Text>
                        <Text style={[styles.headerSubtitle, { color: themeColors.textMuted }]}>Witaj, {displayName || 'Użytkowniku'}</Text>
                    </View>
                </Animated.View>
                <Animated.View style={[styles.headerWrapper, selectionHeaderStyle]} pointerEvents={selectionMode ? 'auto' : 'none'}>
                    <View style={[styles.headerContainer, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
                        <TouchableOpacity onPress={exitSelectionMode}><Text style={{ color: themeColors.tint, fontSize: 17, fontWeight: '600' }}>Anuluj</Text></TouchableOpacity>
                        <Text style={[styles.selectionTitle, {color: themeColors.text}]}>{`Zaznaczono: ${selectedChats.length}`}</Text>
                        <TouchableOpacity onPress={handleDeleteSelected} disabled={selectedChats.length === 0}>
                            <Ionicons name="trash-outline" size={24} color={selectedChats.length > 0 ? themeColors.danger : themeColors.textMuted} />
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>

            {!selectionMode && (
                 <View style={[styles.filterOuterContainer, { borderBottomColor: themeColors.border }]}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContentContainer}>
                        {filters.map(f => (<TouchableOpacity key={f.key} onPress={() => setFilter(f.key)} style={[styles.filterButton, filter === f.key && { backgroundColor: themeColors.tint }]} ><Text style={[styles.filterText, { color: filter === f.key ? 'white' : themeColors.textMuted }]}>{f.title}</Text></TouchableOpacity>))}
                    </ScrollView>
                 </View>
            )}

            {
                // animate filter content like a single sheet — direction based on filter index diff
                (() => {
                    const shouldAnimate = animationsEnabledLocal && !reduceMotionLocal;
                    const enterDuration = shouldAnimate ? 50 : 0;
                    const exitDuration = shouldAnimate ? 40 : 0;
                    let enterAnim: any = FadeIn.duration(enterDuration);
                    let exitAnim: any = FadeOut.duration(exitDuration);
                    if (filterIndex > prevFilterIndexRef.current) {
                        enterAnim = SlideInRight.duration(enterDuration);
                        exitAnim = SlideOutLeft.duration(exitDuration);
                    } else if (filterIndex < prevFilterIndexRef.current) {
                        enterAnim = SlideInLeft.duration(enterDuration);
                        exitAnim = SlideOutRight.duration(exitDuration);
                    }

                    return (
                        <Animated.View key={`filter-${filter}`} entering={enterAnim} exiting={exitAnim} layout={Layout.duration(enterDuration)} style={{ flex: 1 }}>
                            {loading && allChats.length === 0 ? (
                                <ActivityIndicator style={{ flex: 1, justifyContent: 'center' }} />
                            ) : (
                                <FlatList<Chat>
                                    data={filteredChats}
                                    keyExtractor={(item) => item.id}
                                    renderItem={({ item }) => {
                                        const admin = item.assignedAdminId ? admins[item.assignedAdminId] : undefined;

                                        return (
                                            <ChatListItem 
                                                item={item} 
                                                themeColors={themeColors} 
                                                filter={filter} 
                                                selectionMode={selectionMode} 
                                                isSelected={selectedChats.includes(item.id)} 
                                                onSelect={handleSelect} 
                                                onDeselect={handleDeselect} 
                                                assignedAdmin={admin}
                                            />
                                        );
                                    }}
                                    ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 40, color: themeColors.textMuted }}>Brak czatów w tej kategorii</Text>}
                                    style={{ backgroundColor: themeColors.background }}
                                    contentContainerStyle={{ paddingTop: selectionMode ? 10 : 0 }}
                                    extraData={{ selectionMode, selectedChats, admins }}
                                />
                            )}
                        </Animated.View>
                    );
                })()
            }

        </TabTransition>
    );
};

export default ActiveChatsScreen;
