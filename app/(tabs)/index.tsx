
import { useChatContext } from '@/app/contexts/ChatProvider';
import { hideNotificationForChat } from '@/app/contexts/NotificationContext';
import TabTransition from '@/components/TabTransition';
import { addAnimationListener, getAnimationsEnabled, removeAnimationListener } from '@/components/animationPreference';
import { ANIM_FADE_DURATION, ANIM_TRANSLATE_DURATION } from '@/constants/animations';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useDarkBars } from '@/hooks/useSystemBars';
import { db } from '@/lib/firebase';
import { deleteCollectionInBatches } from '@/lib/firestore-utils';
import { addPendingDelete, removePendingDelete } from '@/lib/pendingDeletes';
import toast from '@/lib/toastController';
import { Chat, User } from '@/schemas';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { collection, deleteDoc, doc } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, FlatList, PixelRatio, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { Gesture, GestureDetector, NativeViewGestureHandler } from 'react-native-gesture-handler';
import PagerView from 'react-native-pager-view';
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity) as any;
const AnimatedText = Animated.createAnimatedComponent(Text) as any;

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList) as unknown as typeof FlatList;

import { ConfirmationModal } from '@/components/ConfirmationModal';

const ITEM_HEIGHT = 84; // approximate fixed height for chat items to help FlatList layout calculation


const statusColors = {
    active: '#3CB371',
    waiting: '#F2C037',
    closed: '#9B9B9B'
};


// Animation constants (shared across tabs)


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

