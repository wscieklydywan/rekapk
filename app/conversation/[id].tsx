
import { useChatContext } from '@/app/contexts/ChatProvider';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useLightBars } from '@/hooks/useSystemBars';
import { db } from '@/lib/firebase';
import { deleteCollectionInBatches } from '@/lib/firestore-utils';
import { Chat, Message, User } from '@/schemas';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, deleteDoc, doc, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, runTransaction, startAfter, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Image, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnimatedModal from '@/components/AnimatedModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import TabTransition from '@/components/TabTransition';
import { addPendingDelete, removePendingDelete } from '@/lib/pendingDeletes';
import toast from '@/lib/toastController';
import * as Clipboard from 'expo-clipboard';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import { MenuProvider } from 'react-native-popup-menu';
import Animated, { Easing, FadeIn, FadeOut, interpolate, SlideInRight, SlideOutRight, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const GROUP_THRESHOLD_MINUTES = 3;
const MESSAGES_LIMIT = 30; // max number of messages to keep in live subscription and persisted to AsyncStorage
const MESSAGES_PAGE_SIZE = 20; // number of messages to load per pagination request (older messages)
const INPUT_HEIGHT = 68;
const AVATAR_COLORS = ['#c56b66', '#8c7aa8', '#5f9ac9', '#4caaa0', '#83a869', '#e59f49', '#7c635a', '#b0b86c', '#d15f8a', '#4baadd'];

const getAvatarColor = (str?: string) => {
    if (!str) return AVATAR_COLORS[0];
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

const getInitials = (str?: string) => {
    if (!str || typeof str !== 'string') return 'U';
    const parts = str.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
};

const copyToClipboard = async (text?: string) => {
    try {
        if (!text) return;
        await Clipboard.setStringAsync(String(text));
        toast.show('Skopiowano');
    } catch (e) { /* ignore */ }
};

const formatMessageTimestamp = (d: Date) => {
    const now = new Date();
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
    const daysDiff = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / (1000 * 60 * 60 * 24));
    const time = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

    if (daysDiff === 0) return time; // today -> time only
    if (daysDiff === 1) return `wczoraj o ${time}`; // yesterday
    if (daysDiff > 1 && daysDiff < 7) {
        const weekday = new Intl.DateTimeFormat('pl-PL', { weekday: 'short' }).format(d);
        return `${weekday} o ${time}`;
    }
    const day = d.getDate();
    const monthShort = new Intl.DateTimeFormat('pl-PL', { month: 'short' }).format(d);
    if (d.getFullYear() === now.getFullYear()) return `${day} ${monthShort} o ${time}`;
    return `${day} ${monthShort} ${d.getFullYear()} o ${time}`;
};
// Diagnostics / toggles
// set to true to force a constant translateY for quick jitter diagnosis
const DIAG_FORCE_TRANSLATE = false;
// set to true to ignore safe-area insets (quick test for double-inset issues)
const DIAG_IGNORE_INSETS = false;
// Dev-only: enable verbose message subscription logging when running in dev
const DEV_MSG_LOGGING = (global as any).__DEV__ || process.env.NODE_ENV === 'development';

// In-memory cache to provide instant "messenger feel" across navigations
const inMemoryMessageCache: Map<string, { messages: any[]; lastVisible?: number; lastVisibleDocId?: string; lastVisibleDoc?: any; updatedAt?: number }> = new Map();

// TEMPORARY: disable badge/scroll-button logic for debugging freezes
const TEMP_DISABLE_BADGE = true;

// Max number of chat caches to keep in memory (LRU eviction)
const MAX_IN_MEMORY_CHATS = 8;

const setInMemoryCache = (chatId: string, payload: { messages: any[]; lastVisible?: number; lastVisibleDocId?: string; lastVisibleDoc?: any; updatedAt?: number }) => {
    try {
        // move to recent by deleting first if exists
        if (inMemoryMessageCache.has(chatId)) inMemoryMessageCache.delete(chatId);
        inMemoryMessageCache.set(chatId, payload);
        // evict oldest entries if over limit (Map preserves insertion order)
        while (inMemoryMessageCache.size > MAX_IN_MEMORY_CHATS) {
            const oldestKey = inMemoryMessageCache.keys().next().value;
            if (!oldestKey) break;
            inMemoryMessageCache.delete(oldestKey);
        }
    } catch (e) {
        /* ignore */
    }
};

const getInMemoryCache = (chatId: string) => {
    const entry = inMemoryMessageCache.get(chatId) || null;
    if (!entry) return null;
    // mark as recently used
    try { inMemoryMessageCache.delete(chatId); inMemoryMessageCache.set(chatId, entry); } catch(e) {}
    return entry;
};

const MessageBubble = ({ message, prevMessage, nextMessage, themeColors, admins, showAdminTag, onRetry, index, activeMessageId, activeMessageIndex, onToggleActive, showTimeSeparator, separatorLabel, listInverted }: { message: Message; prevMessage?: Message; nextMessage?: Message; themeColors: any; admins: { [key: string]: User }, showAdminTag?: boolean, onRetry?: (m: Message) => void, index: number, activeMessageId: string | null, activeMessageIndex: number | null, onToggleActive: (id: string | null, idx?: number) => void, showTimeSeparator?: boolean, separatorLabel?: string | null, listInverted?: boolean }) => {
    const { width: _mbWidth } = useWindowDimensions();
    const BUBBLE_MAX = Math.round((_mbWidth || 360) * 0.74);
    const isMyMessage = message.sender === 'admin';

    const PERF_DEBUG = !!(global as any).__PERF_DEBUG__ || false;
    const _mbRenderStart = useRef<number | null>(null);
    if (PERF_DEBUG) _mbRenderStart.current = Date.now();
    useEffect(() => {
        if (!PERF_DEBUG) return;
        const d = Date.now() - (_mbRenderStart.current || 0);
        if (d > 8) console.warn(`[perf][MessageBubble] ${message.id} render ${d}ms`);
    });

    if (message.sender === 'system') {
        const lowerCaseText = message.text.toLowerCase();
        const isContextMessage = lowerCaseText.includes('kontekst rozmowy z ai') || lowerCaseText.includes('koniec rozmowy z konsultantem ai');

        if (isContextMessage) {
            const cleanedText = message.text.replace(/^-+\s*|\s*-+$/g, '').trim();
            return (
                <Pressable onLongPress={() => copyToClipboard(cleanedText)} style={{ width: '100%' }}>
                    <View style={styles.dividerContainer}>
                        <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
                        <Text style={[styles.dividerText, { color: themeColors.textMuted }]}>{cleanedText}</Text>
                        <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
                    </View>
                </Pressable>
            );
        }
        return (
            <Pressable onLongPress={() => copyToClipboard(message.text)} style={{ width: '100%' }}>
                <View style={styles.systemMessageContainer}><Text style={[styles.systemMessageText, {color: '#FEFEFE'}]}>{message.text}</Text></View>
            </Pressable>
        );
    }

    const getMinutesDiff = (ts1?: Timestamp, ts2?: Timestamp) => {
        if (!ts1 || !ts2) return Infinity;
        return (ts1.toMillis() - ts2.toMillis()) / (1000 * 60);
    };
    
    const isFirstInGroup = !prevMessage || prevMessage.sender !== message.sender || (message.sender === 'admin' && prevMessage.adminId !== message.adminId) || getMinutesDiff(prevMessage.createdAt, message.createdAt) > GROUP_THRESHOLD_MINUTES;
    const isLastInGroup = !nextMessage || nextMessage.sender !== message.sender || (message.sender === 'admin' && nextMessage.adminId !== message.adminId) || getMinutesDiff(message.createdAt, nextMessage.createdAt) > GROUP_THRESHOLD_MINUTES;
    const isSolo = isFirstInGroup && isLastInGroup;

    // Admin tag logic: prefer `showAdminTag` prop (computed by parent by scanning earlier admin messages),
    // otherwise fall back to checking the immediate visual previous message (legacy behavior).
    const showAdminName = isMyMessage && message.adminId && (typeof showAdminTag === 'boolean' ? showAdminTag : (
        !prevMessage || prevMessage.sender !== 'admin' || prevMessage.adminId !== message.adminId
    ));

    const adminName = showAdminName ? (admins[message.adminId as string]?.displayName || admins[message.adminId as string]?.email) : null;

    const bubbleStyles: any[] = [styles.bubble, { maxWidth: BUBBLE_MAX }];
    // If the previous message is from a different sender, add a larger top gap.
    // If previous is same sender, keep a small gap for stacked messages.
    const interSenderGapTop = prevMessage && prevMessage.sender !== message.sender ? 12 : 1;
    // If the next message is from the same sender, make the bottom gap zero (stacked look).
    // Otherwise keep a larger gap between different-sender messages.
    const bottomGap = nextMessage && nextMessage.sender === message.sender ? 1 : 8;
    const messageRowStyle = [
        styles.row,
        isMyMessage ? styles.right : styles.left,
        { marginTop: interSenderGapTop, marginBottom: bottomGap }
    ];

    const tooltipTimerRef = useRef<number | null>(null);

    const formattedTime = React.useMemo(() => {
        if (!message.createdAt?.toDate) return '';
        return formatMessageTimestamp(new Date(message.createdAt.toDate()));
    }, [message.createdAt]);

    const isActive = activeMessageId === message.id;

    // Show/hide timestamp instantly (no animation) to avoid flaky toggle behavior
    const [showTimestampLocal, setShowTimestampLocal] = useState(false);
    useEffect(() => {
        if (isActive) {
            setShowTimestampLocal(true);
            if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
            tooltipTimerRef.current = window.setTimeout(() => {
                try { onToggleActive(null); } catch (e) { /* ignore */ }
            }, 3000);
        } else {
            if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null; }
            setShowTimestampLocal(false);
        }
        return () => { if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null; } };
    }, [isActive]);



    // clear any lingering timer when component unmounts
    useEffect(() => {
        return () => { if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current); };
    }, []);

    if (isMyMessage) {
        bubbleStyles.push(styles.myMessageBubble, { backgroundColor: themeColors.tint });
        if (isSolo) bubbleStyles.push(styles.soloBubble);
        else if (isFirstInGroup) bubbleStyles.push(styles.myBubble_first);
        else if (isLastInGroup) bubbleStyles.push(styles.myBubble_last);
        else bubbleStyles.push(styles.myBubble_middle);
    } else {
        bubbleStyles.push(message.sender === 'ai' ? styles.aiMessageBubble : styles.theirMessageBubble);
        if (isSolo) bubbleStyles.push(styles.soloBubble);
        else if (isFirstInGroup) bubbleStyles.push(styles.theirBubble_first);
        else if (isLastInGroup) bubbleStyles.push(styles.theirBubble_last);
        else bubbleStyles.push(styles.theirBubble_middle);
    }

    // Ensure touch feedback is clipped to the bubble shape (rounded corners)
    bubbleStyles.push({ overflow: 'hidden', position: 'relative' });

    return (
        <>
            {!listInverted && showTimeSeparator && separatorLabel && (
                <View style={styles.timeSeparatorFullRow} pointerEvents="none">
                    <View style={[styles.timeSeparatorPill, { backgroundColor: themeColors.input }]}> 
                        <Text style={[styles.timeSeparatorText, { color: themeColors.textMuted }]}>{separatorLabel}</Text>
                    </View>
                </View>
            )}
            <View style={messageRowStyle}>
                {!isMyMessage && (
                        <View style={styles.avatarContainer}> 
                                {isLastInGroup ? (
                                    <View style={styles.adminAvatar}>
                                        <Ionicons name="person-circle-outline" size={34} color={themeColors.textMuted} />
                                    </View>
                                ) : (
                                    <View style={{ width: 54 }} />
                                )}
                            {isLastInGroup && <Text style={[styles.timestamp, { color: themeColors.textMuted, marginTop: 6 }]}>{formattedTime}</Text>}
                        </View>
                    )}

                    <View style={[styles.stack, isMyMessage ? styles.rightStack : styles.leftStack, isMyMessage ? styles.stackPadRight : styles.stackPadLeft]}>
                        <Pressable onPress={() => onToggleActive(message.id, index)} onLongPress={() => copyToClipboard(message.text)} style={bubbleStyles}>
                        <Text style={[styles.text, isMyMessage ? styles.myMessageText : [styles.theirMessageText, { color: themeColors.text }]]} numberOfLines={0} {...({ includeFontPadding: false } as any)}>
                            {message.text}
                        </Text>
                        {message.pending && (
                            <ActivityIndicator size="small" color={themeColors.tint} style={{ marginLeft: 8, marginTop: 6 }} />
                        )}
                        {message.failed && onRetry && (
                            <TouchableOpacity onPress={() => onRetry(message)} style={{ marginTop: 6 }}>
                                <Text style={{ color: themeColors.tint, fontSize: 13 }}>Retry</Text>
                            </TouchableOpacity>
                        )}
                    </Pressable>
                </View>

                {isMyMessage && (
                    <View style={styles.avatarContainer}><View style={{ width: 60 }} /></View>
                )}
            </View>
            {listInverted && showTimeSeparator && separatorLabel && (
                <View style={styles.timeSeparatorFullRow} pointerEvents="none">
                    <View style={[styles.timeSeparatorPill, { backgroundColor: themeColors.input }]}> 
                        <Text style={[styles.timeSeparatorText, { color: themeColors.textMuted }]}>{separatorLabel}</Text>
                    </View>
                </View>
            )}
        </>
    );
};

