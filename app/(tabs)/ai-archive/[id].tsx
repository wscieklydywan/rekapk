
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { Colors } from '@/constants/theme';
import { db } from '@/lib/firebase';
import { deleteCollectionInBatches } from '@/lib/firestore-utils';
import toast from '@/lib/toastController';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { collection, deleteDoc, doc, getDoc, getDocs, query } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeOut, SlideInRight, SlideOutRight } from 'react-native-reanimated';
// animation timings chosen to match Conversation smooth feel
const AI_FADE_IN_DUR = 100;
const AI_FADE_OUT_DUR = 90;
const AI_SLIDE_IN_DUR = 110;
const AI_SLIDE_OUT_DUR = 90;


// --- TYPY --- 
interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: any;
  isError?: boolean;
}

interface AiConversationInfo {
  id: string;
  userContact: string;
  messageCount: number;
}

// --- KOMPONENTY WIADOMOŚCI --- 

const SystemMessage = ({ content, themeColors }: { content: string, themeColors: any }) => (
    <View style={[styles.systemMessageContainer, { backgroundColor: themeColors.input }]}>
        <Ionicons name="alert-circle-outline" size={18} color={themeColors.danger} style={{ marginRight: 8 }} />
        <Text style={[styles.systemMessageText, { color: themeColors.text }]}>{content}</Text>
    </View>
);

const MessageBubble = ({ message, themeColors }: { message: AiMessage, themeColors: any }) => {
    const isUser = message.role === 'user';
    const avatarIcon = isUser ? 'person-outline' : 'headset-outline';
    const senderName = isUser ? 'Klient' : 'Konsultant AI';

    return (
        <View style={[styles.messageRow, { flexDirection: isUser ? 'row-reverse' : 'row' }]}>
            <View style={[styles.avatar, { backgroundColor: themeColors.input }]}>
                <Ionicons name={avatarIcon} size={20} color={isUser ? themeColors.tint : themeColors.text} />
            </View>
            <View style={styles.messageContentContainer}>
                <Text style={[styles.senderName, { color: themeColors.textMuted, textAlign: isUser ? 'right' : 'left' }]}>
                    {senderName}
                </Text>
                <View style={[
                    styles.messageBubble,
                    isUser 
                        ? { backgroundColor: themeColors.tint } 
                        : { backgroundColor: themeColors.input },
                ]}>
                     <Text style={[styles.messageText, { color: isUser ? 'white' : themeColors.text }]}>
                        {message.content}
                    </Text>
                </View>
            </View>
        </View>
    );
};

// --- GŁÓWNY EKRAN --- 

