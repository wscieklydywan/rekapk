
import { useChatContext } from '@/app/contexts/ChatProvider';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { Chat, Message, User } from '@/schemas';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { collection, doc, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, startAfter, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, FlatList, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnimatedModal from '@/components/AnimatedModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import TabTransition from '@/components/TabTransition';
import { showMessage } from '@/lib/showMessage';
import { Menu, MenuOption, MenuOptions, MenuProvider, MenuTrigger } from 'react-native-popup-menu';

const GROUP_THRESHOLD_MINUTES = 3;
const MESSAGES_LIMIT = 50; // number of messages to keep in live subscription
// Dev-only: enable verbose message subscription logging when running in dev
const DEV_MSG_LOGGING = (global as any).__DEV__ || process.env.NODE_ENV === 'development';

// In-memory cache to provide instant "messenger feel" across navigations
const inMemoryMessageCache: Map<string, { messages: any[]; lastVisible?: number; lastVisibleDocId?: string; lastVisibleDoc?: any; updatedAt?: number }> = new Map();

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
    const isMyMessage = message.sender === 'admin';

    if (message.sender === 'system') {
        const lowerCaseText = message.text.toLowerCase();
        const isContextMessage = lowerCaseText.includes('kontekst rozmowy z ai') || lowerCaseText.includes('koniec rozmowy z konsultantem ai');

        if (isContextMessage) {
            const cleanedText = message.text.replace(/^-+\s*|\s*-+$/g, '').trim();
            return (
                <View style={styles.dividerContainer}>
                    <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
                    <Text style={[styles.dividerText, { color: themeColors.textMuted }]}>{cleanedText}</Text>
                    <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
                </View>
            );
        }
        return <View style={styles.systemMessageContainer}><Text style={[styles.systemMessageText, {color: '#FEFEFE'}]}>{message.text}</Text></View>;
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

    const bubbleStyles: any[] = [styles.messageBubble];
    const messageRowStyle = [
        styles.messageRow,
        isMyMessage ? styles.myMessageRow : styles.theirMessageRow,
        { marginBottom: isLastInGroup ? 2 : 1 }
    ];

    const tooltipTimerRef = useRef<number | null>(null);

    const formattedTime = React.useMemo(() => {
        if (!message.createdAt?.toDate) return '';
        const d = new Date(message.createdAt.toDate());
        const now = new Date();
        const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
        const daysDiff = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / (1000 * 60 * 60 * 24));
        const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Today => show time only
        if (daysDiff === 0) return time;

        // Within last 7 days => show short weekday (e.g., "czw.") + time
        if (daysDiff > 0 && daysDiff < 7) {
            const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d);
            return `${weekday} o ${time}`;
        }

        // Older this year => show day + short month (e.g., "11 sty.") + time
        const monthShort = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(d);
        const day = d.getDate();
        if (d.getFullYear() === now.getFullYear()) {
            return `${day} ${monthShort} o ${time}`;
        }

        // Older than this year => include year
        return `${day} ${monthShort} ${d.getFullYear()} o ${time}`;
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
                            <Ionicons 
                                name={message.sender === 'ai' ? "hardware-chip-outline" : "person-circle-outline"} 
                                size={30} 
                                color={themeColors.textMuted} 
                            />
                        ) : (
                            <View style={{width: 30}} />
                        )}
                    </View>
                )}
                <View style={styles.messageContentContainer}>
                    {showAdminName && adminName && (
                        <Text style={[styles.senderName, { alignSelf: 'flex-end', marginRight: 15, color: themeColors.textMuted }]}> 
                            {adminName}
                        </Text>
                    )}
                    {!isMyMessage && isFirstInGroup && (
                        <Text style={[styles.senderName, { color: themeColors.textMuted }]}>
                            {message.sender === 'ai' ? 'Konsultant AI' : 'Klient'}
                        </Text>
                    )}

                    <View style={styles.messageOuter}>
                        {showTimestampLocal && (
                            <Text style={[styles.timestampText, isMyMessage ? { textAlign: 'right', color: '#999', marginBottom: 4 } : { color: themeColors.textMuted, marginBottom: 4 }]}>
                                {formattedTime}
                            </Text>
                        )}

                        <View style={[styles.bubbleWrapper, isMyMessage ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
                            <Pressable onPress={() => onToggleActive(message.id, index)} style={bubbleStyles}>
                                <Text style={isMyMessage ? styles.myMessageText : [styles.theirMessageText, { color: themeColors.text }]}>
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
                    </View>
                </View>
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
    const navigation = useNavigation();
    const { id: chatId, status: initialStatus, contactName: encodedContactName } = useLocalSearchParams<{ id: string; status?: Chat['status'], contactName?: string }>();
    const theme = useColorScheme() ?? 'light';
    const themeColors = Colors[theme];
    const insets = useSafeAreaInsets();

    const [chat, setChat] = useState<Chat | null>(null);
    const chatRef = useRef<Chat | null>(null);
    const [liveMessages, setLiveMessages] = useState<Message[]>([]);
    const [olderMessages, setOlderMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isLoadingMore, setLoadingMore] = useState(false);
    const [hasMoreOlder, setHasMoreOlder] = useState(true);
    const lastVisibleDocRef = useRef<any | null>(null);
    const lastVisibleDocIdRef = useRef<string | null>(null);
    const lastVisibleTimestampRef = useRef<number | null>(null);
    const firstSnapshotRef = useRef(true);
    const firstSnapshotAppliedRef = useRef(false);

    const combinedMessages = useMemo(() => {
        // Deduplicate messages by id to avoid duplicate keys in lists (e.g., same message present in live and older arrays)
        const seen = new Set<string>();
        const combined: Message[] = [];
        for (const m of [...liveMessages, ...olderMessages]) {
            if (!m || !m.id) continue;
            if (seen.has(m.id)) {
                try {
                    if ((global as any).__DEV__ || process.env.NODE_ENV === 'development') console.warn('[chat] Duplicate message id skipped in combinedMessages', { chatId, id: m.id, sender: m.sender });
                } catch (e) {}
                continue;
            }
            seen.add(m.id);
            combined.push(m);
        }
        return combined;
    }, [liveMessages, olderMessages]);
    // Per new mount rule: render-only on first frame — loading must be false immediately
    const [loading, setLoading] = useState(false);


    // Presence cooldown guard (ms) and last-sent timestamp
    const PRESENCE_COOLDOWN_MS = 1000;
    const presenceLastSentAtRef = useRef<number | null>(null);

    // Presence helpers (synchronous-feel): optimistic local update + immediate server fire-and-forget
    const goOnlineImmediate = async (chatIdParam: string, adminIdParam: string) => {
        try {
            const chatDocRef = doc(db, 'chats', chatIdParam);
            const docSnap = await getDoc(chatDocRef);
            if (!docSnap.exists()) {
                console.warn('Chat does not exist (goOnlineImmediate)');
                router.back();
                return;
            }
            const chatData = docSnap.data() as Chat;
            if (chatData.activeAdminId !== adminIdParam) {
                // fire-and-forget update
                try { await updateDoc(chatDocRef, { activeAdminId: adminIdParam }); } catch(e) { console.error('goOnlineImmediate updateDoc failed', e); }
            }
            if (chatData.adminUnread > 0) {
                try { await updateDoc(chatDocRef, { adminUnread: 0, lastPushAt: null }); } catch(e) { console.error('goOnlineImmediate clear unread failed', e); }
            }
        } catch (error) {
            console.error('Error in goOnlineImmediate:', error);
        }
    };

    const goOfflineImmediate = async (chatIdParam: string, adminIdParam: string) => {
        try {
            // Optimistic local update for instant UI feedback
            setChat(prev => prev && prev.id === chatIdParam && prev.activeAdminId === adminIdParam ? { ...prev, activeAdminId: null, lastActivity: Timestamp.now() } : prev);

            // cooldown guard to avoid spamming writes
            const now = Date.now();
            if (presenceLastSentAtRef.current && now - presenceLastSentAtRef.current < PRESENCE_COOLDOWN_MS) return;
            presenceLastSentAtRef.current = now;

            const chatDocRef = doc(db, 'chats', chatIdParam);
            const docSnap = await getDoc(chatDocRef);
            if (docSnap.exists() && docSnap.data().activeAdminId === adminIdParam) {
                try { await updateDoc(chatDocRef, { activeAdminId: null, lastActivity: Timestamp.now() }); } catch(e) { console.error('goOfflineImmediate updateDoc failed', e); }
            }
        } catch (error) {
            console.error('Error in goOfflineImmediate:', error);
        }
    };

    // Presence effect: run immediately on mount/enter (server-only, fire-and-forget)
    // NOTE: we intentionally do NOT mutate local chat state optimistically — presence is a server-side semantic command.
    useEffect(() => {
        if (!chatId || !user) return;
        const adminId = user.uid;

        // initiate server-side presence immediately (fire-and-forget)
        (async () => { await goOnlineImmediate(chatId, adminId); })();

        // On unmount: immediately notify server we're offline (fire-and-forget). Do NOT rely on rAF or local state.
        return () => {
            (async () => { await goOfflineImmediate(chatId, adminId); })();
        };
    }, [chatId, user]);

    // If navigation away begins (back swipe/hardware button), immediately notify server we're offline so presence updates before animation completes
    useEffect(() => {
        if (!navigation || !chatId || !user) return;
        const handler = () => {
            // fire-and-forget: we don't block navigation
            (async () => { await goOfflineImmediate(chatId, user.uid); })();
        };
        const unsub = navigation.addListener('beforeRemove', handler);
        return () => { try { unsub(); } catch (e) {} };
    }, [navigation, chatId, user]);

    // Android hardware back: ensure presence is notified immediately before default back behavior
    useEffect(() => {
        if (Platform.OS !== 'android' || !chatId || !user) return;
        const onHardwareBack = () => {
            (async () => { await goOfflineImmediate(chatId, user.uid); })();
            // return false so default back behavior proceeds
            return false;
        };
        BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
        return () => { BackHandler.removeEventListener('hardwareBackPress', onHardwareBack); };
    }, [chatId, user]);

    const [modalConfig, setModalConfig] = useState<{ title: string; message: string; confirmText: string; onConfirm: () => void; cancelText?: string; variant?: 'destructive' | 'secondary'; } | null>(null);

    // Prevent other modals from appearing immediately after this one closes (fixes a brief "OK" flash)
    const modalLockRef = useRef(false);
    const modalTimerRef = useRef<number | null>(null);

    // Active message tooltip control (only one active at a time)
    const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
    const [activeMessageIndex, setActiveMessageIndex] = useState<number | null>(null);
    const listRef = useRef<FlatList<any> | null>(null);

    const handleToggleActive = (id: string | null, idx?: number) => {
        if (!id) {
            setActiveMessageId(null);
            setActiveMessageIndex(null);
            return;
        }
        if (activeMessageId === id) {
            setActiveMessageId(null);
            setActiveMessageIndex(null);
        } else {
            // Do NOT perform any autoscroll here — just mark active message.
            setActiveMessageId(id);
            setActiveMessageIndex(typeof idx === 'number' ? idx : null);
        }
    };



    // When deferredReady becomes true, perform all writes, initial fetches and subscriptions.
    useEffect(() => {
        if (!chatId || !user) return;

        let unsubChat: (() => void) | null = null;
        let unsubMessages: (() => void) | null = null;
        let appStateSubscription: any = null;
        let cancelled = false;

        const chatDocRef = doc(db, 'chats', chatId);
        const adminId = user.uid;

        // initial heavy load (writes that change chat status, messages waiting->active etc.)
        const handleInitialLoad = async () => {
            try {
                const docSnap = await getDoc(chatDocRef);
                if (!docSnap.exists()) {
                    if (!cancelled) {
                        if (user) { (async () => { await goOfflineImmediate(chatId, user.uid); })(); }
                        router.back();
                    }
                    return;
                }
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
                    await batch.commit();
                }
            } catch (error) {
                console.error("Błąd podczas ładowania czatu:", error);
                if (!cancelled) {
                    if (user) { (async () => { await goOfflineImmediate(chatId, user.uid); })(); }
                    router.back();
                }
            }
        };

        handleInitialLoad();

        handleInitialLoad();

        // subscribe to chat doc
        unsubChat = onSnapshot(chatDocRef, (docSnap) => {
            if (cancelled) return;
            if (docSnap.exists()) {
                setChat({ id: docSnap.id, ...docSnap.data() } as Chat);
            } else {
                if (!cancelled) {
                    if (user) { (async () => { await goOfflineImmediate(chatId, user.uid); })(); }
                    router.back();
                }
            }
        });

        // subscribe to messages
        const messagesQuery = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'desc'), limit(MESSAGES_LIMIT));
        unsubMessages = onSnapshot(messagesQuery, (snapshot) => {

            if (firstSnapshotRef.current && !firstSnapshotAppliedRef.current) {
                // initial load -> populate live messages (merge-safe with cache)
                firstSnapshotAppliedRef.current = true;
                const docs = snapshot.docs;
                const msgs = docs
                    .map(doc => ({ ...doc.data(), id: doc.id } as Message))
                    .filter(m => {
                        const hasText = !!(m.text && String(m.text).trim().length > 0);
                        if (!hasText) {
                            try { console.warn('[chat] Skipping empty initial message', { chatId, id: m.id, sender: m.sender, raw: m }); } catch (e) {}
                        }
                        return hasText;
                    }); // ignore empty messages

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
                // loading is intentionally false on first frame; don't block render
                setLoading(false);
                return;
            }

            // Batch-process docChanges and merge into current state to avoid replacing full history
            const changes = snapshot.docChanges();
            if (!changes || changes.length === 0) return;

            let overflowToOlder: Message[] = [];

            setLiveMessages((prev) => {
                let next = [...prev];

                for (const change of changes) {
                    const docData = { ...change.doc.data(), id: change.doc.id } as Message & any;
                    const docClientId = (change.doc.data() as Partial<Message>)?.clientId;

                    if (change.type === 'added') {
                        // ignore empty messages
                        if (!docData.text || String(docData.text).trim().length === 0) {
                            try { console.warn('[chat] Skipping empty added message', { chatId, id: docData.id || change.doc.id, sender: docData.sender, raw: docData }); } catch (e) {}
                            continue;
                        }

                        // Replace local pending by clientId if present
                        if (docClientId) {
                            const idx = next.findIndex(m => m.clientId === docClientId);
                            if (idx !== -1) {
                                next[idx] = docData;
                                continue;
                            }
                        }

                        // Replace if we already have server id
                        const existingIndexById = next.findIndex(m => m.id === docData.id);
                        if (existingIndexById !== -1) {
                            next[existingIndexById] = docData;
                            continue;
                        }

                        // Replace by clientId if present
                        const existingIndexByClient = docClientId ? next.findIndex(m => m.clientId === docClientId) : -1;
                        if (existingIndexByClient !== -1) {
                            next[existingIndexByClient] = docData;
                            continue;
                        }

                        // Insert at reported index (safety-bounded)
                        const insertIndex = Math.min((change as any).newIndex ?? next.length, next.length);
                        next.splice(insertIndex, 0, docData);

                    } else if (change.type === 'modified') {
                        const i = next.findIndex(m => m.id === docData.id || m.clientId === docClientId);
                        if (i === -1) continue;
                        next[i] = docData;

                    } else if (change.type === 'removed') {
                        next = next.filter(m => m.id !== docData.id && m.clientId !== docClientId);
                    }
                }

                // If we exceed MESSAGES_LIMIT, move overflow to olderMessages buffer
                while (next.length > MESSAGES_LIMIT) {
                    const overflow = next.pop()!;
                    overflowToOlder.push(overflow);
                }

                return next;
            });

            if (overflowToOlder.length) {
                setOlderMessages((old) => [...old, ...overflowToOlder]);
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

    }, [chatId, user, router]);

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
                if ((global as any).__DEV__ || DEV_MSG_LOGGING) console.log('[chat] Using in-memory cache for', chatId, 'msgs', entry.messages.length);
                // normalize createdAt back to Timestamp for UI/logic
                const restored = entry.messages.map((m: any) => ({ ...m, createdAt: typeof m.createdAt === 'number' ? Timestamp.fromMillis(m.createdAt) : m.createdAt } as Message));
                setLiveMessages(restored);
                lastVisibleTimestampRef.current = entry.lastVisible || null;
                lastVisibleDocIdRef.current = entry.lastVisibleDocId || null;
                lastVisibleDocRef.current = entry.lastVisibleDoc || null;
                cacheLoadedRef.current = true;
            }
        } catch (e) {
            console.error('Error reading in-memory cache:', e);
        }
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
                    return;
                }
                const parsed = JSON.parse(raw) as { messages?: Array<any>, lastVisible?: number, lastVisibleDocId?: string };
                if (!parsed || !parsed.messages || !parsed.messages.length) {
                    cacheLoadedRef.current = true;
                    return;
                }
                // convert stored timestamps (ms) back to Timestamp
                const cached = parsed.messages.map(p => ({ ...p, createdAt: Timestamp.fromMillis(p.createdAt), pending: false, failed: false } as Message));
                if (cancelled) return;
                // Merge cached messages with any existing live messages, but prefer server/live if present
                setLiveMessages((prev) => {
                    // If we already have messages (from in-memory), prefer those if they are newer
                    if (!prev || prev.length === 0) {
                        if ((global as any).__DEV__ || DEV_MSG_LOGGING) console.log('[chat] Using AsyncStorage cache for', chatId, 'msgs', cached.length);
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
            const prev = index < combinedMessages.length - 1 ? combinedMessages[index + 1] : undefined;
            const next = index > 0 ? combinedMessages[index - 1] : undefined;

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
                if (item.createdAt && item.text && String(item.text).trim().length > 0 && item.sender !== 'system') {
                    const itemMs = item.createdAt.toMillis();
                    let closestOlderMs = -Infinity;
                    let closestOlder: Message | undefined = undefined;
                    for (const c of combinedMessages) {
                        if (!c || !c.createdAt || !c.text) continue;
                        if (String(c.text).trim().length === 0) continue;
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
                            const time = newerDate.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

                            if (daysDiff === 0) {
                                // newerDate is today -> show only time
                                separatorLabel = time;
                            } else if (daysDiff === 1) {
                                separatorLabel = `wczoraj o ${time}`;
                            } else if (daysDiff > 1 && daysDiff < 7) {
                                // short weekday name in Polish (e.g., "czw.") + time
                                const weekday = new Intl.DateTimeFormat('pl-PL', { weekday: 'short' }).format(newerDate);
                                separatorLabel = `${weekday} o ${time}`;
                            } else {
                                const day = newerDate.getDate();
                                const monthShort = new Intl.DateTimeFormat('pl-PL', { month: 'short' }).format(newerDate);
                                if (newerDate.getFullYear() === new Date().getFullYear()) {
                                    separatorLabel = `${day} ${monthShort} o ${time}`;
                                } else {
                                    separatorLabel = `${day} ${monthShort} ${newerDate.getFullYear()} o ${time}`;
                                }
                            }
                        } else if (mins >= 10) {
                            showTimeSeparator = true;
                            separatorLabel = new Date(item.createdAt.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        }
                    }
                }
            } catch (e) {
                /* ignore */
            }

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

    const renderItem = useCallback(({ item, index }: { item: { message: Message; prev?: Message; next?: Message; showAdminTag?: boolean; showTimeSeparator?: boolean; separatorLabel?: string }, index: number }) => {
        return <MemoMessageBubble message={item.message} prevMessage={item.prev} nextMessage={item.next} themeColors={themeColors} admins={adminsMap} showAdminTag={item.showAdminTag} onRetry={handleRetry} index={index} activeMessageId={activeMessageId} activeMessageIndex={activeMessageIndex} onToggleActive={handleToggleActive} showTimeSeparator={item.showTimeSeparator} separatorLabel={item.separatorLabel} listInverted={true} />;
    }, [themeColors, adminsMap, activeMessageId, activeMessageIndex, handleRetry, handleToggleActive]);

    const loadOlderMessages = async () => {
        if (!chatId || isLoadingMore || !hasMoreOlder) return;
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
            const olderQuery = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'desc'), startAfter(startAfterArg), limit(MESSAGES_LIMIT));
            const snap = await getDocs(olderQuery);
            if (snap.empty) {
                setHasMoreOlder(false);
            } else {
                const docs = snap.docs;
                const older = docs.map(doc => ({ ...doc.data(), id: doc.id } as Message)).filter(m => !!(m.text && String(m.text).trim().length > 0));
                setOlderMessages(prev => [...prev, ...older]);
                lastVisibleDocRef.current = docs[docs.length - 1];
                lastVisibleTimestampRef.current = (docs[docs.length - 1].data() as any).createdAt?.toMillis?.();
                setHasMoreOlder(docs.length === MESSAGES_LIMIT);
            }
        } catch (error) {
            console.error('Error loading older messages:', error);
        }
        setLoadingMore(false);
    };

    useEffect(() => {
        chatRef.current = chat;
        if (chat) {
            setCurrentStatus(chat.status);
            const unreadInThisChat = chat.adminUnread || 0;
            setShowBackButtonBadge(totalUnreadCount > 0 && (totalUnreadCount - unreadInThisChat > 0));
        }
    }, [totalUnreadCount, chat]);

    // Side-effects now run immediately on mount (no rAF) — cache changes retained



    const handleSend = async () => {
        if (newMessage.trim() === '' || !chatId || !user) return;
        const text = newMessage.trim();
        setNewMessage('');

        // optimistic local message
        const clientId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
        const tempId = `temp-${clientId}`;
        const localMessage: any = {
            id: tempId,
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
        } catch (error) {
            console.error('Error sending message:', error);
            setLiveMessages(prev => prev.map(m => m.clientId === clientId ? { ...m, pending: false, failed: true } : m));
        }
    };

    const handleCloseChat = async () => {
        if (!chatId || chatRef.current?.status === 'closed') return;
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
            // show subtle success toast instead of opening an extra modal with 'OK'
            showMessage({ message: 'Czat zamknięty', description: 'Klient nie może już odpowiadać', type: 'success', floating: true });
        } catch (error) {
            console.error("Error closing chat: ", error);
        }
    };

    const requestCloseChat = () => {
        const config = { title: 'Zamknij czat', message: 'Czy na pewno chcesz zamknąć ten czat? Klient nie będzie mógł już na niego odpowiedzieć.', confirmText: 'Zamknij', onConfirm: handleCloseChat, cancelText: 'Anuluj', variant: 'secondary' as const };
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
        const config = { title: 'Usuń czat', message: 'Czy na pewno chcesz trwale usunąć ten czat i wszystkie jego wiadomości? Tej operacji nie można cofnąć.', confirmText: 'Usuń', cancelText: 'Anuluj', onConfirm: handleDeleteChat, variant: 'destructive' as const };
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
        await updateDoc(doc(db, 'chats', chatId), { assignedAdminId: adminId });
        setAssignModalVisible(false);
    };

    const [banModalVisible, setBanModalVisible] = useState(false);
    const [banType, setBanType] = useState<'permanent' | '1h' | '24h' | '7d' | '30d'>('24h');



    const requestBlockUser = () => {
        setBanModalVisible(true);
    };

    const handleBlockUser = async () => {
        if (!chatId || !chat) return;
        const targetUid = chat.userUid;
        if (!targetUid) {
            showMessage({ message: 'Błąd', description: 'Nie znaleziono UID użytkownika. Upewnij się, że chat jest powiązany z UID.', type: 'danger', position: 'bottom', floating: true, backgroundColor: themeColors.danger, color: '#fff', style: { borderRadius: 8, marginHorizontal: 12, paddingVertical: 8 } });
            setBanModalVisible(false);
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
            showMessage({ message: 'Użytkownik zablokowany', description: 'Czat został zamknięty', type: 'success', floating: true });
        } catch (err) {
            console.error('Failed to block user:', err);
            showMessage({ message: 'Błąd', description: 'Nie udało się zablokować użytkownika.', type: 'danger', position: 'bottom', floating: true, backgroundColor: themeColors.danger, color: '#fff', style: { borderRadius: 8, marginHorizontal: 12, paddingVertical: 8 } });
        }
    };

    const handleUnblockUser = async () => {
        if (!chatId || !chat) return;
        const targetUid = chat.userUid;
        if (!targetUid) {
            showMessage({ message: 'Błąd', description: 'Nie znaleziono UID użytkownika.', type: 'danger', position: 'bottom', floating: true, backgroundColor: themeColors.danger, color: '#fff', style: { borderRadius: 8, marginHorizontal: 12, paddingVertical: 8 } });
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
            showMessage({ message: 'Użytkownik odblokowany', description: 'Czat został otwarty', type: 'success', floating: true });
        } catch (err) {
            console.error('Failed to unblock user:', err);
            showMessage({ message: 'Błąd', description: 'Nie udało się odblokować użytkownika.', type: 'danger', position: 'bottom', floating: true, backgroundColor: themeColors.danger, color: '#fff', style: { borderRadius: 8, marginHorizontal: 12, paddingVertical: 8 } });
        }
    };

    const requestAssignChat = () => {
        setAssignModalVisible(true);
    };

    const handleDeleteChat = async () => {
        if (!chatId) return;
        try {
            // Optimistically navigate back to avoid showing deleted chat
            router.back();

            // Remove from local list immediately
            setChats((prev: Chat[]) => prev.filter((c: Chat) => c.id !== chatId));
            // clear in-memory cache for this chat to avoid stale data
            try { inMemoryMessageCache.delete(chatId); } catch (e) { /* ignore */ }

            const batch = writeBatch(db);
            const messagesRef = collection(db, 'chats', chatId, 'messages');
            const messagesSnapshot = await getDocs(messagesRef);
            messagesSnapshot.forEach(messageDoc => batch.delete(messageDoc.ref));
            batch.delete(doc(db, 'chats', chatId));
            await batch.commit();
            // show a subtle green bar from the bottom to confirm deletion
            showMessage({ message: 'Czat usunięty', description: 'Czat został trwale usunięty', type: 'success', position: 'bottom', floating: true, backgroundColor: themeColors.success, color: '#fff', style: { borderRadius: 8, marginHorizontal: 12, paddingVertical: 8 } });
        } catch (error) {
            console.error('Błąd podczas usuwania czatu:', error);
            showMessage({ message: 'Błąd', description: 'Nie udało się usunąć czatu. Spróbuj ponownie.', type: 'danger', position: 'bottom', floating: true, backgroundColor: themeColors.danger, color: '#fff', style: { borderRadius: 8, marginHorizontal: 12, paddingVertical: 8 } });
        }
    };    
    const isChatInitiallyClosed = currentStatus === 'closed';
    const headerTitle = chat?.userInfo.contact || contactName;

    return (
        <MenuProvider>
            <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
                <TabTransition quick={true} style={{ flex: 1 }}>

                <ConfirmationModal
                    visible={!!modalConfig}
                    onClose={closeModal}
                    title={modalConfig?.title || ''}
                    message={modalConfig?.message || ''}
                    confirmText={modalConfig?.confirmText || ''}
                    cancelText={modalConfig?.cancelText}
                    variant={modalConfig?.variant}
                    onConfirm={() => {
                        // capture the action now, then close and run it after animation finishes
                        const onConfirmAction = modalConfig?.onConfirm;
                        closeModal();
                        if (onConfirmAction) {
                            setTimeout(() => {
                                try { onConfirmAction(); } catch (e) { console.error(e); }
                            }, 320);
                        }
                    }}
                />
                
                <AnimatedModal visible={isAssignModalVisible} onClose={() => setAssignModalVisible(false)} contentStyle={[styles.confirmModal, styles.shadow]}>
                    <Text style={[styles.modalTitle, { color: themeColors.text }]}>Przypisz do admina</Text>
                    <FlatList
                        data={adminsList}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.adminItem} onPress={() => handleAssignChat(item.id)}>
                                <Text style={{color: themeColors.text}}>{item.displayName || item.email}</Text>
                            </TouchableOpacity>
                        )}
                    />
                    <TouchableOpacity style={[styles.button, styles.buttonCancel, { backgroundColor: themeColors.input, marginTop: 12, width: '100%' }]} onPress={() => setAssignModalVisible(false)}>
                        <Text style={[styles.buttonText, { color: themeColors.tint }]}>Anuluj</Text>
                    </TouchableOpacity>
                </AnimatedModal>

                <AnimatedModal visible={banModalVisible} onClose={() => setBanModalVisible(false)} contentStyle={[styles.confirmModal, styles.shadow]}>
                        <Text style={[styles.modalTitle, { color: themeColors.text }]}>Zablokuj użytkownika</Text>
                        <Text style={{ color: themeColors.textMuted, marginBottom: 12 }}>Wybierz czas trwania blokady</Text>

                        <View style={styles.durationGrid}>
                            <TouchableOpacity onPress={() => setBanType('permanent')} style={[styles.durationTile, banType === 'permanent' ? { borderColor: themeColors.tint, backgroundColor: themeColors.tint + '10' } : { backgroundColor: 'transparent' }]}>
                                <Text style={{ color: themeColors.text, textAlign: 'center' }}>Na stałe</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setBanType('1h')} style={[styles.durationTile, banType === '1h' ? { borderColor: themeColors.tint, backgroundColor: themeColors.tint + '10' } : { backgroundColor: 'transparent' }]}>
                                <Text style={{ color: themeColors.text }}>1h</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setBanType('24h')} style={[styles.durationTile, banType === '24h' ? { borderColor: themeColors.tint, backgroundColor: themeColors.tint + '10' } : { backgroundColor: 'transparent' }]}>
                                <Text style={{ color: themeColors.text }}>24h</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setBanType('7d')} style={[styles.durationTile, banType === '7d' ? { borderColor: themeColors.tint, backgroundColor: themeColors.tint + '10' } : { backgroundColor: 'transparent' }]}>
                                <Text style={{ color: themeColors.text }}>7d</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setBanType('30d')} style={[styles.durationTile, banType === '30d' ? { borderColor: themeColors.tint, backgroundColor: themeColors.tint + '10' } : { backgroundColor: 'transparent' }]}>
                                <Text style={{ color: themeColors.text }}>30d</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
                            <TouchableOpacity style={[styles.button, styles.buttonCancel, { backgroundColor: themeColors.input, width: '48%' }]} onPress={() => setBanModalVisible(false)}>
                                <Text style={[styles.buttonText, { color: themeColors.text }]}>Anuluj</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.button, { backgroundColor: themeColors.danger, width: '48%' }]} onPress={handleBlockUser}>
                                <Text style={[styles.buttonTextConfirm]}>Zablokuj</Text>
                            </TouchableOpacity>
                        </View>
                </AnimatedModal>

                <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
                    <TouchableOpacity onPress={() => { if (user) { (async () => { await goOfflineImmediate(chatId, user.uid); })(); } router.back(); }} style={styles.headerIcon}>
                        <Ionicons name="arrow-back" size={24} color={themeColors.text} />
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
                    <View style={styles.headerRightContainer}>
                        {!isChatInitiallyClosed && 
                            <TouchableOpacity onPress={requestCloseChat} style={[styles.headerActionButton, { backgroundColor: '#2C2C2E' }]}>
                                <Text style={styles.headerActionButtonText}>Zamknij</Text>
                            </TouchableOpacity>
                        }
                        {chat?.status === 'closed' && (
                            <TouchableOpacity onPress={() => { try { requestDeleteChat(); } catch(e) { console.error(e); } }} style={[styles.headerActionButton, { backgroundColor: themeColors.danger }]}>
                                <Text style={[styles.headerActionButtonText, { color: '#fff' }]}>Usuń</Text>
                            </TouchableOpacity>
                        )}
                        <Menu>
                            <MenuTrigger>
                                <Ionicons name="ellipsis-vertical" size={24} color={themeColors.text} style={{ padding: 5, marginLeft: 5 }}/>
                            </MenuTrigger>
                            <MenuOptions customStyles={{ optionsContainer: { backgroundColor: themeColors.background, borderRadius: 8 } }}>
                                <MenuOption onSelect={requestAssignChat}>
                                    <Text style={{ color: themeColors.text, padding: 10 }}>Przypisz do...</Text>
                                </MenuOption>
                                {chat?.userIsBanned ? (
                                    <MenuOption onSelect={() => { try { handleUnblockUser(); } catch (e) { console.error(e); } }}>
                                        <Text style={{ color: themeColors.text, padding: 10 }}>Odbanuj użytkownika</Text>
                                    </MenuOption>
                                ) : (
                                    <MenuOption onSelect={requestBlockUser}>
                                        <Text style={{ color: themeColors.danger, padding: 10 }}>Zablokuj użytkownika</Text>
                                    </MenuOption>
                                )}

                            </MenuOptions>
                        </Menu>
                    </View>
                </View>
                    {loading ? <ActivityIndicator style={{ flex: 1 }} size="large" color={themeColors.tint} /> : (
                        <>
                            <FlatList 
                                ref={(r) => { listRef.current = r; }}
                                data={visualData} 
                                renderItem={renderItem} 
                                keyExtractor={(item) => item.message.id.toString()} 
                                inverted 
                                onEndReached={() => loadOlderMessages()}
                                onEndReachedThreshold={0.2}
                                ListFooterComponent={isLoadingMore ? <ActivityIndicator size="small" color={themeColors.tint} /> : null}
                                contentContainerStyle={styles.listContent}
                                keyboardShouldPersistTaps="handled"
                            />

                            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={(insets?.bottom || 0) + 90} enabled>
                                {isChatInitiallyClosed ? (
                                    <View style={[styles.inputContainer, { borderTopColor: themeColors.border, backgroundColor: themeColors.background, paddingBottom: insets?.bottom || 0 }]}>
                                        <Text style={[styles.closedChatText, { color: themeColors.textMuted }]}>Czat został zamknięty</Text>
                                    </View>
                                ) : chat?.userIsBanned ? (
                                    <View style={[styles.inputContainer, { borderTopColor: themeColors.border, backgroundColor: themeColors.background, padding: 12, paddingBottom: insets?.bottom || 0 }]}>
                                        <Text style={{ color: themeColors.danger, marginBottom: 6 }}>Użytkownik zbanowany{chat.bannedUntil ? ` do ${chat.bannedUntil.toDate().toLocaleString()}` : ''}</Text>
                                        <Text style={[styles.closedChatText, { color: themeColors.textMuted }]}>Wysyłanie wiadomości zostało zablokowane dla tego użytkownika.</Text>
                                    </View>
                                ) : (
                                    <View style={[styles.inputContainer, { borderTopColor: themeColors.border, backgroundColor: themeColors.background, paddingBottom: insets?.bottom || 0 }]}>
                                        <TextInput nativeID="chat-new-message" style={[styles.input, { color: themeColors.text, backgroundColor: '#f3f4f8' }]} value={newMessage} onChangeText={setNewMessage} placeholder="Napisz wiadomość..." placeholderTextColor={themeColors.textMuted} multiline autoComplete="off" />
                                        <TouchableOpacity onPress={handleSend} style={[styles.sendButton, { backgroundColor: themeColors.tint }]}><Ionicons name="send" size={20} color="white" /></TouchableOpacity>
                                    </View>
                                )}
                            </KeyboardAvoidingView>
                        </>
                    )}
                </TabTransition>
            </SafeAreaView>
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
    header: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: 1 },
    headerIcon: { padding: 5, marginLeft: 5, position: 'relative' },
    backButtonBadge: { position: 'absolute', top: 3, right: 3, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, },
    headerTitleContainer: { flex: 1, marginLeft: 15, alignItems: 'flex-start' },
    headerTitle: { fontSize: 17, fontWeight: '600' },
    headerSubtitle: { fontSize: 13, opacity: 0.8 },
    headerRightContainer: { flexDirection: 'row', alignItems: 'center' },
    headerActionButton: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginHorizontal: 5, justifyContent: 'center', alignItems: 'center' },
    headerActionButtonText: { color: 'white', fontSize: 13, fontWeight: '500' },
    listContent: { paddingVertical: 10, paddingHorizontal: 10, },
    timeSeparatorContainer: { alignItems: 'center', marginVertical: 8 },
    timeSeparatorFullRow: { width: '100%', alignItems: 'center', marginVertical: 8 },
    timeSeparatorPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
    timeSeparatorText: { fontSize: 12, color: '#777' },
    messageRow: { flexDirection: 'row', alignItems: 'flex-end', maxWidth: '95%' },
    myMessageRow: { alignSelf: 'flex-end' },
    theirMessageRow: { alignSelf: 'flex-start' },
    avatarContainer: { width: 38, marginRight: 0,},
    messageContentContainer: { flexShrink: 1, },
    senderName: { fontSize: 13, color: '#666', marginBottom: 5, marginLeft: 10, fontWeight: '500' },
    messageOuter: {},
    bubbleWrapper: {},
    messageBubble: { paddingVertical: 10, paddingHorizontal: 15, },
    myMessageBubble: {},
    theirMessageBubble: { backgroundColor: '#f3f4f8', },
    timestampContainer: { marginBottom: 2 },
    timestampText: { fontSize: 12, color: '#777' },
    aiMessageBubble: { backgroundColor: '#e5e7eb', },
    soloBubble: { borderRadius: 20 },
    myBubble_first: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 5 },
    myBubble_middle: { borderTopLeftRadius: 20, borderTopRightRadius: 5, borderBottomLeftRadius: 20, borderBottomRightRadius: 5 },
    myBubble_last: { borderTopLeftRadius: 20, borderTopRightRadius: 5, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
    theirBubble_first: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 5, borderBottomRightRadius: 20 },
    theirBubble_middle: { borderTopLeftRadius: 5, borderTopRightRadius: 20, borderBottomLeftRadius: 5, borderBottomRightRadius: 20 },
    theirBubble_last: { borderTopLeftRadius: 5, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
    myMessageText: { color: 'white', fontSize: 16, lineHeight: 22 },
    theirMessageText: { fontSize: 16, color: '#000', lineHeight: 22 },
    systemMessageContainer: { alignSelf: 'center', marginVertical: 10, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, backgroundColor: '#8A8A8D' },
    systemMessageText: { fontSize: 12, fontWeight: '500' },
    dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 15, paddingHorizontal: 20, },
    dividerLine: { flex: 1, height: 1, },
    dividerText: { marginHorizontal: 10, fontSize: 12, fontWeight: '500', },
    inputContainer: { flexDirection: 'row', padding: 12, borderTopWidth: 1, alignItems: 'center', minHeight: 68 },
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
    durationGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 8 },
    durationTile: { width: '30%', borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ddd', marginBottom: 10 },
    button: { borderRadius: 15, padding: 12, alignItems: 'center' },
    buttonCancel: { },
    buttonText: { fontSize: 17, fontWeight: '600' },
    buttonTextConfirm: { color: 'white', fontSize: 17, fontWeight: '700' },
}
);

export default ConversationScreen;
