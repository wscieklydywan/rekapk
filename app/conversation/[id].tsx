
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, useColorScheme, KeyboardAvoidingView, Platform, ActivityIndicator, SafeAreaView, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, Timestamp, writeBatch, getDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useChatContext } from '@/app/contexts/ChatProvider';
import { Chat, Message, User } from '@/schemas';
import { Colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useAuth } from '@/hooks/useAuth';
import { Menu, MenuProvider, MenuOptions, MenuOption, MenuTrigger } from 'react-native-popup-menu';

const GROUP_THRESHOLD_MINUTES = 3;

const MessageBubble = ({ message, prevMessage, nextMessage, themeColors, admins }: { message: Message; prevMessage?: Message; nextMessage?: Message; themeColors: any; admins: { [key: string]: User } }) => {
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
    
    // Corrected logic for bubble grouping:
    // isFirstInGroup: true if current message starts a new group from the same sender (or a new sender)
    const isFirstInGroup = !prevMessage || prevMessage.sender !== message.sender || (message.sender === 'admin' && prevMessage.adminId !== message.adminId) || getMinutesDiff(prevMessage.createdAt, message.createdAt) > GROUP_THRESHOLD_MINUTES;
    // isLastInGroup: true if current message ends a group from the same sender
    const isLastInGroup = !nextMessage || nextMessage.sender !== message.sender || (message.sender === 'admin' && nextMessage.adminId !== message.adminId) || getMinutesDiff(message.createdAt, nextMessage.createdAt) > GROUP_THRESHOLD_MINUTES;
    const isSolo = isFirstInGroup && isLastInGroup;

    // Corrected logic for displaying admin name/tag based on user's requirements:
    // Show admin name only if it's an admin message AND
    //   - it's the chronologically latest message (in an inverted list, meaning it's the first in a normal chronological view), OR
    //   - the chronologically newer message (nextMessage) was not from an admin, OR
    //   - the chronologically newer message (nextMessage) was from a *different* admin.
    const showAdminName = isMyMessage && message.adminId && (
        !nextMessage || // If it's the chronologically latest message (and it's an admin message)
        nextMessage.sender !== 'admin' || // OR if the chronologically newer message was not from an admin
        nextMessage.adminId !== message.adminId // OR if the chronologically newer message was from a *different* admin
    );

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
                </View>
            </View>
        </View>
    );
};