// Memoize MessageBubble to avoid unnecessary rerenders. Comparator checks essential props only.
const MemoMessageBubble = React.memo(MessageBubble, (prevProps, nextProps) => {
    const pm = prevProps.message;
    const nm = nextProps.message;
    if (pm.id !== nm.id) return false;
    if (pm.text !== nm.text) return false;
    const pCreated = pm.createdAt?.toMillis?.() || null;
    const nCreated = nm.createdAt?.toMillis?.() || null;
    if (pCreated !== nCreated) return false;

    // also re-render when pending/failed state changes
    if ((pm.pending || false) !== (nm.pending || false)) return false;
    if ((pm.failed || false) !== (nm.failed || false)) return false;

    const prevPrevId = prevProps.prevMessage?.id || null;
    const nextPrevId = nextProps.prevMessage?.id || null;
    if (prevPrevId !== nextPrevId) return false;

    const prevNextId = prevProps.nextMessage?.id || null;
    const nextNextId = nextProps.nextMessage?.id || null;
    if (prevNextId !== nextNextId) return false;

    if ((prevProps.showAdminTag || false) !== (nextProps.showAdminTag || false)) return false;

    if ((prevProps.showTimeSeparator || false) !== (nextProps.showTimeSeparator || false)) return false;
    if ((prevProps.separatorLabel || null) !== (nextProps.separatorLabel || null)) return false;
    if ((prevProps.listInverted || false) !== (nextProps.listInverted || false)) return false;

    const prevAdminName = prevProps.admins?.[pm.adminId as string]?.displayName || prevProps.admins?.[pm.adminId as string]?.email || null;
    const nextAdminName = nextProps.admins?.[nm.adminId as string]?.displayName || nextProps.admins?.[nm.adminId as string]?.email || null;
    if (prevAdminName !== nextAdminName) return false;

    // Re-render if active message changed and it affects this bubble
    if (prevProps.activeMessageId !== nextProps.activeMessageId || prevProps.activeMessageIndex !== nextProps.activeMessageIndex) {
        const affected = [prevProps.activeMessageId, nextProps.activeMessageId].some(a => a === pm.id || a === nm.id);
        const indexAffected = typeof prevProps.activeMessageIndex === 'number' && (prevProps.activeMessageIndex === prevProps.index || nextProps.activeMessageIndex === prevProps.index);
        if (affected || indexAffected) return false;
    }

    return true;
});