const AiConversationDetailScreen = () => {
    const theme = useColorScheme() ?? 'light';
    const themeColors = { ...Colors[theme], danger: '#FF3B30' };
    const navigation = useNavigation();
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>(); 

    const [conversationInfo, setConversationInfo] = useState<AiConversationInfo | null>(null);
    const [messages, setMessages] = useState<AiMessage[]>([]);
    const [loading, setLoading] = useState(true);
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

        // clear pending modal timers
        if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }

        setModalConfig(null);
        modalLockRef.current = true;
        try { if (typeof window !== 'undefined') (window as any).__modalSuppressedUntil = Date.now() + 520; } catch(e) {}
        setTimeout(() => { modalLockRef.current = false; }, 420);
    };

    const showModal = (config: { title: string; message?: string; confirmText?: string; onConfirm?: () => void; cancelText?: string; variant?: 'destructive' | 'secondary' }) => {
        try {
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

    useEffect(() => {
        navigation.setOptions({ headerShown: false });
        
        // Run fetch immediately (no InteractionManager) — keep list/detail fast and predictable.
        const fetchConversation = async () => {
            if (!id) return;

            try {
                const docRef = doc(db, 'ai_conversations', id);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    setConversationInfo({ id: docSnap.id, ...docSnap.data() } as AiConversationInfo);
                } else {
                    if (router.canGoBack()) router.back();
                }

                const messagesQuery = query(collection(db, "ai_conversations", id, "messages"));
                const messagesSnapshot = await getDocs(messagesQuery);

                let fetchedMessages = messagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AiMessage[];

                fetchedMessages.sort((a, b) => {
                    const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
                    const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
                    return dateA - dateB;
                });

                setMessages(fetchedMessages);

            } catch (error) {
                console.error("Błąd podczas pobierania rozmowy:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchConversation();
    }, [id]);

    const handleDelete = async () => {
        const performDelete = async () => {
            if (!id) return;
            closeModal();
            try {
                await deleteCollectionInBatches(db, collection(db, 'ai_conversations', id, 'messages'));

                await deleteDoc(doc(db, 'ai_conversations', id));
                try { if (router.canGoBack()) router.back(); } catch(e) { /* ignore */ }
                try { setTimeout(() => { toast.show({ text: 'Rozmowa usunięta', variant: 'info' }); }, 220); } catch (e) { /* ignore */ }
            } catch (error) {
                console.error("Błąd podczas usuwania rozmowy:", error);
                try { setTimeout(() => { toast.show({ text: 'Błąd: nie udało się usunąć rozmowy', variant: 'error', duration: 2500 }); }, 50); } catch (e) { /* ignore */ }
            }
        };

        showModal({
            title: 'Usuń rozmowę',
            message: 'Czy na pewno chcesz trwale usunąć tę rozmowę i wszystkie jej wiadomości? Tej operacji nie można cofnąć.',
            confirmText: 'Usuń',
            cancelText: 'Anuluj',
            onConfirm: performDelete,
            variant: 'destructive'
        });
    };

    const contactName = conversationInfo?.userContact || '(bez nazwy)';
    const messageCount = messages.length;

        return (
        <Animated.View entering={FadeIn.duration(AI_FADE_IN_DUR).easing(Easing.out(Easing.cubic))} exiting={FadeOut.duration(AI_FADE_OUT_DUR).easing(Easing.in(Easing.cubic))} style={{ flex: 1 }}>
            <Animated.View entering={SlideInRight.duration(AI_SLIDE_IN_DUR).easing(Easing.out(Easing.cubic))} exiting={SlideOutRight.duration(AI_SLIDE_OUT_DUR).easing(Easing.in(Easing.cubic))} style={{ flex: 1 }}>
                                <View style={{ flex: 1, backgroundColor: themeColors.background }}>
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
                                        setTimeout(() => { try { onConfirmAction(); } catch(e) { console.error(e); } }, 160);
                                    }
                                }}
                            />
                        )}
            {/* Header */}
                <View style={[styles.headerSlot, { backgroundColor: themeColors.card ?? themeColors.background, borderBottomColor: themeColors.border }]}> 
                    <Animated.View style={[styles.headerLayer]} pointerEvents={'auto'}>
                        <View style={[styles.headerContent]}> 
                        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                            <Ionicons name="chevron-back" size={28} color={themeColors.tint} />
                        </TouchableOpacity>
                        <View style={styles.headerTitleContainer}>
                             <Text style={[styles.headerTitle, { color: themeColors.text }]} numberOfLines={1}>{contactName}</Text>
                             <Text style={[styles.headerSubtitle, { color: themeColors.textMuted }]}>{loading ? 'Ładowanie...' : `${messageCount} wiadomości`}</Text>
                        </View>
                        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
                            <Ionicons name="trash-outline" size={24} color={themeColors.danger} />
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>

            {loading ? (
                <ActivityIndicator style={{ flex: 1, justifyContent: 'center' }} color={themeColors.tint} />
            ) : (
                <FlatList
                    data={messages}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => {
                        if (item.isError) {
                            return <SystemMessage content={item.content} themeColors={themeColors} />;
                        }
                        return <MessageBubble message={item} themeColors={themeColors} />;
                    }}
                    contentContainerStyle={styles.listContentContainer}
                    ListEmptyComponent={<SystemMessage content="Brak wiadomości w tej rozmowie." themeColors={themeColors} />} 
                />
            )}

                </View>
            </Animated.View>
        </Animated.View>
    );
};

// --- STYLE --- 

const styles = StyleSheet.create({
    headerSlot: { height: 64, borderBottomWidth: 1 /* borderBottomColor applied inline */, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
    headerLayer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '100%',
    },
    headerContent: {
        paddingTop: 28,
        paddingBottom: 8,
        paddingHorizontal: 15,
        flexDirection: 'row',
        alignItems: 'center',
    },
    backButton: { marginRight: 10 },
    headerTitleContainer: { flex: 1 },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    headerSubtitle: { fontSize: 14, fontWeight: '500' },
    deleteButton: { padding: 5, marginLeft: 10 },
    listContentContainer: { paddingVertical: 15, paddingHorizontal: 10 },
    messageRow: { 
        marginVertical: 4,
        alignItems: 'flex-end',
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 5,
    },
    messageContentContainer: {
        maxWidth: '80%',
    },
    senderName: {
        fontSize: 12,
        fontWeight: '500',
        marginBottom: 4,
        marginHorizontal: 15,
    },
    messageBubble: {
        paddingHorizontal: 15,
        paddingVertical: 10,
        borderRadius: 20,
    },
    messageText: { fontSize: 16, lineHeight: 22 },
    systemMessageContainer: {
        alignSelf: 'center',
        marginVertical: 15,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 15,
        flexDirection: 'row',
        alignItems: 'center',
    },
    systemMessageText: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
});

export default AiConversationDetailScreen;