const ConversationScreen = () => {
    const { user } = useAuth();
    const router = useRouter();
    const { id: chatId, status: initialStatus, contactName: encodedContactName } = useLocalSearchParams<{ id: string; status?: Chat['status'], contactName?: string }>();
    const theme = useColorScheme() ?? 'light';
    const themeColors = Colors[theme];

    const [chat, setChat] = useState<Chat | null>(null);
    const chatRef = useRef<Chat | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [modalConfig, setModalConfig] = useState<{ title: string; message: string; confirmText: string; onConfirm: () => void; cancelText?: string; variant?: 'destructive' | 'secondary'; } | null>(null);
    const [showBackButtonBadge, setShowBackButtonBadge] = useState(false);
    const { totalUnreadCount, admins: adminsMap } = useChatContext();
    const contactName = encodedContactName ? decodeURIComponent(encodedContactName) : 'Czat';
    const [currentStatus, setCurrentStatus] = useState<Chat['status'] | undefined>(initialStatus);
    
    const [isAssignModalVisible, setAssignModalVisible] = useState(false);
    const adminsList = useMemo(() => Object.values(adminsMap), [adminsMap]);

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

        const handleInitialLoadAndReset = async () => {
            try {
                const docSnap = await getDoc(chatDocRef);
                if (!docSnap.exists()) {
                    router.back();
                    return;
                }

                const chatData = { id: docSnap.id, ...docSnap.data() } as Chat;
                const updates: any = { activeAdminId: user.uid };

                if (!chatData.assignedAdminId) {
                    updates.assignedAdminId = user.uid;
                }

                if (chatData.status === 'waiting') {
                    const systemMessageText = "Konsultant dołączył do rozmowy!";
                    Object.assign(updates, {
                        status: "active",
                        operatorId: user.uid,
                        operatorJoinedAt: Timestamp.now(),
                        lastMessage: systemMessageText,
                        lastMessageSender: 'system',
                        lastMessageTimestamp: Timestamp.now(),
                        lastActivity: Timestamp.now(),
                    });
                    
                    const messagesCol = collection(db, 'chats', chatId, 'messages');
                    const batch = writeBatch(db);
                    batch.update(chatDocRef, updates);
                    batch.delete(doc(messagesCol, 'waiting_message'));
                    batch.set(doc(collection(db, 'chats', chatId, 'messages')), { text: systemMessageText, sender: "system", createdAt: Timestamp.now() });
                    await batch.commit();

                } else {
                     if (chatData.adminUnread > 0) {
                        updates.adminUnread = 0;
                        updates.lastPushAt = null;
                    }
                    if (Object.keys(updates).length > 1) { // Only update if more than just activeAdminId is present
                      await updateDoc(chatDocRef, updates);
                    }
                }

            } catch (error) {
                console.error("Błąd podczas ładowania i resetowania czatu:", error);
                router.back();
            }
        };

        handleInitialLoadAndReset();

        const unsubChat = onSnapshot(chatDocRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                setChat({ id: docSnapshot.id, ...docSnapshot.data() } as Chat);
            }
        });
        
        const messagesQuery = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'desc'));
        const unsubMessages = onSnapshot(messagesQuery, (snapshot) => {
            setMessages(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Message)));
            setLoading(false);
        });

        return () => {
            unsubChat();
            unsubMessages();
            if (chatRef.current?.activeAdminId === user.uid) {
                updateDoc(chatDocRef, { activeAdminId: null });
            }
        };
    }, [chatId, router, user]);

    const handleSend = async () => {
        if (newMessage.trim() === '' || !chatId || !user) return;
        const text = newMessage.trim();
        setNewMessage('');

        const batch = writeBatch(db);
        const chatDocRef = doc(db, 'chats', chatId);
        const newMessageRef = doc(collection(db, 'chats', chatId, 'messages'));

        batch.set(newMessageRef, { 
            text, 
            createdAt: Timestamp.now(), 
            sender: 'admin', 
            adminId: user.uid 
        });

        batch.update(chatDocRef, {
            lastMessage: text,
            lastMessageSender: 'admin',
            lastMessageTimestamp: Timestamp.now(),
            userUnread: increment(1),
        });

        await batch.commit();
    };

    const handleCloseChat = async () => {
        if (!chatId || chatRef.current?.status === 'closed') return;
        setModalConfig(null);
        try {
            const batch = writeBatch(db);
            const chatDocRef = doc(db, "chats", chatId);
            const systemMessageRef = doc(collection(db, "chats", chatId, "messages"));
            const systemMessageText = "Czat został zamknięty";

            batch.update(chatDocRef, {
                status: "closed",
                closedBy: "admin",
                lastActivity: Timestamp.now(),
                lastMessage: systemMessageText,
                lastMessageSender: 'system',
                lastMessageTimestamp: Timestamp.now(),
            });

            batch.set(systemMessageRef, { text: systemMessageText, sender: "system", createdAt: Timestamp.now() });

            await batch.commit();
        } catch (error) {
            console.error("Error closing chat: ", error);
        }
    };

    const requestCloseChat = () => {
        setModalConfig({ title: 'Zamknij czat', message: 'Czy na pewno chcesz zamknąć ten czat? Klient nie będzie mógł już na niego odpowiedzieć.', confirmText: 'Zamknij', onConfirm: handleCloseChat, cancelText: 'Anuluj', variant: 'secondary' });
    };

    const handleAssignChat = async (adminId: string) => {
        if (!chatId) return;
        await updateDoc(doc(db, 'chats', chatId), { assignedAdminId: adminId });
        setAssignModalVisible(false);
    };

    const handleBlockUser = () => {
        console.log("Zablokuj użytkownika - do implementacji");
    };

    const requestAssignChat = () => {
        setAssignModalVisible(true);
    };
    
    const isChatInitiallyClosed = currentStatus === 'closed';
    const headerTitle = chat?.userInfo.contact || contactName;

    return (
        <MenuProvider>
            <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
                {modalConfig && <ConfirmationModal visible={true} onClose={() => setModalConfig(null)} {...modalConfig} />}
                
                <Modal
                    animationType="slide"
                    transparent={true}
                    visible={isAssignModalVisible}
                    onRequestClose={() => setAssignModalVisible(false)}
                >
                    <View style={styles.modalContainer}>
                        <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
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
                            <TouchableOpacity style={styles.closeModalButton} onPress={() => setAssignModalVisible(false)}>
                                <Text style={{color: themeColors.tint}}>Anuluj</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
                        <Ionicons name="arrow-back" size={24} color={themeColors.text} />
                        {showBackButtonBadge && <View style={[styles.backButtonBadge, { backgroundColor: themeColors.danger, borderColor: themeColors.background }]} />}
                    </TouchableOpacity>
                    <View style={styles.headerTitleContainer}>
                        <Text style={[styles.headerTitle, { color: themeColors.text }]} numberOfLines={1}>{headerTitle}</Text>
                        <Text style={[styles.headerSubtitle, { color: themeColors.textMuted }]}>Klient</Text>
                    </View>
                    <View style={styles.headerRightContainer}>
                        {!isChatInitiallyClosed && 
                            <TouchableOpacity onPress={requestCloseChat} style={[styles.headerActionButton, { backgroundColor: themeColors.secondary }]}>
                                <Text style={styles.headerActionButtonText}>Zamknij</Text>
                            </TouchableOpacity>
                        }
                        <Menu>
                            <MenuTrigger>
                                <Ionicons name="ellipsis-vertical" size={24} color={themeColors.text} style={{ padding: 5, marginLeft: 5 }}/>
                            </MenuTrigger>
                            <MenuOptions customStyles={{ optionsContainer: { backgroundColor: themeColors.background, borderRadius: 8 } }}>
                                <MenuOption onSelect={requestAssignChat}>
                                    <Text style={{ color: themeColors.text, padding: 10 }}>Przypisz do...</Text>
                                </MenuOption>
                                <MenuOption onSelect={handleBlockUser} disabled={true}>
                                    <Text style={{ color: '#aaa', padding: 10 }}>Zablokuj użytkownika</Text>
                                </MenuOption>
                            </MenuOptions>
                        </Menu>
                    </View>
                </View>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={90} enabled>
                    {loading ? <ActivityIndicator style={{ flex: 1 }} size="large" color={themeColors.tint} /> :
                        <FlatList 
                            data={messages} 
                            renderItem={({ item, index }) => <MessageBubble message={item} prevMessage={messages[index - 1]} nextMessage={messages[index + 1]} themeColors={themeColors} admins={adminsMap} />} 
                            keyExtractor={(item) => item.id.toString()} 
                            inverted 
                            contentContainerStyle={styles.listContent} 
                        />
                    }
                    {isChatInitiallyClosed ? (
                        <View style={[styles.inputContainer, { borderTopColor: themeColors.border, backgroundColor: themeColors.background }]}>
                            <Text style={[styles.closedChatText, { color: themeColors.textMuted }]}>Czat został zamknięty</Text>
                        </View>
                    ) : (
                        <View style={[styles.inputContainer, { borderTopColor: themeColors.border, backgroundColor: themeColors.background }]}>
                            <TextInput style={[styles.input, { color: themeColors.text, backgroundColor: '#f3f4f8' }]} value={newMessage} onChangeText={setNewMessage} placeholder="Napisz wiadomość..." placeholderTextColor={themeColors.textMuted} multiline />
                            <TouchableOpacity onPress={handleSend} style={[styles.sendButton, { backgroundColor: themeColors.tint }]}><Ionicons name="send" size={20} color="white" /></TouchableOpacity>
                        </View>
                    )}
                </KeyboardAvoidingView>
            </SafeAreaView>
        </MenuProvider>
    );
};

const styles = StyleSheet.create({
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
    }
});

export default ConversationScreen;