const ConversationScreen = () => {
    const { user } = useAuth();
    const router = useRouter();
    const { id: chatId, status: initialStatus, contactName: encodedContactName } = useLocalSearchParams<{ id: string; status?: Chat['status'], contactName?: string }>();
    const theme = useColorScheme() ?? 'light';
    const themeColors = Colors[theme];
    const insets = useSafeAreaInsets();
    useLightBars();

    // Use react-native-keyboard-controller (JS) + Reanimated shared value for smooth native-synced frames
    const keyboardOffset = useSharedValue(0);
    useKeyboardHandler({
        onMove: (e) => {
            'worklet';
            keyboardOffset.value = e.height;
        },
    });

    const inputAnim = useAnimatedStyle(() => {
        const translate = DIAG_FORCE_TRANSLATE ? -300 : -keyboardOffset.value;
        return { transform: [{ translateY: translate }] } as any;
    });

    const bottomInset = DIAG_IGNORE_INSETS ? 0 : (insets?.bottom || 0);
    const listStyle = useAnimatedStyle(() => {
        const h = Math.max(0, keyboardOffset.value);
        const footerHeight = (isChatInitiallyClosed ? 44 : INPUT_HEIGHT);
        // Because the FlashList is visually flipped via parent transform,
        // paddingBottom would become visual paddingTop. Use paddingTop so
        // the keyboard/footer space appears visually at the bottom.
        return { paddingTop: h + footerHeight + bottomInset } as any;
    });

    const flashListExtraProps = useMemo(() => ({ maxToRenderPerBatch: 10, windowSize: 5 }), []);

    const [chat, setChat] = useState<Chat | null>(null);
    const chatRef = useRef<Chat | null>(null);
    const [liveMessages, setLiveMessages] = useState<Message[]>([]);
    const [olderMessages, setOlderMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isLoadingMore, setLoadingMore] = useState(false);
    const [hasMoreOlder, setHasMoreOlder] = useState(true);
    // Guard to prevent overlapping pagination requests (avoids RN onEndReached edge-cases)
    const loadingMoreRef = useRef(false);
    const lastVisibleDocRef = useRef<any | null>(null);
    const lastVisibleDocIdRef = useRef<string | null>(null);
    const lastVisibleTimestampRef = useRef<number | null>(null);
    const firstSnapshotRef = useRef(true);
    const firstSnapshotAppliedRef = useRef(false);
    const chatFirstSnapshotRef = useRef(true);

    const combinedMessages = useMemo(() => {
        // Deduplicate messages by id and ensure newest-first ordering.
        const seen = new Set<string>();
        const combinedUnsorted: Message[] = [];
        for (const m of [...liveMessages, ...olderMessages]) {
            if (!m || !m.id) continue;
            if (seen.has(m.id)) continue;
            seen.add(m.id);
            combinedUnsorted.push(m);
        }
        // Sort by createdAt descending (newest first) so transform-based list
        // always receives data in newest->oldest order regardless of how
        // live/older buffers were mutated elsewhere.
        const combined = combinedUnsorted.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        return combined;
    }, [liveMessages, olderMessages]);
    
    useEffect(() => {
        if ((global as any).__DEV__) console.debug('[chat] combinedMessages.len=', combinedMessages.length, 'live=', liveMessages.length, 'older=', olderMessages.length);
    }, [combinedMessages.length, liveMessages.length, olderMessages.length]);
    
    // Per new mount rule: render-only on first frame — loading must be false immediately
    const [loading, setLoading] = useState(false);
    // true while we don't yet have any messages (neither cache nor initial snapshot)
    const [messagesLoading, setMessagesLoading] = useState(true);
    const [deferredReady, setDeferredReady] = useState(false);
    const deferredRafRef = useRef<number | null>(null);

    // Diagnostic: mark navigation completion for the `openChat` timer started by the list press
    useEffect(() => { try { console.timeEnd('openChat'); } catch (e) { /* ignore */ } }, []);

    // Presence helpers (synchronous-feel): optimistic local update + immediate server fire-and-forget
    const goOnlineImmediate = async (chatIdParam: string, adminIdParam: string) => {
        try {
            const chatDocRef = doc(db, 'chats', chatIdParam);
            // Attempt to set active admin without reading first (fewer reads; if the chat doesn't exist updateDoc will throw)
            try {
                await updateDoc(chatDocRef, { activeAdminId: adminIdParam });
            } catch (e) {
                if ((global as any).__DEV__ || DEV_MSG_LOGGING) console.warn('goOnlineImmediate update failed (possibly missing chat):', e);
                try { router.back(); } catch {}
                return;
            }
            // Reset unread and lastPushAt unconditionally to avoid an extra read
            try { await updateDoc(chatDocRef, { adminUnread: 0, lastPushAt: null }); } catch(e) { console.error('goOnlineImmediate clear unread failed', e); }
        } catch (error) {
            console.error('Error in goOnlineImmediate:', error);
        }
    };

    const goOfflineImmediate = async (chatIdParam: string, adminIdParam: string) => {
        try {
            const chatDocRef = doc(db, 'chats', chatIdParam);
            await runTransaction(db, async (tx) => {
                const docSnap = await tx.get(chatDocRef);
                if (!docSnap.exists()) return;
                const data: any = docSnap.data();
                if (data.activeAdminId === adminIdParam) {
                    tx.update(chatDocRef, { activeAdminId: null });
                }
            });
        } catch (error) {
            console.error('Error in goOfflineImmediate (transaction):', error);
        }
    };

    // Presence effect: run immediately on mount/enter (server-only, fire-and-forget)
    // NOTE: we intentionally do NOT mutate local chat state optimistically — presence is a server-side semantic command.
    useEffect(() => {
        if (!chatId || !user) return;
        const adminId = user.uid;

        // initiate server-side presence immediately (fire-and-forget)
        (async () => { await goOnlineImmediate(chatId, adminId); })();

        // On unmount: notify server we're offline but defer the work slightly
        // so navigation/exit animations can run without being blocked by JS work.
        return () => {
            try {
                setTimeout(() => {
                    goOfflineImmediate(chatId, adminId).catch(e => console.error('goOfflineImmediate (deferred) failed', e));
                }, 60);
            } catch (e) { /* ignore */ }
        };
    }, [chatId, user]);

    const [modalConfig, setModalConfig] = useState<{ title: string; message: string; confirmText: string; onConfirm: () => void; cancelText?: string; variant?: 'destructive' | 'secondary'; showIcon?: boolean } | null>(null);

    // Prevent other modals from appearing immediately after this one closes (fixes a brief "OK" flash)
    const modalLockRef = useRef(false);
    const modalTimerRef = useRef<number | null>(null);

    // Active message tooltip control (only one active at a time)
    const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
    const [activeMessageIndex, setActiveMessageIndex] = useState<number | null>(null);
    const activeTimestampTimerRef = useRef<number | null>(null);
    const listRef = useRef<any | null>(null);
    const initialScrollDoneRef = useRef(false);
    const scrollOffsetRef = useRef(0);
    const lastScrollYRef = useRef(0);
    const prevTopIdRef = useRef<string | null>(null);
    const userScrollRef = useRef(false);
    const [chatHeight, setChatHeight] = useState<number | null>(null);
    const { width } = useWindowDimensions();

    useEffect(() => {
        // reset measured chat height on orientation/width change so we re-measure
        setChatHeight(null);
    }, [width]);

    // When user is farther than this from bottom, preserve offset on incoming messages
    const PRESERVE_OFFSET_PX = 120;

    const handleScroll = (e: any) => {
        const y = e?.nativeEvent?.contentOffset?.y || 0;
        lastScrollYRef.current = y;
        scrollOffsetRef.current = y;
        // keep updating scroll refs only; arrow/unread UI removed
    };

    const onScrollBeginDrag = () => { userScrollRef.current = true; };
    const onScrollEnd = () => { userScrollRef.current = false; };

    useEffect(() => {
        return () => { /* cleanup */ };
    }, []);

    // Removed scroll-to-bottom badge/button behavior

    const handleToggleActive = (id: string | null, idx?: number) => {
        const sid = id ? String(id) : null;
        if (!sid) {
            setActiveMessageId(null);
            setActiveMessageIndex(null);
            return;
        }
        if (activeMessageId === sid) {
            setActiveMessageId(null);
            setActiveMessageIndex(null);
            if (activeTimestampTimerRef.current) { clearTimeout(activeTimestampTimerRef.current); activeTimestampTimerRef.current = null; }
            return;
        }
        // Activate
        setActiveMessageId(sid);
        setActiveMessageIndex(typeof idx === 'number' ? idx : null);
        // auto-hide after 3s
        if (activeTimestampTimerRef.current) { clearTimeout(activeTimestampTimerRef.current); activeTimestampTimerRef.current = null; }
        activeTimestampTimerRef.current = window.setTimeout(() => {
            setActiveMessageId(null);
            setActiveMessageIndex(null);
            activeTimestampTimerRef.current = null;
        }, 3000);
    };

    useEffect(() => {
        return () => { if (activeTimestampTimerRef.current) { clearTimeout(activeTimestampTimerRef.current); activeTimestampTimerRef.current = null; } };
    }, []);

    // scroll-arrow removed

    // Schedule deferred side-effects on next animation frame (this keeps mount free of writes/subscriptions)
    useEffect(() => {
        if (!chatId || !user) return;
        // schedule a single rAF to mark deferred work as ready
        deferredRafRef.current = requestAnimationFrame(() => {
            setDeferredReady(true);
            deferredRafRef.current = null;
        });
        return () => {
            if (deferredRafRef.current) cancelAnimationFrame(deferredRafRef.current);
            deferredRafRef.current = null;
        };
    }, [chatId, user]);

    // When deferredReady becomes true, perform all writes, initial fetches and subscriptions.
    useEffect(() => {
        if (!deferredReady || !chatId || !user) return;

        let unsubChat: (() => void) | null = null;
        let unsubMessages: (() => void) | null = null;
        let appStateSubscription: any = null;
        let cancelled = false;

        const chatDocRef = doc(db, 'chats', chatId);
        const adminId = user.uid;

        // initial heavy load is now handled on the first chat onSnapshot to avoid redundant getDoc calls and duplicate execution


        // subscribe to chat doc
        unsubChat = onSnapshot(chatDocRef, (docSnap) => {
            if (cancelled) return;
            if (docSnap.exists()) {
                setChat({ id: docSnap.id, ...docSnap.data() } as Chat);

                // Run initial status->active updates once on the first chat snapshot instead of a separate getDoc
                if (chatFirstSnapshotRef.current) {
                    chatFirstSnapshotRef.current = false;
                    try {
                        const chatData = { id: docSnap.id, ...docSnap.data() } as Chat;
                        if (chatData.status === 'waiting') {
                            const systemMessageText = "Konsultant dołączył do rozmowy!";
                            const updates = {
                                status: "active",
                                operatorId: adminId,
                                assignedAdminId: adminId,
                                operatorJoinedAt: Timestamp.now(),
                                lastMessage: systemMessageText,
                                lastMessageSender: 'system',
                                lastMessageTimestamp: Timestamp.now(),
                                lastActivity: Timestamp.now(),
                            };
                            const batch = writeBatch(db);
                            batch.update(chatDocRef, updates);
                            const messagesCol = collection(db, 'chats', chatId, 'messages');
                            batch.delete(doc(messagesCol, 'waiting_message'));
                            batch.set(doc(collection(db, 'chats', chatId, 'messages')), { text: systemMessageText, sender: "system", createdAt: Timestamp.now() });
                            try {
                                setTimeout(() => {
                                    batch.commit().catch((e: any) => console.error("Initial chat snapshot commit failed:", e));
                                }, 60);
                            } catch (e) { /* ignore */ }
                        }
                    } catch (error) {
                        console.error("Błąd podczas przetwarzania początkowego snapshotu czatu:", error);
                        if (!cancelled) router.back();
                    }
                }

            } else {
                if (!cancelled) router.back();
            }
        });

        // subscribe to messages
        const messagesQuery = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'desc'), limit(MESSAGES_LIMIT));
        unsubMessages = onSnapshot(messagesQuery, (snapshot) => {

            if (firstSnapshotRef.current && !firstSnapshotAppliedRef.current) {
                // initial load -> populate live messages (merge-safe with cache)
                firstSnapshotAppliedRef.current = true;
                const docs = snapshot.docs;
                const msgs = docs.map(doc => ({ ...doc.data(), id: doc.id } as Message));

                setLiveMessages((prev) => {
                    // If we have cached messages already loaded, merge and prefer server for duplicates
                    if (cacheLoadedRef.current && prev && prev.length > 0) {
                        const map = new Map<string, Message>();
                        for (const m of [...msgs, ...prev]) {
                            if (!m || !m.id) continue;
                            if (!map.has(m.id)) map.set(m.id, m);
                        }
                        const merged = Array.from(map.values()).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
                        return merged;
                    }
                    // If server returned nothing but we had cached data, keep cached
                    if (msgs.length === 0 && prev && prev.length > 0) return prev;
                    // else use server-provided initial snapshot
                    return msgs;
                });

                if (docs.length) lastVisibleTimestampRef.current = docs.length ? (docs[docs.length - 1].data() as any).createdAt?.toMillis?.() : null;
                firstSnapshotRef.current = false;
                // initial snapshot arrived — stop messages loading indicator
                setLoading(false);
                setMessagesLoading(false);
                return;
            }

            // Batch-process docChanges and merge into current state to avoid replacing full history
            const changes = snapshot.docChanges();
            if (!changes || changes.length === 0) return;

            let overflowToOlder: Message[] = [];

            // Decide whether to preserve scroll offset (user far from bottom)
            const prevOffset = scrollOffsetRef.current || 0;
            const shouldPreserveOffset = (prevOffset > PRESERVE_OFFSET_PX) && !userScrollRef.current;

            setLiveMessages((prev) => {
                // Merge strategy: never operate by index. Use a Map keyed by stable id (id || clientId).
                const map = new Map<string, Message>();

                // Seed map with previous live messages
                for (const m of prev) {
                    const key = (m && (m.id || (m as any).clientId));
                    if (!key) continue;
                    map.set(key, m);
                }

                // Apply snapshot changes: added/modified replace by id/clientId, removed deletes
                for (const change of changes) {
                    const docData = { ...change.doc.data(), id: change.doc.id } as Message & any;
                    const docClientId = (change.doc.data() as Partial<Message>)?.clientId;
                    const key = docData.id || docClientId;
                    if (!key) continue;

                    if (change.type === 'added' || change.type === 'modified') {
                        // overwrite any existing entry with the server-provided doc
                        map.set(key, docData);
                    } else if (change.type === 'removed') {
                        // remove entries that match this id or clientId
                        for (const [k, v] of Array.from(map.entries())) {
                            if (v.id === change.doc.id) map.delete(k);
                            else if (docClientId && (v as any).clientId === docClientId) map.delete(k);
                        }
                    }
                }

                // Build sorted array (newest first)
                const merged = Array.from(map.values()).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

                // Enforce MESSAGES_LIMIT: keep newest in live, move overflow to older buffer
                if (merged.length > MESSAGES_LIMIT) {
                    const live = merged.slice(0, MESSAGES_LIMIT);
                    const overflow = merged.slice(MESSAGES_LIMIT);
                    overflowToOlder.push(...overflow);
                    return live;
                }

                return merged;
            });

            if (overflowToOlder.length) {
                setOlderMessages((old) => [...old, ...overflowToOlder]);
            }

            // If user is scrolled away from bottom, restore previous offset to avoid list jump
            if (shouldPreserveOffset) {
                requestAnimationFrame(() => {
                    try { listRef.current?.scrollToOffset({ offset: prevOffset, animated: false }); } catch (e) { /* ignore */ }
                });
            }
        });
        
        const handleAppStateChange = (nextAppState: string) => {
            if (nextAppState !== 'active') {
                // immediate server call (no rAF) to mark offline
                try {
                    const adminId = user?.uid;
                    if (adminId && chatId) {
                        (async () => { await goOfflineImmediate(chatId, adminId); })();
                    }
                } catch (e) { console.error(e); }
            }
        };

        appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            try { unsubChat && unsubChat(); } catch(e) { /* ignore */ }
            try { unsubMessages && unsubMessages(); } catch(e) { /* ignore */ }
            try { appStateSubscription?.remove?.(); } catch(e) { /* ignore */ }
            // presence is handled separately (optimistic local + immediate server calls in presence effect)
        };

    }, [deferredReady, chatId, user, router]);

    const closeModal = () => {
        // On web, perform a double-blur and focus on body so Chrome doesn't restore focus outline
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
            } catch(e) { /* ignore */ }
        }

        // clear any scheduled modal shows so they don't flash after closing
        if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }

        setModalConfig(null);
        modalLockRef.current = true;
        try { if (typeof window !== 'undefined') { (window as any).__modalIsClosing = true; (window as any).__modalSuppressedUntil = Date.now() + 720; } } catch(e) {}
        setTimeout(() => { try { if (typeof window !== 'undefined') (window as any).__modalIsClosing = false; } catch(e) {} modalLockRef.current = false; }, 660);
    };

    const showModal = (config: { title: string; message: string; confirmText?: string; onConfirm?: () => void; cancelText?: string; variant?: 'destructive' | 'secondary'; showIcon?: boolean }) => {
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
                    const normalized = {
                        title: safe(config?.title),
                        message: safe(config?.message),
                        confirmText: safe(config?.confirmText) ?? 'OK',
                        cancelText: safe(config?.cancelText),
                        onConfirm: config?.onConfirm,
                        variant: config?.variant,
                        showIcon: !!config?.showIcon,
                    } as any;

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
                                const normalized = { title: config.title ?? '', message: config.message ?? '', confirmText: config.confirmText ?? 'OK', cancelText: config.cancelText, onConfirm: config.onConfirm, variant: config.variant, showIcon: !!config.showIcon } as any;
                                setModalConfig(normalized);
                                modalTimerRef.current = null;
                            }, 420);
                        } else {
                            const normalized = { title: config.title ?? '', message: config.message ?? '', confirmText: config.confirmText ?? 'OK', cancelText: config.cancelText, onConfirm: config.onConfirm, variant: config.variant, showIcon: !!config.showIcon } as any;
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

    // Caching keys & refs for AsyncStorage-based recent messages cache
    const CACHE_KEY = `chat_messages_${chatId}`;
    const cacheSaveTimerRef = useRef<any | null>(null);
    const cacheLoadedRef = useRef(false);
    const contactName = encodedContactName ? decodeURIComponent(encodedContactName) : 'Czat';
    const [currentStatus, setCurrentStatus] = useState<Chat['status'] | undefined>(initialStatus);
    
    const [isAssignModalVisible, setAssignModalVisible] = useState(false);
    const [showBackButtonBadge, setShowBackButtonBadge] = useState(false);
    const { totalUnreadCount, admins: adminsMap, setChats } = useChatContext();
    const adminsList = useMemo(() => Object.values(adminsMap), [adminsMap]);

    // Try in-memory cache first to provide instant UX
    useEffect(() => {
        if (!chatId) return;
        try {
            const entry = getInMemoryCache(chatId);
            if (entry && entry.messages && entry.messages.length) {
                /* in-memory cache used (log removed for production performance) */
                // normalize createdAt back to Timestamp for UI/logic
                const restored = entry.messages.map((m: any) => ({ ...m, createdAt: typeof m.createdAt === 'number' ? Timestamp.fromMillis(m.createdAt) : m.createdAt } as Message));
                setLiveMessages(restored);
                lastVisibleTimestampRef.current = entry.lastVisible || null;
                lastVisibleDocIdRef.current = entry.lastVisibleDocId || null;
                lastVisibleDocRef.current = entry.lastVisibleDoc || null;
                cacheLoadedRef.current = true;
                setMessagesLoading(false);
            }
        } catch (e) {
            console.error('Error reading in-memory cache:', e);
        }
    }, [chatId]);

    // Reset pagination and message buffers when switching chats to avoid stale cursor/state
    useEffect(() => {
        // Clear UI state so new chat starts fresh (prevents FlatList/pagination edge-cases)
        try {
            setLiveMessages([]);
            setOlderMessages([]);
            setHasMoreOlder(true);
            setLoadingMore(false);
            loadingMoreRef.current = false;

            lastVisibleDocRef.current = null;
            lastVisibleDocIdRef.current = null;
            lastVisibleTimestampRef.current = null;

            firstSnapshotRef.current = true;
            firstSnapshotAppliedRef.current = false;
            cacheLoadedRef.current = false;

            setMessagesLoading(true);
        } catch (e) { /* ignore */ }
    }, [chatId]);

    // Load cached messages (if any) to make startup feel instant while we wait for snapshot
    useEffect(() => {
        if (!chatId) return;
        let cancelled = false;
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(CACHE_KEY);
                if (cancelled) return;
                if (!raw) {
                    // no persisted cache
                    cacheLoadedRef.current = true;
                    setMessagesLoading(false);
                    return;
                }
                const parsed = JSON.parse(raw) as { messages?: Array<any>, lastVisible?: number, lastVisibleDocId?: string };
                if (!parsed || !parsed.messages || !parsed.messages.length) {
                    cacheLoadedRef.current = true;
                    setMessagesLoading(false);
                    return;
                }
                // convert stored timestamps (ms) back to Timestamp
                const cached = parsed.messages.map(p => ({ ...p, createdAt: Timestamp.fromMillis(p.createdAt), pending: false, failed: false } as Message));
                if (cancelled) return;
                // Merge cached messages with any existing live messages, but prefer server/live if present
                setLiveMessages((prev) => {
                    // If we already have messages (from in-memory), prefer those if they are newer
                    if (!prev || prev.length === 0) {
                            /* AsyncStorage cache used (log removed for production performance) */
                            setMessagesLoading(false);
                            return cached;
                        }
                    const prevNewest = prev[0]?.createdAt?.toMillis?.() || 0;
                    const cachedNewest = cached[0]?.createdAt?.toMillis?.() || 0;
                    if (cachedNewest <= prevNewest) return prev; // keep newer server or in-memory data
                    const map = new Map<string, Message>();
                    for (const m of [...cached, ...prev]) {
                        if (!m || !m.id) continue;
                        if (!map.has(m.id)) map.set(m.id, m);
                    }
                    const merged = Array.from(map.values()).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
                    return merged;
                });

                lastVisibleTimestampRef.current = parsed.lastVisible || null;
                lastVisibleDocIdRef.current = parsed.lastVisibleDocId || null;
                // if we have docId, attempt to fetch its DocumentSnapshot to enable precise pagination
                if (lastVisibleDocIdRef.current) {
                    try {
                        const snap = await getDoc(doc(db, 'chats', chatId, 'messages', lastVisibleDocIdRef.current));
                        if (!cancelled && snap.exists()) lastVisibleDocRef.current = snap;
                    } catch (err) {
                        console.error('Failed to fetch lastVisible doc by id:', err);
                        lastVisibleDocRef.current = null;
                    }
                }

                // mark that we loaded cache (either in-memory or AsyncStorage)
                cacheLoadedRef.current = true;

                // populate in-memory cache for next open (store numeric timestamps)
                try {
                    const stored = cached.map(m => ({ ...m, createdAt: m.createdAt?.toMillis ? m.createdAt.toMillis() : (typeof m.createdAt === 'number' ? m.createdAt : null) }));
                    setInMemoryCache(chatId, { messages: stored, lastVisible: parsed.lastVisible, lastVisibleDocId: parsed.lastVisibleDocId, updatedAt: Date.now() });
                } catch (e) { /* ignore */ }

            } catch (err) {
                if (!cancelled) console.error('Failed to load cached messages:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [chatId]);

    // Persist recent messages (debounced) to AsyncStorage whenever messages change
    useEffect(() => {
        if (!chatId) return;
        // update in-memory cache synchronously for instant subsequent opens
        try {
            const stored = combinedMessages.slice(0, MESSAGES_LIMIT).map(m => ({ ...m, createdAt: m.createdAt?.toMillis ? m.createdAt.toMillis() : (typeof m.createdAt === 'number' ? m.createdAt : null) }));
            setInMemoryCache(chatId, { messages: stored, lastVisible: lastVisibleTimestampRef.current || undefined, lastVisibleDocId: lastVisibleDocIdRef.current || undefined, lastVisibleDoc: lastVisibleDocRef.current || undefined, updatedAt: Date.now() });
        } catch (e) { /* ignore */ }

        if (cacheSaveTimerRef.current) {
            clearTimeout(cacheSaveTimerRef.current);
        }
        cacheSaveTimerRef.current = setTimeout(async () => {
            try {
                const toStore = combinedMessages.slice(0, MESSAGES_LIMIT).map(m => ({ ...m, createdAt: m.createdAt?.toMillis ? m.createdAt.toMillis() : null }));
                const payload = { messages: toStore, lastVisible: lastVisibleTimestampRef.current, lastVisibleDocId: lastVisibleDocIdRef.current };
                await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
            } catch (err) {
                console.error('Failed to save message cache:', err);
            }
        }, 800);

        return () => {
            if (cacheSaveTimerRef.current) clearTimeout(cacheSaveTimerRef.current);
        };
    }, [combinedMessages, chatId]);

    // Precompute visual neighbors and admin-block tags to keep props stable between renders
    const visualData = useMemo(() => {
        return combinedMessages.map((item, index) => {
            const rawPrev = index < combinedMessages.length - 1 ? combinedMessages[index + 1] : undefined;
            const rawNext = index > 0 ? combinedMessages[index - 1] : undefined;

            // Cache trimmed text check to avoid repeated trim() calls
            const itemHasText = item.text ? String(item.text).trim().length > 0 : false;

            let showAdminTag = false;
            if (item.sender === 'admin') {
                let foundPrevAdmin = false;
                for (let j = index + 1; j < combinedMessages.length; j++) {
                    const m = combinedMessages[j];
                    if (m.sender === 'admin') {
                        foundPrevAdmin = true;
                        showAdminTag = m.adminId !== item.adminId;
                        break;
                    }
                }
                if (!foundPrevAdmin) showAdminTag = true;
            }

            // Show a centered time/day separator when the neighboring message is on a different day
            // or when more than 10 minutes passed since the neighboring message.
            // We always attach the separator to the newer (later) message so that it appears
            // in the correct visual position regardless of list inversion or data ordering.
            let showTimeSeparator = false;
            let separatorLabel: string | undefined = undefined;
            try {
                // Only compute a separator when we actually have two non-system messages with text
                // Find the closest older message anywhere in `combinedMessages` (more robust than only checking prev/next)
                if (item.createdAt && itemHasText && item.sender !== 'system') {
                    const itemMs = item.createdAt.toMillis();
                    let closestOlderMs = -Infinity;
                    let closestOlder: Message | undefined = undefined;
                    for (const c of combinedMessages) {
                        if (!c || !c.createdAt || !c.text) continue;
                        if (!String(c.text).trim()) continue;
                        if (c.sender === 'system') continue;
                        const cMs = c.createdAt.toMillis();
                        if (cMs < itemMs && cMs > closestOlderMs) {
                            closestOlderMs = cMs;
                            closestOlder = c;
                        }
                    }

                    if (closestOlder) {
                        const olderMs = closestOlderMs;
                        const newerMs = itemMs;
                        const mins = (newerMs - olderMs) / (1000 * 60);
                        const olderDate = new Date(olderMs);
                        const newerDate = new Date(newerMs);
                        const isDifferentDay = olderDate.getFullYear() !== newerDate.getFullYear() || olderDate.getMonth() !== newerDate.getMonth() || olderDate.getDate() !== newerDate.getDate();
                        if (isDifferentDay) {
                            showTimeSeparator = true;
                            // Compute days difference based on start of day
                            const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
                            const daysDiff = Math.round((startOfDay(new Date()).getTime() - startOfDay(newerDate).getTime()) / (1000 * 60 * 60 * 24));
                            // Use centralized formatting to produce labels like:
                            // today -> "HH:MM", yesterday -> "wczoraj o HH:MM",
                            // within week -> "pt. o HH:MM", older -> "3 lut o HH:MM"
                            separatorLabel = formatMessageTimestamp(newerDate);
                        } else if (mins >= 10) {
                            showTimeSeparator = true;
                            separatorLabel = formatMessageTimestamp(new Date(item.createdAt.toMillis()));
                        }
                    }
                }
            } catch (e) {
                /* ignore */
            }

            // Decide visual prev/next: treat separators, system messages and large gaps as breaks
            const minutesBetween = (d1?: any, d2?: any) => {
                try {
                    if (!d1 || !d2) return Infinity;
                    const t1 = typeof d1.toMillis === 'function' ? d1.toMillis() : (new Date(d1)).getTime();
                    const t2 = typeof d2.toMillis === 'function' ? d2.toMillis() : (new Date(d2)).getTime();
                    return Math.abs(t1 - t2) / (1000 * 60);
                } catch (e) { return Infinity; }
            };

            const isDifferentDay = (d1?: any, d2?: any) => {
                try {
                    if (!d1 || !d2) return true;
                    const a = new Date(typeof d1.toMillis === 'function' ? d1.toMillis() : d1);
                    const b = new Date(typeof d2.toMillis === 'function' ? d2.toMillis() : d2);
                    return a.getFullYear() !== b.getFullYear() || a.getMonth() !== b.getMonth() || a.getDate() !== b.getDate();
                } catch (e) { return true; }
            };

            const prev = (rawPrev && rawPrev.sender !== 'system' && rawPrev.text && String(rawPrev.text).trim().length > 0 && !isDifferentDay(rawPrev.createdAt, item.createdAt) && minutesBetween(rawPrev.createdAt, item.createdAt) < 10) ? rawPrev : undefined;
            const next = (rawNext && rawNext.sender !== 'system' && rawNext.text && String(rawNext.text).trim().length > 0 && !isDifferentDay(rawNext.createdAt, item.createdAt) && minutesBetween(rawNext.createdAt, item.createdAt) < 10) ? rawNext : undefined;

            // same-sender within group threshold (GROUP_THRESHOLD_MINUTES)
            const withinThreshold = (a?: any, b?: any) => {
                try {
                    if (!a || !b) return false;
                    const mins = minutesBetween(a.createdAt, b.createdAt);
                    return mins <= GROUP_THRESHOLD_MINUTES;
                } catch (e) { return false; }
            };

            return { message: item, prev, next, showAdminTag, showTimeSeparator, separatorLabel };
        });
    }, [combinedMessages]);

    const handleRetry = async (localMsg: any) => {
        if (!chatId || !user) return;
        const clientId = localMsg.clientId;
        if (!clientId) return;

        // set pending true and clear failed
        setLiveMessages(prev => prev.map(m => m.clientId === clientId ? { ...m, pending: true, failed: false } : m));

        try {
            const batch = writeBatch(db);
            const chatDocRef = doc(db, 'chats', chatId);
            const newMessageRef = doc(collection(db, 'chats', chatId, 'messages'), clientId);

            batch.set(newMessageRef, { 
                text: localMsg.text, 
                createdAt: Timestamp.now(), 
                sender: 'admin', 
                adminId: user.uid,
                clientId,
            });

            batch.update(chatDocRef, {
                lastMessage: localMsg.text,
                lastMessageSender: 'admin',
                lastMessageTimestamp: Timestamp.now(),
                lastActivity: Timestamp.now(),
                userUnread: increment(1),
            });

            await batch.commit();
        } catch (error) {
            console.error('Retry failed:', error);
            setLiveMessages(prev => prev.map(m => m.clientId === clientId ? { ...m, pending: false, failed: true } : m));
        }
    };

    const renderItem = useCallback(({ item }: { item: any }) => {
        // message item follows
        const m = item.message as any;
        const createdAt = m?.createdAt;
        const timeLabel = createdAt ? (typeof createdAt.toMillis === 'function' ? formatMessageTimestamp(new Date(createdAt.toMillis())) : formatMessageTimestamp(new Date(createdAt))) : '';

        // Respect explicit system messages: render as centered separators or system bubble
        if (m?.sender === 'system') {
            const lowerCaseText = (m?.text || '').toLowerCase();
            const isContextMessage = lowerCaseText.includes('kontekst rozmowy z ai') || lowerCaseText.includes('koniec rozmowy z konsultantem ai');

            if (isContextMessage) {
                const cleanedText = (m?.text || '').replace(/^-+\s*|\s*-+$/g, '').trim();
                return (
                    <Pressable onLongPress={() => copyToClipboard(cleanedText)} style={{ width: '100%', transform: [{ scaleY: -1 }] }}>
                        <View style={styles.dividerContainer}>
                            <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
                            <Text style={[styles.dividerText, { color: themeColors.textMuted }]}>{cleanedText}</Text>
                            <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
                        </View>
                    </Pressable>
                );
            }

            return (
                <Pressable onLongPress={() => copyToClipboard(m?.text)} style={{ width: '100%', transform: [{ scaleY: -1 }] }}>
                    <View style={styles.systemMessageContainer}>
                        <Text style={[styles.systemMessageText, { color: '#FEFEFE' }]}>{m?.text}</Text>
                    </View>
                </Pressable>
            );
        }

        const sender = m?.sender ?? (m?.adminId ? 'admin' : 'user');
        const isMy = sender === 'admin';
        const mid = (m?.id ?? m?.clientId) ? String(m?.id ?? m?.clientId) : null;

        const prevSame = !!(item.prev && item.prev.sender === sender);
        const nextSame = !!(item.next && item.next.sender === sender);

        let variant = 'solo';
        if (!prevSame && nextSame) variant = 'first';
        else if (prevSame && nextSame) variant = 'middle';
        else if (prevSame && !nextSame) variant = 'last';

        const bubbleCornerKey = `${isMy ? 'myBubble' : 'theirBubble'}_${variant}` as keyof typeof styles;

        const isDifferentSenderPrev = !prevSame;
        const isDifferentSenderNext = !nextSame;
        const isAfterSeparator = !!item.showTimeSeparator;

        const isLastInGroup = variant === 'last' || variant === 'solo';

        const rowStyles: any[] = [
            styles.row,
            isMy ? styles.right : styles.left,
            { alignItems: isLastInGroup ? 'flex-end' : 'flex-start', marginTop: prevSame ? 1 : 10, marginBottom: nextSame ? 1 : 8 }
        ];

        // DEV debug logs removed for production

        return (
            <View style={{ width: '100%', transform: [{ scaleY: -1 }] }}>
                {item.showTimeSeparator && item.separatorLabel ? (
                    <View style={styles.timeSeparatorContainer}>
                        <Text style={[styles.timeSeparatorText, { color: themeColors.textMuted }]}>{item.separatorLabel}</Text>
                    </View>
                ) : null}

                <View style={rowStyles}>
                    {!isMy && isLastInGroup ? (
                        // absolutely positioned avatar pinned to the bottom-left of the row
                        <View pointerEvents="box-none" style={styles.avatarWrap}>
                            {m?.sender === 'ai' ? (
                                <View style={styles.aiAvatar}>
                                    <MaterialCommunityIcons name="robot" size={28} color={themeColors.textMuted} />
                                </View>
                            ) : (
                                <View style={styles.adminAvatar}>
                                    <Ionicons name="person-circle-outline" size={34} color={themeColors.textMuted} />
                                </View>
                            )}
                        </View>
                    ) : null}

                    <View style={[styles.stack, isMy ? styles.rightStack : styles.leftStack, isMy ? styles.stackPadRight : styles.stackPadLeft]}>
                        {mid && activeMessageId === mid ? (
                            <View style={{ alignSelf: isMy ? 'flex-end' : 'flex-start' }}>
                                <Text style={[styles.timestampBlock, { color: themeColors.textMuted, marginLeft: !isMy ? 40 : 0 }]}>{timeLabel}</Text>
                            </View>
                        ) : null}

                        <View style={[styles.bubbleWrap, isMy ? styles.bubbleWrapRight : styles.bubbleWrapLeft]}>
                            <View style={[(styles as any)[bubbleCornerKey], { overflow: 'hidden' }]}> 
                                <Pressable
                                    onPress={() => handleToggleActive(m?.id || m?.clientId, typeof item.index === 'number' ? item.index : undefined)}
                                    onLongPress={() => copyToClipboard(m?.text)}
                                    hitSlop={6}
                                    android_ripple={{ color: '#00000010', borderless: false }}
                                    style={({ pressed }) => [
                                            styles.bubble,
                                            !isMy ? styles.bubbleWithAvatar : null,
                                            isMy ? styles.adminBubble : (m?.sender === 'ai' ? styles.aiMessageBubble : styles.userBubble),
                                            (styles as any)[bubbleCornerKey],
                                            pressed ? { opacity: Platform.OS === 'ios' ? 0.85 : 1 } : null,
                                        ]}
                                >
                                    <Text style={[styles.text, isMy ? styles.adminText : styles.theirMessageText]} numberOfLines={0} {...({ includeFontPadding: false } as any)}>{m?.text}</Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        );
    }, [themeColors, handleToggleActive, width, activeMessageId]);

    const listData = useMemo(() => {
        // Keep listData as pure message items; attach a `layoutType` so FlashList can distinguish layouts
        return visualData.map(v => {
            const m = v.message as any;
            let layoutType = 'received';
            if (m?.sender === 'system') layoutType = 'system';
            else if (m?.sender === 'ai') layoutType = 'ai';
            else if (m?.sender === 'admin') layoutType = 'sent';
            return { type: 'message', layoutType, ...v };
        });
    }, [visualData]);

    // Track new incoming messages: auto-scroll to bottom if user is near bottom
    const prevLiveLenRef = useRef<number>(liveMessages.length);
    const mountedRef = useRef(false);
    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
    useEffect(() => {
        const prev = prevLiveLenRef.current || 0;
        const curr = liveMessages.length;
        if (curr > prev) {
            // Do not perform any forced scroll during the initial mount/layout phase
            if (!mountedRef.current) {
                prevLiveLenRef.current = curr;
                return;
            }

            // If user is near bottom -> auto-scroll; otherwise do nothing
            if ((scrollOffsetRef.current || 0) <= PRESERVE_OFFSET_PX) {
                try { listRef.current?.scrollToOffset({ offset: 0, animated: true }); } catch (e) { /* ignore */ }
            }
        }
        prevLiveLenRef.current = curr;
    }, [liveMessages]);

    const loadOlderMessages = async () => {
        if (!chatId || loadingMoreRef.current || !hasMoreOlder) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
        try {
            const startAfterDoc = lastVisibleDocRef.current;
            const startAfterTimestamp = lastVisibleTimestampRef.current;
            const startAfterDocId = lastVisibleDocIdRef.current;
            if (!startAfterDoc && !startAfterTimestamp && !startAfterDocId) {
                setHasMoreOlder(false);
                setLoadingMore(false);
                return;
            }
            let startAfterArg: any = null;
            if (startAfterDoc) {
                startAfterArg = startAfterDoc;
            } else if (startAfterDocId) {
                try {
                    const snap = await getDoc(doc(db, 'chats', chatId, 'messages', startAfterDocId));
                    if (snap.exists()) {
                        startAfterArg = snap;
                    } else if (startAfterTimestamp) {
                        startAfterArg = Timestamp.fromMillis(startAfterTimestamp);
                    }
                } catch (err) {
                    console.error('Failed to fetch startAfter doc by id:', err);
                    if (startAfterTimestamp) startAfterArg = Timestamp.fromMillis(startAfterTimestamp);
                }
            } else if (startAfterTimestamp) {
                startAfterArg = Timestamp.fromMillis(startAfterTimestamp);
            }
            if (!startAfterArg) {
                setHasMoreOlder(false);
                setLoadingMore(false);
                return;
            }
            const olderQuery = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'desc'), startAfter(startAfterArg), limit(MESSAGES_PAGE_SIZE));
            const snap = await getDocs(olderQuery);
            if (snap.empty) {
                setHasMoreOlder(false);
            } else {
                const docs = snap.docs;
                const older = docs.map(doc => ({ ...doc.data(), id: doc.id } as Message));
                setOlderMessages(prev => [...prev, ...older]);
                lastVisibleDocRef.current = docs[docs.length - 1];
                lastVisibleTimestampRef.current = (docs[docs.length - 1].data() as any).createdAt?.toMillis?.();
                setHasMoreOlder(docs.length === MESSAGES_PAGE_SIZE);
            }
        } catch (error) {
            console.error('Error loading older messages:', error);
        }
        setLoadingMore(false);
        loadingMoreRef.current = false;
    };

    useEffect(() => {
        chatRef.current = chat;
        if (chat) {
            setCurrentStatus(chat.status);
            const unreadInThisChat = chat.adminUnread || 0;
            setShowBackButtonBadge(totalUnreadCount > 0 && (totalUnreadCount - unreadInThisChat > 0));
        }
    }, [totalUnreadCount, chat]);

    // Deferred effect moved above: see `deferredReady` handler (mount must be render-only)



    const handleSend = async () => {
        if (newMessage.trim() === '' || !chatId || !user) return;
        const text = newMessage.trim();
        setNewMessage('');

        // optimistic local message
        const clientId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
        const localMessage: any = {
            id: clientId,
            clientId,
            text,
            createdAt: Timestamp.now(),
            sender: 'admin',
            adminId: user.uid,
            pending: true,
            _local: true,
        };

        setLiveMessages((prev) => {
            const next = [localMessage, ...prev];
            if (next.length > MESSAGES_LIMIT) {
                const overflow = next.pop()!;
                setOlderMessages((old) => [overflow, ...old]);
            }
            return next;
        });

        // write to server using clientId as doc id to avoid dupes on retry
        try {
            const batch = writeBatch(db);
            const chatDocRef = doc(db, 'chats', chatId);
            const newMessageRef = doc(collection(db, 'chats', chatId, 'messages'), clientId);

            batch.set(newMessageRef, { 
                text, 
                createdAt: Timestamp.now(), 
                sender: 'admin', 
                adminId: user.uid,
                clientId,
            });

            batch.update(chatDocRef, {
                lastMessage: text,
                lastMessageSender: 'admin',
                lastMessageTimestamp: Timestamp.now(),
                lastActivity: Timestamp.now(),
                userUnread: increment(1),
            });

            await batch.commit();
            // onSnapshot will replace local pending message with server doc when it arrives
            // Auto-scroll logic after send: if user isn't far up, animate to bottom; if far, snap.
            try {
                const distance = scrollOffsetRef.current || 0;
                if (listRef.current) {
                    if (distance <= 600) {
                        listRef.current.scrollToOffset({ offset: 0, animated: true });
                    } else if (distance <= 1500) {
                        // moderate distance — still animate
                        listRef.current.scrollToOffset({ offset: 0, animated: true });
                    } else {
                        // very far — snap without heavy animation
                        listRef.current.scrollToOffset({ offset: 0, animated: false });
                    }
                }
            } catch (e) { /* ignore */ }
        } catch (error) {
            console.error('Error sending message:', error);
            setLiveMessages(prev => prev.map(m => m.clientId === clientId ? { ...m, pending: false, failed: true } : m));
        }
    };

    const handleCloseChat = async () => {
        if (!chatId || chatRef.current?.status === 'closed') return;
        // mark local UI as closing to avoid blink while live status updates propagate
        try { setIsClosing(true); } catch (e) { /* ignore */ }
        closeModal();
        try {
            const batch = writeBatch(db);
            const chatDocRef = doc(db, "chats", chatId);
            const systemMessageRef = doc(collection(db, "chats", chatId, "messages"));
            const systemMessageText = "Czat został zamknięty";

            batch.update(chatDocRef, {
                status: "closed",
                closedBy: "admin",
                activeAdminId: null, // Ensure activeAdminId is cleared on close
                lastActivity: Timestamp.now(),
                lastMessage: systemMessageText,
                lastMessageSender: 'system',
                lastMessageTimestamp: Timestamp.now(),
            });

            batch.set(systemMessageRef, { text: systemMessageText, sender: "system", createdAt: Timestamp.now() });

            await batch.commit();
            // toast removed for chat close
        } catch (error) {
            console.error("Error closing chat: ", error);
        }
    };

    const requestCloseChat = () => {
        // ensure header/menu is logically closed before showing modal to avoid race
        try { closeMenu(); } catch (e) { /* ignore if closeMenu not ready */ }
        const config = { title: 'Zamknij czat', message: 'Czy na pewno chcesz zamknąć ten czat? Klient nie będzie mógł już na niego odpowiedzieć.', confirmText: 'Zamknij', onConfirm: handleCloseChat, cancelText: 'Anuluj', variant: 'secondary' as const, showIcon: true };
        const now = Date.now();
        const until = (typeof window !== 'undefined' && (window as any).__modalSuppressedUntil) || 0;
        if (modalLockRef.current || now < until) {
            const delay = Math.max(until - now + 60, 420);
            if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }
            modalTimerRef.current = window.setTimeout(() => {
                if (modalLockRef.current) {
                    modalTimerRef.current = window.setTimeout(() => { showModal(config); modalTimerRef.current = null; }, 420);
                } else {
                    showModal(config);
                    modalTimerRef.current = null;
                }
            }, delay);
            return;
        }
        showModal(config);
    };

    const requestDeleteChat = () => {
        // ensure header/menu is logically closed before showing modal to avoid race
        try { closeMenu(); } catch (e) { /* ignore if closeMenu not ready */ }
        const config = { title: 'Usuń czat', message: 'Czy na pewno chcesz trwale usunąć ten czat? Tej operacji nie można cofnąć.', confirmText: 'Usuń', cancelText: 'Anuluj', onConfirm: handleDeleteChat, variant: 'destructive' as const };
        const now = Date.now();
        const until = (typeof window !== 'undefined' && (window as any).__modalSuppressedUntil) || 0;
        if (modalLockRef.current || now < until) {
            const delay = Math.max(until - now + 60, 420);
            if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }
            modalTimerRef.current = window.setTimeout(() => {
                if (modalLockRef.current) {
                    modalTimerRef.current = window.setTimeout(() => { showModal(config); modalTimerRef.current = null; }, 420);
                } else {
                    showModal(config);
                    modalTimerRef.current = null;
                }
            }, delay);
            return;
        }
        showModal(config);
    };

    const handleAssignChat = async (adminId: string) => {
        if (!chatId) return;
        // jeśli przypisanie jest do tej samej osoby, nic nie rób
        try {
            if (chat && chat.assignedAdminId === adminId) {
                setAssignModalVisible(false);
                return;
            }
        } catch (e) { /* ignore */ }

        try {
            await updateDoc(doc(db, 'chats', chatId), { assignedAdminId: adminId });
            setAssignModalVisible(false);
            try { setTimeout(() => { toast.show({ text: 'Czat przypisany', variant: 'info' , duration: 2500}); }, 220); } catch (e) { /* ignore */ }
        } catch (err) {
            console.error('Failed to assign chat:', err);
            try { setTimeout(() => { toast.show({ text: 'Błąd: nie udało się przypisać czatu', variant: 'error', duration: 2500 }); }, 50); } catch (e) { /* ignore */ }
        }
    };

    const [banModalVisible, setBanModalVisible] = useState(false);
    const [banType, setBanType] = useState<'permanent' | '1h' | '24h' | '7d' | '30d'>('24h');
    const [isClosing, setIsClosing] = useState(false);



    const requestBlockUser = () => {
        setBanModalVisible(true);
    };

    const handleBlockUser = async () => {
        if (!chatId || !chat) return;
        const targetUid = chat.userUid;
        if (!targetUid) {
            setBanModalVisible(false);
            try { setTimeout(() => { toast.show({ text: 'Nie można zablokować — brak UID użytkownika', variant: 'error', duration: 2500 }); }, 50); } catch (e) { /* ignore */ }
            return;
        }

        const batch = writeBatch(db);
        const userRef = doc(db, 'users', targetUid);
        const chatRefDoc = doc(db, 'chats', chatId);

        const now = Timestamp.now();
        let bannedUntil: Timestamp | null = null;
        if (banType === '1h') bannedUntil = Timestamp.fromMillis(now.toMillis() + 1000 * 60 * 60);
        else if (banType === '24h') bannedUntil = Timestamp.fromMillis(now.toMillis() + 1000 * 60 * 60 * 24);
        else if (banType === '7d') bannedUntil = Timestamp.fromMillis(now.toMillis() + 1000 * 60 * 60 * 24 * 7);
        else if (banType === '30d') bannedUntil = Timestamp.fromMillis(now.toMillis() + 1000 * 60 * 60 * 24 * 30);

        batch.set(userRef, {
            isBanned: true,
            bannedUntil: bannedUntil,
            banReason: null,
            bannedAt: now,
            bannedBy: user?.uid || null
        }, { merge: true });

        // denormalize into chat for quick client checks and to avoid extra reads on client
        batch.set(chatRefDoc, {
            userIsBanned: true,
            bannedUntil: bannedUntil,
            banReason: null,
            bannedBy: user?.uid || null,
            bannedAt: now,
            status: 'closed',
            closedBy: 'admin'
        }, { merge: true });

            try {
            await batch.commit();
            setBanModalVisible(false);
            // show bottom toast after modal close animation
            try { setTimeout(() => { toast.show({ text: 'Użytkownik zablokowany', variant: 'lock-locked' }); }, 220); } catch (e) { /* ignore */ }
        } catch (err) {
            console.error('Failed to block user:', err);
            try { setTimeout(() => { toast.show({ text: 'Błąd: nie udało się zablokować użytkownika', variant: 'error', duration: 2500 }); }, 50); } catch (e) { /* ignore */ }
        }
    };

    const handleUnblockUser = async () => {
        if (!chatId || !chat) return;
        const targetUid = chat.userUid;
        if (!targetUid) {
            try { setTimeout(() => { toast.show({ text: 'Nie można odblokować — brak UID użytkownika', variant: 'error', duration: 2500 }); }, 50); } catch (e) { /* ignore */ }
            return;
        }

        const batch = writeBatch(db);
        const userRef = doc(db, 'users', targetUid);
        const chatRefDoc = doc(db, 'chats', chatId);

        batch.set(userRef, {
            isBanned: false,
            bannedUntil: null,
            banReason: null,
            bannedBy: null,
            bannedAt: null
        }, { merge: true });

        batch.set(chatRefDoc, {
            userIsBanned: false,
            bannedUntil: null,
            banReason: null,
            status: 'active',
            closedBy: null
        }, { merge: true });

        try {
            await batch.commit();
            // show bottom toast after modal close (if any) / small delay for UX
            try { setTimeout(() => { toast.show({ text: 'Użytkownik odblokowany', variant: 'lock-unlocked' }); }, 220); } catch (e) { /* ignore */ }
        } catch (err) {
            console.error('Failed to unblock user:', err);
            try { setTimeout(() => { toast.show({ text: 'Błąd: nie udało się odblokować użytkownika', variant: 'error', duration: 2500 }); }, 50); } catch (e) { /* ignore */ }
        }
    };

    const requestAssignChat = () => {
        setAssignModalVisible(true);
    };

    const handleDeleteChat = async () => {
        if (!chatId) return;
        try {
            // mark pending delete so snapshot won't re-add it, then optimistically navigate back
            try { addPendingDelete(chatId); } catch (e) { /* ignore */ }
            // Optimistically navigate back to avoid showing deleted chat
            router.back();

            // Remove from local list immediately
            setChats((prev: Chat[]) => prev.filter((c: Chat) => c.id !== chatId));
            // clear in-memory cache for this chat to avoid stale data
            try { inMemoryMessageCache.delete(chatId); } catch (e) { /* ignore */ }

            // Defer heavy deletion work slightly so navigation/exit animation isn't blocked
            try {
                setTimeout(async () => {
                        try {
                        await deleteCollectionInBatches(db, collection(db, 'chats', chatId, 'messages'));
                        await deleteDoc(doc(db, 'chats', chatId));
                        } catch (err) {
                        console.error('Błąd podczas usuwania czatu (deferred):', err);
                    } finally {
                        try { removePendingDelete(chatId); } catch (e) { /* ignore */ }
                    }
                }, 80);
            } catch (e) { console.error('Failed to schedule chat deletion:', e); }
            // show info toast on delete
            try { setTimeout(() => { toast.show({ text: 'Czat usunięty', variant: 'info' }); }, 120); } catch (e) { /* ignore */ }
        } catch (error) {
            console.error('Błąd podczas usuwania czatu:', error);
            console.error('Usuwanie nie powiodło się');
        }
    };    
    const isChatInitiallyClosed = currentStatus === 'closed';
    const headerTitle = chat?.userInfo.contact || contactName;

    // Custom menu animation state (split logical state and visual animation to avoid race with modals)
    const [menuOpen, setMenuOpen] = useState(false);
    const menuAnim = useSharedValue(0);
    const menuAnimStyle = useAnimatedStyle(() => ({
        opacity: menuAnim.value,
        transform: [
            { scale: interpolate(menuAnim.value, [0, 1], [0.95, 1]) },
            { translateY: interpolate(menuAnim.value, [0, 1], [-10, 0]) },
        ],
    }));

    const openMenu = () => {
        setMenuOpen(true);
        menuAnim.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
    };

    const closeMenu = () => {
        setMenuOpen(false);
        menuAnim.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) });
    };

    return (
        <MenuProvider skipInstanceCheck={true}>
            {/* global overlay for header menu (rendered later with menu) - intentionally not rendered here */}

            <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}> 
                <Animated.View entering={FadeIn.duration(100).easing(Easing.out(Easing.cubic))} exiting={FadeOut.duration(90).easing(Easing.in(Easing.cubic))} style={{ flex: 1 }}>
                    <Animated.View entering={SlideInRight.duration(110).easing(Easing.out(Easing.cubic))} exiting={SlideOutRight.duration(90).easing(Easing.in(Easing.cubic))} style={{ flex: 1 }}>
                        <TabTransition noAnimation={true} style={{ flex: 1 }}>
                        {/* global overlay moved to render after main content so stacking works correctly */}

                {modalConfig?.title && modalConfig?.confirmText && (
                  <ConfirmationModal
                    visible={true}
                    onClose={closeModal}
                    title={modalConfig.title}
                    message={modalConfig.message || ''}
                    confirmText={modalConfig.confirmText}
                    cancelText={modalConfig.cancelText}
                                        variant={modalConfig.variant}
                                        showIcon={modalConfig.showIcon}
                    onConfirm={() => {
                        // capture the action now, then close and run it after animation finishes
                        const onConfirmAction = modalConfig?.onConfirm;
                        closeModal();
                        if (onConfirmAction) {
                            setTimeout(() => {
                                try { onConfirmAction(); } catch (e) { console.error(e); }
                            }, 160);
                        }
                    }}
                  />
                )}
                
                <AnimatedModal visible={isAssignModalVisible} onClose={() => setAssignModalVisible(false)} contentStyle={[styles.confirmModal, styles.shadow]}>
                    <View style={styles.iconInlineWrapper} pointerEvents="none">
                        <View style={[styles.iconCircle, { backgroundColor: themeColors.tint }]}> 
                            <Ionicons name="people" size={22} color="white" style={{ alignSelf: 'center', transform: [{ translateY: -1 }] }} />
                        </View>
                    </View>
                    <Text style={[styles.modalTitle, { color: themeColors.text, marginTop: 8, textAlign: 'center', alignSelf: 'center' }]}>Przypisz do admina</Text>
                    <FlatList
                        data={adminsList}
                        keyExtractor={(item: any) => item.id}
                        style={{ width: '100%', marginTop: 8, maxHeight: 320 }}
                        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: themeColors.border, marginHorizontal: -6 }} />}
                        renderItem={({ item }: { item: any }) => {
                            const disabled = !!(chat && chat.assignedAdminId && chat.assignedAdminId === item.id);
                            const nameSource = (item.displayName || item.email || '')?.toString().trim() || '';
                            const initials = (nameSource.replace(/\s+/g, '').slice(0, 2) || '').toUpperCase();
                            return (
                                <TouchableOpacity
                                    style={[styles.adminRow, disabled ? { opacity: 0.5 } : {}]}
                                    onPress={() => { if (!disabled) handleAssignChat(item.id); }}
                                    disabled={disabled}
                                >
                                    {item.photoURL ? (
                                        <View style={[styles.adminAvatar, styles.adminAvatarModal, { overflow: 'hidden' }]}> 
                                            <Image source={{ uri: item.photoURL }} style={styles.adminAvatarImage} />
                                        </View>
                                    ) : (
                                        <View style={[styles.adminAvatar, styles.adminAvatarModal, { backgroundColor: (item as any).avatarColor || (item as any).color || getAvatarColor(nameSource) }]}> 
                                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{initials}</Text>
                                        </View>
                                    )}
                                    <View style={{ flex: 1, marginLeft: 12 }}>
                                        <Text style={{ color: themeColors.text, fontWeight: '600' }}>{item.displayName || item.email}</Text>
                                        {item.email && <Text style={{ color: themeColors.textMuted, fontSize: 13 }}>{item.email}</Text>}
                                    </View>
                                    {disabled && <Ionicons name="checkmark" size={18} color={themeColors.tint} />}
                                </TouchableOpacity>
                            );
                        }}
                    />
                    <View style={{ flexDirection: 'row', width: '100%', marginTop: 12 }}>
                        <TouchableOpacity style={[styles.button, styles.buttonCancel, { backgroundColor: themeColors.input, flex: 1, marginRight: 8 }]} onPress={() => setAssignModalVisible(false)}>
                            <Text style={[styles.buttonText, { color: themeColors.text }]}>Anuluj</Text>
                        </TouchableOpacity>
                    </View>
                </AnimatedModal>

                <AnimatedModal visible={banModalVisible} onClose={() => setBanModalVisible(false)} contentStyle={[styles.confirmModal, styles.shadow]}>
                        <View style={styles.iconInlineWrapper} pointerEvents="none">
                            <View style={[styles.iconCircle, { backgroundColor: themeColors.danger }]}> 
                                <Ionicons name="ban" size={22} color="white" style={{ alignSelf: 'center', transform: [{ translateY: -1 }] }} />
                            </View>
                        </View>
                        <Text style={[styles.modalTitle, { color: themeColors.text, marginTop: 8 }]}>Zablokuj użytkownika</Text>
                        <Text style={{ color: themeColors.textMuted, marginBottom: 12 }}>Wybierz czas trwania blokady</Text>

                        <View style={styles.durationGridCompact}>
                            <TouchableOpacity onPress={() => setBanType('permanent')} style={[styles.durationTileCompact, banType === 'permanent' ? { borderColor: themeColors.tint, backgroundColor: themeColors.tint + '10' } : { backgroundColor: 'transparent' }]}>
                                <Text style={{ color: themeColors.text, textAlign: 'center' }}>Na stałe</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setBanType('1h')} style={[styles.durationTileCompact, banType === '1h' ? { borderColor: themeColors.tint, backgroundColor: themeColors.tint + '10' } : { backgroundColor: 'transparent' }]}>
                                <Text style={{ color: themeColors.text }}>1h</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setBanType('24h')} style={[styles.durationTileCompact, banType === '24h' ? { borderColor: themeColors.tint, backgroundColor: themeColors.tint + '10' } : { backgroundColor: 'transparent' }]}>
                                <Text style={{ color: themeColors.text }}>24h</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setBanType('7d')} style={[styles.durationTileCompact, banType === '7d' ? { borderColor: themeColors.tint, backgroundColor: themeColors.tint + '10' } : { backgroundColor: 'transparent' }]}>
                                <Text style={{ color: themeColors.text }}>7d</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setBanType('30d')} style={[styles.durationTileCompact, banType === '30d' ? { borderColor: themeColors.tint, backgroundColor: themeColors.tint + '10' } : { backgroundColor: 'transparent' }]}>
                                <Text style={{ color: themeColors.text }}>30d</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 14 }}>
                            <TouchableOpacity style={[styles.banButton, styles.banButtonCancel, { backgroundColor: themeColors.input }]} onPress={() => setBanModalVisible(false)}>
                                <Text style={[styles.buttonText, { color: themeColors.text }]}>Anuluj</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.banButton, { backgroundColor: themeColors.danger }]} onPress={handleBlockUser}>
                                <Text style={[styles.buttonTextConfirm]}>Zablokuj</Text>
                            </TouchableOpacity>
                        </View>
                </AnimatedModal>

                <View style={[styles.header, { height: 60 + (insets?.top || 0), paddingTop: (insets?.top || 0), borderBottomColor: 'transparent', borderBottomWidth: 0, backgroundColor: themeColors.background, zIndex: 50, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6 }]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
                        <Ionicons name="arrow-back" size={24} color={themeColors.tint} />
                        {showBackButtonBadge && <View style={[styles.backButtonBadge, { backgroundColor: themeColors.danger, borderColor: themeColors.background }]} />}
                    </TouchableOpacity>
                    <View style={styles.headerTitleContainer}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', maxWidth: '100%' }}>
                            <Text style={[styles.headerTitle, { color: themeColors.text }]} numberOfLines={1}>{headerTitle}</Text>
                            {chat?.userIsBanned && (
                                <Ionicons name="lock-closed" size={14} color={themeColors.danger} style={{ marginLeft: 8 }} />
                            )}
                        </View>
                        <Text style={[styles.headerSubtitle, { color: themeColors.textMuted }]}>Klient</Text>
                    </View>
                    <View style={[styles.headerRightContainer, { position: 'relative' }]}>
                        {!isClosing && chat && chat.status !== 'closed' && (
                            <TouchableOpacity onPress={requestCloseChat} style={[styles.headerActionButton, { backgroundColor: '#2C2C2E' }]}>
                                <Text style={styles.headerActionButtonText}>Zamknij</Text>
                            </TouchableOpacity>
                        )}
                        {chat?.status === 'closed' && (
                            <TouchableOpacity onPress={() => { try { requestDeleteChat(); } catch(e) { console.error(e); } }} style={[styles.headerActionButton, { backgroundColor: themeColors.danger }]}>
                                <Text style={[styles.headerActionButtonText, { color: '#fff' }]}>Usuń</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => (menuOpen ? closeMenu() : openMenu())}>
                            <Ionicons name="ellipsis-vertical" size={24} color={themeColors.text} style={{ padding: 5, marginLeft: 5 }}/>
                        </TouchableOpacity>
                    </View>
                </View>
                    {messagesLoading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={themeColors.tint} /></View> : (
                        <View style={{ flex: 1, overflow: 'hidden' }} onLayout={(e) => { if (chatHeight == null) setChatHeight(e.nativeEvent.layout.height); }}>
                            <View style={{ height: chatHeight ?? '100%', position: 'relative' }}>
                                <Animated.View style={[{ flex: 1, width: '100%', transform: [{ scaleY: -1 }] }, listStyle]}>
                                    <FlashList
                                        key={chatId || 'chat'}
                                        ref={(r) => { listRef.current = r; }}
                                        data={listData}
                                        extraData={activeMessageId}
                                        // Items are flipped back in `renderItem` so leave content container un-flipped.
                                        contentContainerStyle={styles.listContent}
                                        renderItem={renderItem}
                                        getItemType={(item: any) => item?.layoutType || item?.type || 'message'}
                                        keyExtractor={(item, idx) => {
                                            if (!item) return String(idx);
                                            const m = item?.message as any;
                                            const rawId = (m && (m.id || m.clientId || (m.createdAt && (typeof m.createdAt.toMillis === 'function' ? m.createdAt.toMillis() : m.createdAt))))?.toString();
                                            const id = rawId && rawId.length ? rawId : String(idx);
                                            return `${chatId || 'chat'}-${id}`;
                                        }}
                                        estimatedItemSize={160}
                                        {...(flashListExtraProps as any)}
                                        showsVerticalScrollIndicator={true}
                                        scrollIndicatorInsets={{ right: 1 }}
                                        // contentContainerStyle moved above to include transform
                                        keyboardShouldPersistTaps="handled"
                                        // With the transform flip we keep logical ordering
                                        // (newest at logical start). Load older messages when
                                        // the logical end is reached (onEndReached).
                                        onEndReached={() => loadOlderMessages()}
                                        onEndReachedThreshold={0.2}
                                        ListFooterComponent={isLoadingMore ? <ActivityIndicator size="small" color={themeColors.tint} /> : null}
                                        // Keep internal scroll refs in sync
                                        onScroll={handleScroll}
                                        onScrollBeginDrag={onScrollBeginDrag}
                                        onMomentumScrollEnd={onScrollEnd}
                                        scrollEventThrottle={16}
                                        // Ensure initial mount doesn't cut off the bottom — scroll once after content measures
                                        onContentSizeChange={() => {
                                            if (!initialScrollDoneRef.current) {
                                                initialScrollDoneRef.current = true;
                                                requestAnimationFrame(() => { try { listRef.current?.scrollToOffset({ offset: 0, animated: false }); } catch (e) { /* ignore */ } });
                                            }
                                        }}
                                    />
                                    {/* Scroll-to-bottom arrow removed */}
                                </Animated.View>

                                {/* Input overlay (absolute) - animated via translateY so list layout stays static) */}
                                <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, height: isChatInitiallyClosed ? 36 : INPUT_HEIGHT, backgroundColor: themeColors.background, zIndex: 9999, elevation: 0, shadowColor: 'transparent', justifyContent: isChatInitiallyClosed ? 'center' : undefined }, inputAnim]} pointerEvents="auto">
                                    {isChatInitiallyClosed ? (
                                        <View style={[styles.inputContainer, { borderTopColor: themeColors.border, backgroundColor: themeColors.background, paddingVertical: 4, paddingBottom: 0, justifyContent: 'center', alignItems: 'center', transform: [{ translateY: -12 }] }]}>
                                            <Text style={[styles.closedChatText, { flex: 0, color: themeColors.textMuted, textAlign: 'center', textAlignVertical: 'center', fontSize: 13, marginTop: 12 }]}>Czat został zamknięty</Text>
                                        </View>
                                    ) : chat?.userIsBanned ? (
                                        <View style={[styles.inputContainer, { borderTopColor: themeColors.border, backgroundColor: themeColors.background, padding: 12, paddingBottom: bottomInset }]}>
                                            <Text style={{ color: themeColors.danger, marginBottom: 6 }}>Użytkownik zbanowany{chat.bannedUntil ? ` do ${chat.bannedUntil.toDate().toLocaleString()}` : ''}</Text>
                                            <Text style={[styles.closedChatText, { color: themeColors.textMuted }]}>Wysyłanie wiadomości zostało zablokowane dla tego użytkownika.</Text>
                                        </View>
                                    ) : (
                                        <View style={[styles.inputContainer, { borderTopColor: themeColors.border, borderTopWidth: 0, backgroundColor: themeColors.background, paddingBottom: bottomInset }]}>
                                            <TextInput nativeID="chat-new-message" style={[styles.input, { color: themeColors.text, backgroundColor: '#f3f4f8' }]} value={newMessage} onChangeText={setNewMessage} placeholder="Napisz wiadomość..." placeholderTextColor={themeColors.textMuted} multiline autoComplete="off" />
                                            <TouchableOpacity onPress={handleSend} style={[styles.sendButton, { backgroundColor: themeColors.tint }]}><Ionicons name="send" size={20} color="white" /></TouchableOpacity>
                                        </View>
                                    )}
                                </Animated.View>
                            </View>
                        </View>
                    )}
                        </TabTransition>
                    </Animated.View>
                </Animated.View>
            </SafeAreaView>
            {/* Render the custom menu last so it sits above the overlay and receives touches inside it.
                Render when logically open or when animation still running. Overlay is only active while logically open. */}
            {(menuOpen || menuAnim.value > 0) && (
                <>
                    {menuOpen && (
                        <Pressable
                            style={[StyleSheet.absoluteFill, { zIndex: 9980 }]}
                            onPress={closeMenu}
                            pointerEvents={'auto'}
                        />
                    )}

                    <Animated.View pointerEvents={menuOpen ? 'auto' : 'none'} style={[styles.customMenu, menuAnimStyle, { backgroundColor: themeColors.background, zIndex: 9999 }]}> 
                        <TouchableOpacity onPress={() => { closeMenu(); requestAssignChat(); }} style={styles.customMenuItem} activeOpacity={0.7}>
                            <Text style={[styles.customMenuText, { color: themeColors.text }]}>Przypisz do...</Text>
                        </TouchableOpacity>
                        {chat?.userIsBanned ? (
                            <TouchableOpacity onPress={() => { closeMenu(); try { handleUnblockUser(); } catch (e) { console.error(e); } }} style={styles.customMenuItem} activeOpacity={0.7}>
                                <Text style={[styles.customMenuText, { color: themeColors.text }]}>Odbanuj użytkownika</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity onPress={() => { closeMenu(); requestBlockUser(); }} style={styles.customMenuItem} activeOpacity={0.7}>
                                <Text style={[styles.customMenuText, { color: themeColors.danger }]}>Zablokuj użytkownika</Text>
                            </TouchableOpacity>
                        )}
                    </Animated.View>
                </>
            )}
        </MenuProvider>
    );
};

