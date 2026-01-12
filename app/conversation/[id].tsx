
import { useChatContext } from '@/app/contexts/ChatProvider';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { Chat, Message, User } from '@/schemas';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, startAfter, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, useColorScheme, View } from 'react-native';

import AnimatedModal from '@/components/AnimatedModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import TabTransition from '@/components/TabTransition';
import { showMessage } from 'react-native-flash-message';
import { Menu, MenuOption, MenuOptions, MenuProvider, MenuTrigger } from 'react-native-popup-menu';

const GROUP_THRESHOLD_MINUTES = 3;
const MESSAGES_LIMIT = 50; // number of messages to keep in live subscription

const MessageBubble = ({ message, prevMessage, nextMessage, themeColors, admins, showAdminTag, onRetry }: { message: Message; prevMessage?: Message; nextMessage?: Message; themeColors: any; admins: { [key: string]: User }, showAdminTag?: boolean, onRetry?: (m: Message) => void }) => {
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

    return (
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
                <View style={bubbleStyles}>
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
                </View>
            </View>
        </View>
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

    const prevAdminName = prevProps.admins?.[pm.adminId as string]?.displayName || prevProps.admins?.[pm.adminId as string]?.email || null;
    const nextAdminName = nextProps.admins?.[nm.adminId as string]?.displayName || nextProps.admins?.[nm.adminId as string]?.email || null;
    if (prevAdminName !== nextAdminName) return false;

    return true;
});