// Lighten a hex color by moving it towards white by `amount` (0..1).
const lightenHex = (hex: string, amount = 0.35) => {
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

const SEPARATOR_THICKNESS = 3 / PixelRatio.get();

const styles = StyleSheet.create({
    headerSlot: { height: 110, /* removed borderBottomWidth to avoid straight hairline */ shadowColor: '#000', shadowOffset: { width: 0, height: 1.2 }, shadowOpacity: 0.08, shadowRadius: 2.5, elevation: 2 },
    headerLayer: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%', zIndex: 6, elevation: 12 },
    headerContent: { paddingTop: 6, paddingBottom: 8, paddingHorizontal: 20, flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', height: '100%' },
    headerTitle: { fontSize: 24, fontWeight: 'bold', marginTop: -40 },
    headerSubtitle: { fontSize: 12, fontWeight: '600', marginTop: -32 },
    selectionTitle: { fontSize: 18, fontWeight: 'bold' },
    filterOuterContainer: { height: 38, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row',
        // slightly stronger subtle shadow for filter row (reduced visual weight)
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1.0 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
        elevation: 1,
        zIndex: 10
    },
    filterContentContainer: { alignItems: 'center', paddingHorizontal: 8 },
    filterButton: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 16, marginHorizontal: 4 },
    filterText: { fontSize: 12, fontWeight: '600' },
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
    contentCard: { flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', marginTop: -18, paddingTop: 18 },
    headerIndicatorContainer: { width: '100%', alignItems: 'flex-start', paddingLeft: 20, marginTop: 6 },
    headerIndicatorText: { color: 'rgba(255,255,255,0.95)', fontWeight: '700', fontSize: 13 },
    headerIndicatorBar: { height: 3, width: 56, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.95)', marginTop: 6 },
    filterChipsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, marginTop: -12, marginLeft: -4 },
    filterSeparator: { position: 'absolute', left: 0, right: 0, height: SEPARATOR_THICKNESS, bottom: 0 },
    chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'transparent', marginRight: 4, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
    chipText: { fontSize: 13, fontWeight: '600' },
    chipActive: { backgroundColor: '#0b84ff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 2 },
});

type FilterType = 'all' | 'active' | 'waiting' | 'closed';

interface ChatListItemProps {
    item: Chat;
    themeColors: { [key: string]: string };
    filter: FilterType;
    selectionModeRef?: React.MutableRefObject<boolean>;
    selectionMode?: boolean;
    onSelect: (id: string) => void;
    onDeselect: (id: string) => void;
    isSelected: boolean;
    assignedAdmin?: User | null;
    itemIndex?: number;
}

const PERF_DEBUG = !!(global as any).__PERF_DEBUG__ || false;

const ChatListItemComponent = ({ item, themeColors, filter, selectionModeRef, selectionMode = false, onSelect, onDeselect, isSelected, assignedAdmin, itemIndex = 0 }: ChatListItemProps) => {
    const router = useRouter();
    const [isPressed, setIsPressed] = useState(false);
    const _pressHandledRef = useRef(false);

    // PERF: render timing (diagnostic, no-op unless __PERF_DEBUG__ is true)
    const _renderStartRef = useRef<number | null>(null);
    if (PERF_DEBUG) _renderStartRef.current = Date.now();
    useEffect(() => {
        if (!PERF_DEBUG) return;
        const dur = Date.now() - (_renderStartRef.current || 0);
        if (dur > 8) console.warn(`[perf][ChatListItem] render ${item.id} ${dur}ms`);
    });

    // `selectionMode` prop drives rendering; `selectionModeRef` remains for handlers to read immediately without rerendering

    const formattedTimestamp = useMemo(() => {
        const ts = item.lastMessageTimestamp;
        if (!ts) return '';
        const date = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts as any));
        const now = new Date();

        const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
        const daysDiff = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / (1000 * 60 * 60 * 24));

        // Today -> show time
        if (daysDiff === 0) return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

        // Yesterday
        if (daysDiff === 1) return 'wczoraj';

        // Within last week -> weekday short (e.g., "śr.")
        if (daysDiff > 1 && daysDiff < 7) {
            const weekday = new Intl.DateTimeFormat('pl-PL', { weekday: 'short' }).format(date);
            return weekday;
        }

        // Older -> show day + short month, include year if different
        const day = date.getDate();
        const monthShort = new Intl.DateTimeFormat('pl-PL', { month: 'short' }).format(date);
        if (date.getFullYear() === now.getFullYear()) {
            return `${day} ${monthShort}`;
        }
        return `${day} ${monthShort} ${date.getFullYear()}`;
    }, [item.lastMessageTimestamp]);

    const handlePress = () => {
        // If we already handled selection on pressIn, ignore the subsequent onPress to avoid double-toggle
        if (_pressHandledRef.current) { _pressHandledRef.current = false; return; }

        if (selectionModeRef?.current || selectionMode) {
            isSelected ? onDeselect(item.id) : onSelect(item.id);
        } else {
            setIsPressed(true);
            const contactName = encodeURIComponent(item.userInfo.contact || '');
            try { hideNotificationForChat?.(item.id); } catch (e) { /* ignore */ }
            try { console.time('openChat'); } catch (e) { /* ignore */ }
            setIsPressed(false);
            router.push((`/conversation/${item.id}?status=${item.status}&lastFilter=${filter}&contactName=${contactName}`) as any);
        }
    };

    const handlePressInSelection = () => {
        if (selectionModeRef?.current || selectionMode) {
            _pressHandledRef.current = true;
            isSelected ? onDeselect(item.id) : onSelect(item.id);
        }
    };

    const handleLongPress = () => {
        if (!(selectionModeRef?.current || selectionMode)) {
            onSelect(item.id);
        }
    };

    useEffect(() => {
        return () => {};
    }, []);
    
    const animatedContentStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: withTiming(selectionMode ? 40 : 0, { duration: ANIM_TRANSLATE_DURATION, easing: Easing.inOut(Easing.ease) }) }]
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

    const separatorColor = lightenHex(themeColors.border, 0.6);

    return (
        <Pressable onPress={handlePress} onPressIn={handlePressInSelection} onLongPress={handleLongPress} style={[styles.itemContainer, { borderBottomWidth: 0 }, (isSelected || isPressed) && { backgroundColor: themeColors.selection }]}>
            {/* Checkbox: animated entering/exiting to match other tabs */}
            {selectionMode && (
                <Animated.View entering={FadeIn.duration(ANIM_FADE_DURATION)} exiting={FadeOut.duration(ANIM_FADE_DURATION)} style={styles.checkboxContainer} pointerEvents={isSelected ? 'auto' : 'none'}>
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
                    {isUnread && (
                        <View style={[styles.unreadBadge, { backgroundColor: themeColors.tint, borderColor: themeColors.background }]}>
                            <Text style={styles.unreadCount}>{unreadCountForBadge}</Text>
                        </View>
                    )}
                    {assignedAdmin && (
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
                <Text style={[styles.timestamp, { color: themeColors.textMuted }]}>{formattedTimestamp}</Text>
                <View style={statusInfo.style}><Text style={styles.statusText}>{statusInfo.text}</Text></View>
            </View>
            <View style={{ position: 'absolute', left: 6, right: 6, bottom: 0, height: SEPARATOR_THICKNESS, backgroundColor: separatorColor }} />
        </Pressable>
    );
};

const ChatListItem = React.memo(ChatListItemComponent, (prev, next) => {
    // Quick checks that should prevent re-render in common cases
    const sameId = prev.item.id === next.item.id;
    const sameSelected = prev.isSelected === next.isSelected;
    const sameAssigned = (prev.assignedAdmin?.id || null) === (next.assignedAdmin?.id || null);

    // If selection mode changed, re-render so items can slide in/out
    if ((prev.selectionMode || false) !== (next.selectionMode || false)) return false;

    if (!sameId || !sameSelected || !sameAssigned) return false; // Different - re-render

    // Check key mutable fields that should trigger an update when changed
    if (prev.item.lastMessage !== next.item.lastMessage) return false;
    if ((prev.item.lastMessageSender || null) !== (next.item.lastMessageSender || null)) return false;
    if ((prev.item.status || null) !== (next.item.status || null)) return false;
    if ((prev.item.userIsBanned || false) !== (next.item.userIsBanned || false)) return false;
    if ((prev.item.adminUnread || 0) !== (next.item.adminUnread || 0)) return false;
    if ((prev.item.userUnread || 0) !== (next.item.userUnread || 0)) return false;

    // Compare timestamps using numeric millis if present
    const prevTs = prev.item.lastMessageTimestamp && (prev.item.lastMessageTimestamp as any).toMillis ? (prev.item.lastMessageTimestamp as any).toMillis() : (prev.item.lastMessageTimestamp || 0);
    const nextTs = next.item.lastMessageTimestamp && (next.item.lastMessageTimestamp as any).toMillis ? (next.item.lastMessageTimestamp as any).toMillis() : (next.item.lastMessageTimestamp || 0);
    if (prevTs !== nextTs) return false;

    return true; // Same - skip re-render
});

const ActiveChatsScreen = () => {
    const theme = useColorScheme() ?? 'light';
    const themeColors = useMemo(() => ({ ...Colors[theme], selection: theme === 'light' ? '#E8F0FE' : '#2A2A3D', danger: '#FF3B30' }), [theme]);
    const subtleBorder = lightenHex(themeColors.border, 0.80);
    useDarkBars('#2b2f33');
    const { displayName } = useAuth();
    const navigation = useNavigation();
    const router = useRouter();
    const params = useLocalSearchParams<{ lastFilter?: string }>();
    
    const [filter, setFilter] = useState<FilterType>((params.lastFilter as FilterType) || 'all');
    const currentFilterRef = useRef<FilterType>(filter);
    const { chats: allChats, loading, setChats, admins, loadMore, hasMore, isLoadingMore } = useChatContext(); 
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedChats, setSelectedChats] = useState<string[]>([]);
    const [modalConfig, setModalConfig] = useState<{ title: string; message: string; confirmText: string; onConfirm: () => void; cancelText?: string; variant?: 'destructive' | 'secondary'; } | null>(null);
    // Prevent other modals from appearing immediately after this one closes (fixes the brief flash/blue-dot on web)
    const modalLockRef = useRef(false);
    const modalTimerRef = useRef<number | null>(null);



    // Shared ref to track selection mode without forcing rerenders
    const selectionModeRef = useRef(selectionMode);
    useEffect(() => { selectionModeRef.current = selectionMode; }, [selectionMode]);

    // Selected set for fast lookup; used in stable renderItem to avoid O(n) includes
    const selectedSet = useMemo(() => new Set(selectedChats), [selectedChats]);

    // NOTE: renderItem is defined *after* handlers (handleSelect / handleDeselect) to avoid Temporal Dead Zone errors
    // See below where it is defined.

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

        // clear any pending modal shows
        if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }

        setModalConfig(null);
        modalLockRef.current = true;
        try { if (typeof window !== 'undefined') { (window as any).__modalIsClosing = true; (window as any).__modalSuppressedUntil = Date.now() + 280; } } catch(e) {}
        setTimeout(() => { try { if (typeof window !== 'undefined') (window as any).__modalIsClosing = false; } catch(e) {} modalLockRef.current = false; }, 260);
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
            if (typeof window !== 'undefined') {
                const until = (window as any).__modalSuppressedUntil || 0;
                const now = Date.now();
                if (now < until) {
                    const delay = until - now + 40;
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

    const enterSelectionMode = () => {
        // Ensure selection logic flips immediately for handlers (so taps start selecting immediately)
        selectionModeRef.current = true;
        setSelectionMode(true);
    };

    const exitSelectionMode = () => {
        // Immediately clear selection state so UI highlights disappear at once
        selectionModeRef.current = false;
        setSelectionMode(false);
        setSelectedChats([]);
    };

    const handleSelect = useCallback((chatId: string) => {
        if (!selectionMode) {
            enterSelectionMode();
            setSelectedChats(prev => [...prev, chatId]);
        } else {
            setSelectedChats(prev => [...prev, chatId]);
        }
    }, [selectionMode]);

    const handleDeselect = useCallback((chatId: string) => {
        setSelectedChats(prev => {
            const newSelection = prev.filter(id => id !== chatId);
            if (newSelection.length === 0) exitSelectionMode();
            return newSelection;
        });
    }, []);

    // ========== CLEAN JELLY + SCROLL LOGIC ==========
    // Jelly is ONLY for short lists (non-scrollable)
    // Long lists use pure native scroll, no handlers
    
    const pageContentHeights = useRef<Record<number, number>>({});
    const containerHeightRef = useRef<number>(0);
    const currentPageSV = useSharedValue(0);
    const canScrollSV = useSharedValue(false);
    const [canScroll, setCanScroll] = useState(false);
    

    const jellyY = useSharedValue(0);
    const JELLY_MULT = 6;
    const JELLY_RELEASE_DURATION = 120; // ms, tuned for snappier return

    const jellyStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: jellyY.value }]
    }));

    // Refs per long list
    const listRefs = useRef<Record<number, React.RefObject<any>>>({});

    // horizontal swipe between pages removed per request — Pager navigation now only via filter buttons

    // NOTE: do NOT reuse a single Gesture instance across multiple GestureDetectors.
    // Create gesture instances per-list inside render to avoid "Handler with tag X already exists".

    const handleDeleteSelected = async () => {
        const performDelete = async () => {
            const chatsToDelete = [...selectedChats];
            closeModal();
            exitSelectionMode();
            
            // mark pending deletes so live snapshot won't re-add them, then optimistic remove from UI
            try { chatsToDelete.forEach(id => addPendingDelete(id)); } catch (e) { /* ignore */ }
            const prev = allChats;
            setChats((prevChats: Chat[]) => prevChats.filter((chat: Chat) => !chatsToDelete.includes(chat.id)));
            try {
                for (const chatId of chatsToDelete) {
                    await deleteCollectionInBatches(db, collection(db, 'chats', chatId, 'messages'));
                    await deleteDoc(doc(db, 'chats', chatId));
                }
                try { setTimeout(() => { toast.show({ text: chatsToDelete.length > 1 ? `Usunięto ${chatsToDelete.length} czaty` : 'Czat usunięty', variant: 'info' }); }, 220); } catch (e) { /* ignore */ }
                // clear pending deletes
                try { chatsToDelete.forEach(id => removePendingDelete(id)); } catch (e) { /* ignore */ }
            } catch (error) {
                console.error("Błąd podczas usuwania czatów:", error);
                // rollback UI
                try { setChats(prev); } catch (e) { /* ignore */ }
                // clear pending deletes on error
                try { chatsToDelete.forEach(id => removePendingDelete(id)); } catch (e) { /* ignore */ }
            }
        };
        
        showModal({
            title: selectedChats.length > 1 ? `Usuń czaty (${selectedChats.length})` : 'Usuń czat',
            message: 'Czy na pewno chcesz trwale usunąć zaznaczone czaty? Tej operacji nie można cofnąć.',
            confirmText: 'Usuń',
            cancelText: 'Anuluj',
            onConfirm: performDelete,
            variant: 'destructive'
        });
    };
    
    const renderItem = useCallback(({ item, index }: { item: Chat, index: number }) => {
        const admin = item.assignedAdminId ? admins[item.assignedAdminId] : undefined;
        const isSelected = selectedSet.has(item.id);

        return (
            <ChatListItem
                item={item}
                themeColors={themeColors}
                filter={filter}
                selectionModeRef={selectionModeRef}
                selectionMode={selectionMode}
                isSelected={isSelected}
                onSelect={handleSelect}
                onDeselect={handleDeselect}
                assignedAdmin={admin}
                itemIndex={index}
            />
        );
    }, [admins, themeColors, filter, selectedSet, handleSelect, handleDeselect, selectionMode]);
    
    const filteredChats = useMemo(() => {
        if (filter === 'active') return allChats.filter((chat: Chat) => chat.status === 'active');
        if (filter === 'waiting') return allChats.filter((chat: Chat) => chat.status === 'waiting');
        if (filter === 'closed') return allChats.filter((chat: Chat) => chat.status === 'closed');
        
        // For 'all': return entire list (no sorting - avoids O(n log n) computation on every filter switch)
        return allChats;
    }, [allChats, filter]);

    const filters: { key: FilterType, title: string }[] = [{ key: 'all', title: 'Wszystkie' }, { key: 'active', title: 'Aktywne' }, { key: 'waiting', title: 'Oczekujące' }, { key: 'closed', title: 'Zamknięte' }];

    // keep currentPageSV in sync with selected filter and update canScrollSV accordingly
    useEffect(() => {
        const idx = Math.max(0, filters.findIndex(f => f.key === filter));
        currentPageSV.value = idx;
        const h = pageContentHeights.current[idx] || 0;
        const cs = h > containerHeightRef.current;
        canScrollSV.value = cs;
        setCanScroll(cs);
    }, [filter]);

    // Deferred filter change to keep UI responsive on Android
    const handleFilterChange = useCallback((newFilter: FilterType) => {
        // Avoid React state update here to prevent UI drops during swipe.
        currentFilterRef.current = newFilter;
    }, []);

    const pagerRef = useRef<PagerView | null>(null);
    // List refs per page to nudge stuck edge effect when detected
    // (no page list refs or pager locking here — keep FlatList behavior closer to defaults)


    // Animated filter bar: measure buttons and animate an indicator under the active one
    const btnLayouts = React.useRef<Array<{ x: number; width: number }>>([]);
    const scrollRef = React.useRef<ScrollView | null>(null);
    const indicatorX = useSharedValue(0);
    const indicatorW = useSharedValue(0);

    const indicatorStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: indicatorX.value }],
        width: indicatorW.value
    }));

    // Animated chip component driven by `currentPageSV` shared value (no React state needed)
    const AnimatedChip = ({ index, title, onPress }: { index: number; title: string; onPress: () => void; }) => {
        // Keep chip text fixed; animate only the background overlay (scale + translateY + opacity)
        const containerStyle = useAnimatedStyle(() => ({ }));

        const overlayStyle = useAnimatedStyle(() => {
            const d = Math.abs(currentPageSV.value - index);
            const t = 1 - Math.min(Math.max(d, 0), 1);
            const translateY = t * 2; // slightly stronger vertical offset
            const scale = 1 + t * 0.03; // subtle scale to give depth
            const opacity = 0.95 * t; // slightly stronger max opacity
            return { opacity, transform: [{ scale }, { translateY }] };
        });

        const textActiveStyle = useAnimatedStyle(() => {
            const d = Math.abs(currentPageSV.value - index);
            const t = 1 - Math.min(Math.max(d, 0), 1);
            return { opacity: t };
        });
        const textInactiveStyle = useAnimatedStyle(() => {
            const d = Math.abs(currentPageSV.value - index);
            const t = 1 - Math.min(Math.max(d, 0), 1);
            return { opacity: 1 - t };
        });

        return (
            <AnimatedTouchable
                onPress={() => {
                    try { currentPageSV.value = withTiming(index, { duration: ANIM_FADE_DURATION }); } catch (e) {}
                    try { pagerRef.current?.setPage(index); } catch (e) {}
                    try { currentFilterRef.current = filters[index].key as FilterType; } catch (e) {}
                    if (onPress) onPress();
                }}
                style={[styles.chip, containerStyle]}
            >
                <Text style={[styles.chipText, { color: themeColors.textMuted }]} numberOfLines={1}>{title}</Text>
                <Animated.View style={[{ position: 'absolute', left: 6, right: 6, top: 6, bottom: 6, borderRadius: 20, backgroundColor: themeColors.tint, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.14, shadowRadius: 5, elevation: 3 }, overlayStyle]} pointerEvents="none" />
                <AnimatedText style={[styles.chipText, { color: '#ffffff', position: 'absolute', left: 0, right: 0, textAlign: 'center' }, textActiveStyle]} numberOfLines={1}>{title}</AnimatedText>
            </AnimatedTouchable>
        );
    };

    const FilterButtons = useMemo(() => {
        return (
            <ScrollView
                ref={scrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.filterContentContainer, { position: 'relative' }]}
            >
                <Animated.View
                    style={[
                        {
                            position: 'absolute',
                            height: 32,
                            bottom: 6,
                            borderRadius: 16,
                            backgroundColor: themeColors.tint,
                            left: 0
                        },
                        indicatorStyle,
                        // subtle shadow for the indicator
                        { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 2 }
                    ]}
                    pointerEvents="none"
                />
                {filters.map((f, i) => (
                    <TouchableOpacity
                        key={f.key}
                        onLayout={(e) => {
                            const { x, width } = e.nativeEvent.layout;
                            btnLayouts.current[i] = { x, width };
                            if (f.key === filter) {
                                try {
                                    indicatorX.value = withTiming(x, { duration: ANIM_FADE_DURATION });
                                    indicatorW.value = withTiming(width, { duration: ANIM_FADE_DURATION });
                                } catch (e) {}
                            }
                        }}
                        onPress={() => { try { pagerRef.current?.setPage(i); } catch (e) {} handleFilterChange(f.key); }}
                        style={[styles.filterButton, filter === f.key && { backgroundColor: 'transparent' }]}
                    >
                        <Text style={[styles.filterText, { color: filter === f.key ? 'white' : themeColors.textMuted }]}>{f.title}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        );
    }, [filter, themeColors.tint, themeColors.textMuted, handleFilterChange, indicatorStyle]);

    // animate indicator and scroll to make it visible when filter changes
    useEffect(() => {
        const idx = filters.findIndex(f => f.key === filter);
        const layout = btnLayouts.current[idx];
        if (layout) {
            try {
                indicatorX.value = withTiming(layout.x, { duration: ANIM_FADE_DURATION });
                indicatorW.value = withTiming(layout.width, { duration: ANIM_FADE_DURATION });
                // scroll so the button is visible (try to center a bit)
                const scrollTo = Math.max(0, layout.x - 40);
                try { scrollRef.current?.scrollTo({ x: scrollTo, animated: true }); } catch (e) {}
            } catch (e) {}
        }
    }, [filter]);

    // Create a fresh Gesture instance per page to avoid reusing the same Gesture
    // (prevent "Handler with tag X already exists" errors).
    const makeGestureForPage = useCallback((pageIndex: number) => {
        const isScrollable = pageContentHeights.current[pageIndex] ? pageContentHeights.current[pageIndex] > containerHeightRef.current : false;
        if (isScrollable) return Gesture.Tap();

        return Gesture.Pan()
            .activeOffsetY([-8, 8])
            .failOffsetX([-14, 14])
            .onUpdate((e) => {
                if (canScrollSV.value) return;
                const damped = Math.tanh(e.translationY / 90) * JELLY_MULT;
                jellyY.value = damped;
            })
            .onEnd(() => {
                try { cancelAnimation(jellyY); } catch (e) {}
                jellyY.value = withTiming(0, { duration: JELLY_RELEASE_DURATION, easing: Easing.out(Easing.cubic) });
            });
    }, []);

    const [animationsEnabledLocal, setAnimationsEnabledLocal] = useState(true);
    const [reduceMotionLocal, setReduceMotionLocal] = useState(false);

    // previously moved bounce state is declared earlier

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

    const headerOpacityAnim = useSharedValue(selectionMode ? 1 : 0);
    useEffect(() => { headerOpacityAnim.value = withTiming(selectionMode ? 1 : 0, { duration: ANIM_FADE_DURATION }); }, [selectionMode]);
    const defaultHeaderStyle = useAnimatedStyle(() => ({ opacity: 1 - headerOpacityAnim.value }));
    const selectionHeaderStyle = useAnimatedStyle(() => ({ opacity: headerOpacityAnim.value }));

    return (
        <TabTransition tabIndex={0} quick={true} style={{ flex: 1, backgroundColor: themeColors.background }}>
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
            {/* status bar handled via focus hook */}
            <View style={[styles.headerSlot, { backgroundColor: '#2b2f33', borderBottomColor: 'transparent' }]}>
                <Animated.View style={[styles.headerLayer, { zIndex: 6 }, defaultHeaderStyle]} pointerEvents={!selectionMode ? 'auto' : 'none'}>
                    <View style={[styles.headerContent, { paddingTop: 6, paddingBottom: 6, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}> 
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.headerTitle, { color: '#ffffff' }]}>Livechat</Text>
                        </View>
                        <View style={{ marginLeft: 12 }}>
                            <Text style={[styles.headerSubtitle, { color: 'rgba(255,255,255,0.85)', textAlign: 'right' }]}>Witaj, <Text style={{ color: '#0b84ff' }}>{displayName || 'Użytkowniku'}</Text></Text>
                        </View>
                    </View>
                    
                </Animated.View>
                <Animated.View style={[styles.headerLayer, { zIndex: 6 }, selectionHeaderStyle]} pointerEvents={selectionMode ? 'auto' : 'none'}>
                    <View style={[styles.headerContent, { justifyContent: 'space-between', paddingTop: 0, paddingBottom: 6, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }]}> 
                        <Pressable onPress={exitSelectionMode} style={{ padding: 8, marginTop: -36 }}>
                            <Ionicons name="arrow-back" size={24} color={'#ffffff'} />
                        </Pressable>
                        <Text style={[styles.selectionTitle, { color: '#ffffff', textAlign: 'center', marginTop: -36 }]}>{`Zaznaczono: ${selectedChats.length}`}</Text>
                        <Pressable onPress={handleDeleteSelected} disabled={selectedChats.length === 0} style={{ padding: 8, marginTop: -36 }}>
                            <Ionicons name="trash-outline" size={24} color={selectedChats.length > 0 ? themeColors.danger : 'rgba(255,255,255,0.7)'} />
                        </Pressable>
                    </View>
                </Animated.View>
            </View>

            <View style={{ flex: 1 }} onLayout={(e) => { containerHeightRef.current = e.nativeEvent.layout.height; const h = pageContentHeights.current[currentPageSV.value] || 0; const cs = h > containerHeightRef.current; canScrollSV.value = cs; setCanScroll(cs); }}>
                <View style={[styles.contentCard, { backgroundColor: themeColors.card, marginTop: -48, paddingTop: 6 }]}> 
                    <View style={{ paddingHorizontal: 10 }}>
                        <View style={[styles.filterChipsRow, { paddingBottom: 6, position: 'relative' }]}> 
                            {/* Animated sliding highlight removed per request — keep chipActive visual only */}
                            {filters.map((f, i) => (
                                    <AnimatedChip
                                        key={f.key}
                                        index={i}
                                        title={f.title}
                                        onPress={() => { try { handleFilterChange(f.key as FilterType); } catch (e) {} }}
                                    />
                                ))}
                            <View pointerEvents="none" style={[styles.filterSeparator, { backgroundColor: lightenHex(themeColors.border, 0.76) }]} />
                        </View>
                        {/* separator removed as requested */}
                    </View>
                {loading && allChats.length === 0 ? (
                    <ActivityIndicator style={{ flex: 1, justifyContent: 'center' }} />
                ) : (
                    <View style={{ flex: 1 }}>
                    <PagerView
                            ref={pagerRef}
                            style={{ flex: 1 }}
                            initialPage={currentPageSV.value}
                            orientation="horizontal"
                            
                            onPageSelected={(e) => {
                                const pos = e.nativeEvent.position;
                                const k = filters[pos]?.key as FilterType | undefined;
                                const h = pageContentHeights.current[pos] || 0;
                                const cs = h > containerHeightRef.current;
                                canScrollSV.value = cs;
                                // Update shared value and mutable ref only (no React setState) to avoid jank
                                try { currentPageSV.value = pos; } catch (e) {}
                                if (k) { currentFilterRef.current = k; }
                            }}
                            onPageScroll={(e) => {
                                try {
                                    const { position, offset } = e.nativeEvent as any;
                                    const floatPos = position + (offset || 0);
                                    const idx = Math.floor(floatPos);
                                    const t = floatPos - idx;
                                    const a = btnLayouts.current[idx] || { x: 0, width: 0 };
                                    const b = btnLayouts.current[idx + 1] || a;
                                    const lerp = (v1: number, v2: number, u: number) => v1 + (v2 - v1) * u;
                                    const x = lerp(a.x ?? 0, b.x ?? 0, t);
                                    const w = lerp(a.width ?? 0, b.width ?? 0, t);
                                    try { indicatorX.value = x; indicatorW.value = w; } catch (e) {}
                                } catch (e) { /* ignore */ }
                            }}
                        >
                            {filters.map((f, pageIndex) => {
                                const pageData = ((): Chat[] => {
                                    if (f.key === 'active') return allChats.filter((chat: Chat) => chat.status === 'active');
                                    if (f.key === 'waiting') return allChats.filter((chat: Chat) => chat.status === 'waiting');
                                    if (f.key === 'closed') return allChats.filter((chat: Chat) => chat.status === 'closed');
                                    return allChats;
                                })();

                                return (
                                    <View key={f.key} style={{ flex: 1 }}>
                                        { (pageContentHeights.current[pageIndex] ? pageContentHeights.current[pageIndex] > containerHeightRef.current : false) ? (
                                            (() => {
                                                if (!listRefs.current[pageIndex]) listRefs.current[pageIndex] = React.createRef<FlatList>();
                                                const listRef = listRefs.current[pageIndex];
                                                // Scrollable lists MUST be pure native scroll — no gesture wrappers, no jelly logic.
                                                return (
                                                    <View style={{ flex: 1 }}>
                                                        <NativeViewGestureHandler simultaneousHandlers={pagerRef}>
                                                            <FlatList<Chat>
                                                                ref={listRef as any}
                                                                data={pageData}
                                                                scrollEnabled={true}
                                                                decelerationRate="fast"
                                                                overScrollMode="auto"
                                                                bounces={true}
                                                                alwaysBounceVertical={true}
                                                            keyExtractor={(item) => item.id}
                                                            renderItem={({ item, index }) => (
                                                                <ChatListItem
                                                                    item={item}
                                                                    themeColors={themeColors}
                                                                    filter={f.key as FilterType}
                                                                    selectionModeRef={selectionModeRef}
                                                                    selectionMode={selectionMode}
                                                                    isSelected={selectedSet.has(item.id)}
                                                                    onSelect={handleSelect}
                                                                    onDeselect={handleDeselect}
                                                                    assignedAdmin={admins[item.assignedAdminId || '']}
                                                                    itemIndex={index}
                                                                />
                                                            )}
                                                            getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index + 10, index })}
                                                            ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 40, color: themeColors.textMuted }}>Brak czatów w tej kategorii</Text>}
                                                            ListFooterComponent={isLoadingMore ? (<ActivityIndicator style={{ marginVertical: 12 }} />) : null}
                                                            style={{ backgroundColor: themeColors.background }}
                                                            contentContainerStyle={{ paddingTop: 0 }}
                                                            extraData={selectionMode}
                                                            onEndReached={() => { if (hasMore) loadMore(); }}
                                                            onEndReachedThreshold={0.5}
                                                            onContentSizeChange={(_, h) => { pageContentHeights.current[pageIndex] = h; if (currentPageSV.value === pageIndex) { const cs = h > containerHeightRef.current; canScrollSV.value = cs; setCanScroll(cs); } }}
                                                            scrollEventThrottle={16}
                                                        />
                                                        </NativeViewGestureHandler>
                                                    </View>
                                                );
                                            })()
                                        ) : (
                                            <GestureDetector gesture={makeGestureForPage(pageIndex)}>
                                                <Animated.View style={[{ flex: 1 }, jellyStyle]}>
                                                    <AnimatedFlatList<Chat>
                                                        data={pageData}
                                                        overScrollMode="auto"
                                                        bounces={false}
                                                        decelerationRate={0.2}
                                                        nestedScrollEnabled={true}
                                                        keyExtractor={(item) => item.id}
                                                        renderItem={({ item, index }) => (
                                                            <ChatListItem
                                                                item={item}
                                                                themeColors={themeColors}
                                                                filter={f.key as FilterType}
                                                                selectionModeRef={selectionModeRef}
                                                                selectionMode={selectionMode}
                                                                isSelected={selectedSet.has(item.id)}
                                                                onSelect={handleSelect}
                                                                onDeselect={handleDeselect}
                                                                assignedAdmin={admins[item.assignedAdminId || '']}
                                                                itemIndex={index}
                                                            />
                                                        )}
                                                        removeClippedSubviews={true}
                                                        maxToRenderPerBatch={8}
                                                        initialNumToRender={8}
                                                        getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
                                                        windowSize={5}
                                                        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 40, color: themeColors.textMuted }}>Brak czatów w tej kategorii</Text>}
                                                        style={{ backgroundColor: themeColors.background }}
                                                        contentContainerStyle={{ paddingTop: 0 }}
                                                        extraData={selectionMode}
                                                        onEndReached={() => { if (hasMore) loadMore(); }}
                                                        onEndReachedThreshold={0.5}
                                                        ListFooterComponent={isLoadingMore ? (<ActivityIndicator style={{ marginVertical: 12 }} />) : null}
                                                        scrollEnabled={false}
                                                        onContentSizeChange={(_, h) => { pageContentHeights.current[pageIndex] = h; if (currentPageSV.value === pageIndex) { const cs = h > containerHeightRef.current; canScrollSV.value = cs; setCanScroll(cs); } }}
                                                    />
                                                </Animated.View>
                                            </GestureDetector>
                                        )}
                                    </View>
                                );
                            })}
                        </PagerView>
                        </View>
                )}
                </View>
            </View>

        </TabTransition>
    );
};

export default ActiveChatsScreen;