const styles = StyleSheet.create({
    pillButton: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, marginRight: 10, marginBottom: 10 },
    modalCancelButton: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, minWidth: 120, alignItems: 'center' },
    modalCancelText: { fontSize: 16, fontWeight: '600' },
    destructiveButton: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, minWidth: 120, alignItems: 'center' },
    destructiveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    container: { flex: 1 },
    header: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: 0 },
    headerIcon: { padding: 5, marginLeft: 5, position: 'relative' },
    backButtonBadge: { position: 'absolute', top: 3, right: 3, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, },
    headerTitleContainer: { flex: 1, marginLeft: 15, alignItems: 'flex-start' },
    headerTitle: { fontSize: 17, fontWeight: '600' },
    headerSubtitle: { fontSize: 13, opacity: 0.8 },
    headerRightContainer: { flexDirection: 'row', alignItems: 'center' },
    
    customMenu: {
        position: 'absolute',
        right: 0,
        top: 44,
        borderRadius: 8,
        overflow: 'hidden',
        minWidth: 220,
        paddingVertical: 6,
        paddingHorizontal: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 8,
    },
    customMenuItem: {
        width: '100%',
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    customMenuText: {
        fontSize: 15,
    },
    headerActionButton: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginHorizontal: 5, justifyContent: 'center', alignItems: 'center' },
    headerActionButtonText: { color: 'white', fontSize: 13, fontWeight: '500' },
    // Use paddingBottom because the list is visually flipped via parent transform.
    // Logical bottom padding becomes visual top padding, which provides space
    // above older messages.
    listContent: { paddingBottom: 10, paddingHorizontal: 6, },
    timeSeparatorContainer: { alignItems: 'center', marginVertical: 8 },
    timeSeparatorFullRow: { width: '100%', alignItems: 'center', marginVertical: 8 },
    timestamp: { fontSize: 12, color: '#999', marginBottom: 2 },
    timeSeparatorPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
    timeSeparatorText: { fontSize: 12, color: '#777' },
    minimalMessageRow: { paddingHorizontal: 12, paddingVertical: 8 },
    minimalMessageText: { fontSize: 16, lineHeight: 22 },
    // new row-based layout for proper left/right alignment
    row: { width: '100%', flexDirection: 'row', position: 'relative' },
    left: { justifyContent: 'flex-start' },
    right: { justifyContent: 'flex-end' },
    messageRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
    myMessageRow: { alignSelf: 'flex-end' },
    theirMessageRow: { alignSelf: 'flex-start' },
    avatarContainer: { width: 54, alignItems: 'center', justifyContent: 'center' },
    avatarWrap: { position: 'absolute', left: 0, bottom: 0, width: 54, height: 54, justifyContent: 'center', alignItems: 'center', transform: [{ translateY: 9 }, { translateX: -9 }] },
    senderName: { fontSize: 13, color: '#666', marginBottom: 5, marginLeft: 10, fontWeight: '500' },
    messageOuter: {},
    bubbleWrapper: {},
    stack: { flexDirection: 'column', alignItems: 'flex-start', maxWidth: '82%' },
    rightStack: { alignItems: 'flex-end' },
    leftStack: { alignItems: 'flex-start' },
    messageContentContainer: { flex: 1 },
    bubble: { paddingVertical: 6, paddingHorizontal: 13, borderRadius: 17, flexShrink: 1 },
    bubbleWrap: { position: 'relative' },
    bubbleWrapLeft: { alignSelf: 'flex-start' },
    bubbleWrapRight: { alignSelf: 'flex-end' },
    timestampBlock: { fontSize: 12, marginBottom: 1, flexWrap: 'nowrap' },
    // timestampAnchor removed in favor of bubbleWrap-anchored timestamp
    timestampAnchor: { width: '100%', marginBottom: 4 },
    // timestampAnchor is aligned via bubbleWrapLeft / bubbleWrapRight (alignSelf)
    adminBubble: { backgroundColor: '#2F80ED' },
    userBubble: { backgroundColor: '#f3f4f8' },
    myMessageBubble: { marginLeft: 0, marginRight: 0 },
    theirMessageBubble: { backgroundColor: '#f3f4f8', marginLeft: 0, marginRight: 0 },
    stackPadLeft: { paddingLeft: 2 },
    stackPadRight: { paddingRight: 2 },
    avatarAbsolute: { position: 'absolute', left: 0, bottom: 0, width: 54, height: 54, justifyContent: 'center', alignItems: 'center' },
    bubbleWithAvatar: { marginLeft: 40 },
    timestampContainer: { marginBottom: 2 },
    aiAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
    aiMessageBubble: { backgroundColor: '#e8e8eb' },
    soloBubble: { borderRadius: 20 },
    // Admin (my) messages: left edge is the base (keep fully rounded), right edge reduces when joined
    myBubble_first: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 6 },
    myBubble_middle: { borderTopLeftRadius: 20, borderTopRightRadius: 6, borderBottomLeftRadius: 20, borderBottomRightRadius: 6 },
    myBubble_last: { borderTopLeftRadius: 20, borderTopRightRadius: 6, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
    // User (their) messages: right edge is the base (keep fully rounded), left edge reduces when joined
    theirBubble_first: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 6, borderBottomRightRadius: 20 },
    theirBubble_middle: { borderTopLeftRadius: 6, borderTopRightRadius: 20, borderBottomLeftRadius: 6, borderBottomRightRadius: 20 },
    theirBubble_last: { borderTopLeftRadius: 6, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
    myMessageText: { color: 'white', fontSize: 16, lineHeight: 24 },
    // production text style for bubbles
    text: { fontSize: 16, lineHeight: 24, flexShrink: 1, flexWrap: 'wrap' },
    adminText: { color: '#fff' },
    theirMessageText: { color: '#000' },
    systemMessageContainer: { alignSelf: 'center', marginVertical: 10, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, backgroundColor: '#8A8A8D' },
    systemMessageText: { fontSize: 12, fontWeight: '500' },
    dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 15, paddingHorizontal: 20, },
    dividerLine: { flex: 1, height: 1, },
    dividerText: { marginHorizontal: 10, fontSize: 12, fontWeight: '500', },
    inputContainer: { flexDirection: 'row', padding: 12, borderTopWidth: 1, alignItems: 'center' },
    closedChatText: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '500' },
    input: { flex: 1, borderRadius: 21, paddingHorizontal: 18, marginRight: 10, borderWidth: 0, fontSize: 16, paddingTop: Platform.OS === 'ios' ? 10 : 8, paddingBottom: Platform.OS === 'ios' ? 10 : 8 },
    sendButton: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
        width: '80%',
        borderRadius: 10,
        padding: 20,
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 15,
    },
    adminItem: {
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        width: '100%',
        alignItems: 'center',
    },
    closeModalButton: {
        marginTop: 20,
    },
    /* Ban modal / shared modal styles */
    confirmBackground: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    animatedBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    confirmModal: {
        margin: 20,
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
        width: '85%',
    },
    shadow: {
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 5 },
                shadowOpacity: 0.15,
                shadowRadius: 15,
            },
            android: { elevation: 10 },
            web: { boxShadow: '0px 5px 15px rgba(0,0,0,0.15)' },
        })
    },
    iconInlineWrapper: {
        marginBottom: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 6,
    },
    adminRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6 },
    adminAvatar: { width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center' },
    adminAvatarModal: { width: 32, height: 32, borderRadius: 16 },
    adminAvatarImage: { width: '100%', height: '100%', borderRadius: 16 },
    adminAvatarText: { fontSize: 12, fontWeight: '700' },
    /* Ban modal compact duration grid */
    durationGridCompact: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 8 },
    durationTileCompact: { width: '48%', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#ddd', marginBottom: 10 },
    /* Ban modal button styles */
    banButton: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginHorizontal: 6 },
    banButtonCancel: { marginRight: 6 },
    durationGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 8 },
    durationTile: { width: '30%', borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ddd', marginBottom: 10 },
    button: { borderRadius: 15, padding: 12, alignItems: 'center' },
    buttonCancel: { },
    buttonText: { fontSize: 17, fontWeight: '600' },
    buttonTextConfirm: { color: 'white', fontSize: 17, fontWeight: '700' },
}
);

export default ConversationScreen;