const ConversationScreen = () => {
    const { user } = useAuth();
    const router = useRouter();
    const { id: chatId, status: initialStatus, contactName: encodedContactName } = useLocalSearchParams<{ id: string; status?: Chat['status'], contactName?: string }>();
    const theme = useColorScheme() ?? 'light';
    const themeColors = Colors[theme];

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
    const [loading, setLoading] = useState(true);
    const [modalConfig, setModalConfig] = useState<{ title: string; message: string; confirmText: string; onConfirm: () => void; cancelText?: string; variant?: 'destructive' | 'secondary'; } | null>(null);

    // Prevent other modals from appearing immediately after this one closes (fixes a brief "OK" flash)
    const modalLockRef = useRef(false);
    const modalTimerRef = useRef<number | null>(null);

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

    // Convert any quick "OK" modals into toasts to avoid flash-closing the modal
    useEffect(() => {
        if (modalConfig?.confirmText === 'OK') {
            // show as toast and immediately clear the modal (with lock)
            showMessage({ message: modalConfig.title, description: modalConfig.message, type: 'info', floating: true });
            closeModal();
        }
    }, [modalConfig]);

    const [showBackButtonBadge, setShowBackButtonBadge] = useState(false);
    const { totalUnreadCount, admins: adminsMap, setChats } = useChatContext();

    // Caching keys & refs for AsyncStorage-based recent messages cache
    const CACHE_KEY = `chat_messages_${chatId}`;
    const cacheSaveTimerRef = useRef<any | null>(null);
    const cacheLoadedRef = useRef(false);
    const contactName = encodedContactName ? decodeURIComponent(encodedContactName) : 'Czat';
    const [currentStatus, setCurrentStatus] = useState<Chat['status'] | undefined>(initialStatus);
    
    const [isAssignModalVisible, setAssignModalVisible] = useState(false);
    const adminsList = useMemo(() => Object.values(adminsMap), [adminsMap]);

    // Load cached messages (if any) to make startup feel instant while we wait for snapshot
    useEffect(() => {
        if (!chatId) return;
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(CACHE_KEY);
                if (!raw) return;
                const parsed = JSON.parse(raw) as { messages?: Array<any>, lastVisible?: number, lastVisibleDocId?: string };
                if (!parsed || !parsed.messages || !parsed.messages.length) return;
                // convert stored timestamps (ms) back to Timestamp
                const cached = parsed.messages.map(p => ({ ...p, createdAt: Timestamp.fromMillis(p.createdAt), pending: false, failed: false } as Message));
                setLiveMessages(cached);
                lastVisibleTimestampRef.current = parsed.lastVisible || null;
                lastVisibleDocIdRef.current = parsed.lastVisibleDocId || null;
                // if we have docId, attempt to fetch its DocumentSnapshot to enable precise pagination
                if (lastVisibleDocIdRef.current) {
                    try {
                        const snap = await getDoc(doc(db, 'chats', chatId, 'messages', lastVisibleDocIdRef.current));
                        if (snap.exists()) lastVisibleDocRef.current = snap;
                    } catch (err) {
                        console.error('Failed to fetch lastVisible doc by id:', err);
                        lastVisibleDocRef.current = null;
                    }
                }
                cacheLoadedRef.current = true; 
            } catch (err) {
                console.error('Failed to load cached messages:', err);
            }
        })();
    }, [chatId]);

    // Persist recent messages (debounced) to AsyncStorage whenever messages change
    useEffect(() => {
        if (!chatId) return;
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

            return { message: item, prev, next, showAdminTag };
        });
    }, [combinedMessages]);

    const renderItem = useCallback(({ item }: { item: { message: Message; prev?: Message; next?: Message; showAdminTag?: boolean } }) => {
        return <MemoMessageBubble message={item.message} prevMessage={item.prev} nextMessage={item.next} themeColors={themeColors} admins={adminsMap} showAdminTag={item.showAdminTag} onRetry={handleRetry} />;
    }, [themeColors, adminsMap]);

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
                userUnread: increment(1),
            });

            await batch.commit();
        } catch (error) {
            console.error('Retry failed:', error);
            setLiveMessages(prev => prev.map(m => m.clientId === clientId ? { ...m, pending: false, failed: true } : m));
        }
    };

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

    useEffect(() => {
        if (!chatId || !user) return;

        const chatDocRef = doc(db, 'chats', chatId);
        const adminId = user.uid;

        const goOnline = async () => {
            try {
                const docSnap = await getDoc(chatDocRef);
                if (!docSnap.exists()) {
                    console.log("Chat does not exist, navigating back.");
                    router.back();
                    return;
                }
                const chatData = docSnap.data() as Chat;
                if (chatData.activeAdminId !== adminId) {
                    await updateDoc(chatDocRef, { activeAdminId: adminId });
                }
                 if (chatData.adminUnread > 0) {
                   await updateDoc(chatDocRef, { adminUnread: 0, lastPushAt: null });
                }
            } catch (error) {
                console.error("Error in goOnline:", error);
            }
        };

        const goOffline = async () => {
            try {
                const docSnap = await getDoc(chatDocRef);
                if (docSnap.exists() && docSnap.data().activeAdminId === adminId) {
                    await updateDoc(chatDocRef, { activeAdminId: null });
                }
            } catch (error) {
                console.error("Error in goOffline:", error);
            }
        };

        goOnline();

        const handleInitialLoad = async () => {
            try {
                const docSnap = await getDoc(chatDocRef);
                if (!docSnap.exists()) {
                    router.back();
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
                router.back();
            }
        };

        handleInitialLoad();

        const unsubChat = onSnapshot(chatDocRef, (doc) => {
            if (doc.exists()) {
                setChat({ id: doc.id, ...doc.data() } as Chat);
            } else {
                router.back();
            }
        });

        const messagesQuery = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'desc'), limit(MESSAGES_LIMIT));
        const unsubMessages = onSnapshot(messagesQuery, (snapshot) => {
            if (firstSnapshotRef.current) {
                // initial load -> populate live messages
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
                // set live messages from initial snapshot
                setLiveMessages(msgs);
                lastVisibleTimestampRef.current = docs.length ? (docs[docs.length - 1].data() as any).createdAt?.toMillis?.() : null;
                firstSnapshotRef.current = false;
                setLoading(false);
                return;
            }

                    snapshot.docChanges().forEach((change) => {
                const docData = { ...change.doc.data(), id: change.doc.id } as Message & any;
                const docClientId = (change.doc.data() as Partial<Message>)?.clientId;

                if (change.type === 'added') {
                    // ignore empty messages
                    if (!docData.text || String(docData.text).trim().length === 0) {
                        try { console.warn('[chat] Skipping empty added message', { chatId, id: docData.id || change.doc.id, sender: docData.sender, raw: docData }); } catch (e) {}
                        return;
                    }

                    setLiveMessages((prev) => {
                        // If there is a local pending message with same clientId, replace it with server doc
                        if (docClientId) {
                            const idx = prev.findIndex(m => m.clientId === docClientId);
                            if (idx !== -1) {
                                const next = [...prev];
                                next[idx] = docData;
                                return next;
                            }
                        }

                        if (prev.find(m => m.id === docData.id || m.clientId === docClientId)) return prev;
                        const next = [...prev];
                        const insertIndex = Math.min(change.newIndex, next.length);
                        next.splice(insertIndex, 0, docData);
                        if (next.length > MESSAGES_LIMIT) {
                            const overflow = next.pop()!;
                            setOlderMessages((old) => [overflow, ...old]);
                        }
                        return next;
                    });
                } else if (change.type === 'modified') {
                    setLiveMessages((prev) => {
                        const i = prev.findIndex(m => m.id === docData.id || m.clientId === docClientId);
                        if (i === -1) return prev;
                        const next = [...prev];
                        next[i] = docData;
                        return next;
                    });
                    setOlderMessages((prev) => {
                        const i = prev.findIndex(m => m.id === docData.id || m.clientId === docClientId);
                        if (i === -1) return prev;
                        const next = [...prev];
                        next[i] = docData;
                        return next;
                    });
                } else if (change.type === 'removed') {
                    setLiveMessages((prev) => prev.filter(m => m.id !== docData.id && m.clientId !== docClientId));
                    setOlderMessages((prev) => prev.filter(m => m.id !== docData.id && m.clientId !== docClientId));
                }
            });
        });
        
        const handleAppStateChange = (nextAppState: string) => {
            if (nextAppState !== 'active') {
                goOffline();
            }
        };

        const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            unsubChat();
            unsubMessages();
            appStateSubscription.remove();
            goOffline();
        };
    }, [chatId, user, router]);


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
            setChats(prev => prev.filter(c => c.id !== chatId));

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
                    <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
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
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={90} enabled>
                    {loading ? <ActivityIndicator style={{ flex: 1 }} size="large" color={themeColors.tint} /> :
                        <FlatList 
                            data={visualData} 
                            renderItem={renderItem} 
                            keyExtractor={(item) => item.message.id.toString()} 
                            inverted 
                            onEndReached={() => loadOlderMessages()}
                            onEndReachedThreshold={0.2}
                            ListFooterComponent={isLoadingMore ? <ActivityIndicator size="small" color={themeColors.tint} /> : null}
                            contentContainerStyle={styles.listContent} 
                        />
                    }
                    {isChatInitiallyClosed ? (
                        <View style={[styles.inputContainer, { borderTopColor: themeColors.border, backgroundColor: themeColors.background }]}>
                            <Text style={[styles.closedChatText, { color: themeColors.textMuted }]}>Czat został zamknięty</Text>
                        </View>
                    ) : chat?.userIsBanned ? (
                        <View style={[styles.inputContainer, { borderTopColor: themeColors.border, backgroundColor: themeColors.background, padding: 12 }]}>
                            <Text style={{ color: themeColors.danger, marginBottom: 6 }}>Użytkownik zbanowany{chat.bannedUntil ? ` do ${chat.bannedUntil.toDate().toLocaleString()}` : ''}</Text>
                            <Text style={[styles.closedChatText, { color: themeColors.textMuted }]}>Wysyłanie wiadomości zostało zablokowane dla tego użytkownika.</Text>
                        </View>
                    ) : (
                        <View style={[styles.inputContainer, { borderTopColor: themeColors.border, backgroundColor: themeColors.background }]}>
                            <TextInput nativeID="chat-new-message" style={[styles.input, { color: themeColors.text, backgroundColor: '#f3f4f8' }]} value={newMessage} onChangeText={setNewMessage} placeholder="Napisz wiadomość..." placeholderTextColor={themeColors.textMuted} multiline autoComplete="off" />
                            <TouchableOpacity onPress={handleSend} style={[styles.sendButton, { backgroundColor: themeColors.tint }]}><Ionicons name="send" size={20} color="white" /></TouchableOpacity>
                        </View>
                    )}
                </KeyboardAvoidingView>
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
    messageRow: { flexDirection: 'row', alignItems: 'flex-end', maxWidth: '95%' },
    myMessageRow: { alignSelf: 'flex-end' },
    theirMessageRow: { alignSelf: 'flex-start' },
    avatarContainer: { width: 38, marginRight: 0,},
    messageContentContainer: { flexShrink: 1, },
    senderName: { fontSize: 13, color: '#666', marginBottom: 5, marginLeft: 10, fontWeight: '500' },
    messageBubble: { paddingVertical: 10, paddingHorizontal: 15, },
    myMessageBubble: {},
    theirMessageBubble: { backgroundColor: '#f3f4f8', },
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
