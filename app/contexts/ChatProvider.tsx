
import { Colors } from '@/constants/theme';
import { useChats } from '@/hooks/useChats';
import { db } from '@/lib/firebase';
import { showMessage } from '@/lib/showMessage';
import { Chat, User } from '@/schemas';
import { Ionicons } from '@expo/vector-icons';
import { useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, useColorScheme, View } from 'react-native';
import { useSession } from './SessionContext';
// Throttle helper for per-chat notification guard
const { shouldNotify } = require('./notificationThrottle');

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => { ref.current = value; });
  return ref.current;
}

interface ChatContextType {
  chats: Chat[];
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  loading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  totalUnreadCount: number;
  admins: { [key: string]: User };
}

const ChatContext = createContext<ChatContextType>({ chats: [], setChats: () => {}, loading: true, isLoadingMore: false, hasMore: false, loadMore: async () => {}, totalUnreadCount: 0, admins: {} });

export const useChatContext = () => useContext(ChatContext);

export const ChatProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const { chats, setChats, loading, isLoadingMore, hasMore, loadMore } = useChats({ pageSize: 30 });
  const [admins, setAdmins] = useState<{ [key: string]: User }>({});
  const prevChats = usePrevious(chats);
  const { appEnteredAt } = useSession();

  const theme = useColorScheme() ?? 'light';
  const themeColors = Colors[theme];
  const router = useRouter();
  const segments: string[] = useSegments();
  const { id: chatIdFromParams } = useGlobalSearchParams();

  // In-memory per-chat notification timestamps to prevent duplicate/rapid notifications
  const notifiedTimestampsRef = useRef<Record<string, number>>({});
  const THROTTLE_MS = 1000; // 1s throttle

  useEffect(() => {
    const fetchAdmins = async () => {
      const adminsRef = collection(db, 'users');
      const q = query(adminsRef, where('role', '==', 'admin'));
      const querySnapshot = await getDocs(q);
      const adminsMap: { [key: string]: User } = {};
      querySnapshot.forEach(doc => {
        adminsMap[doc.id] = { id: doc.id, ...doc.data() } as User;
      });
      setAdmins(adminsMap);
    };
    fetchAdmins();
  }, []);

  useEffect(() => {
    if (!prevChats || loading) return;

    chats.forEach(currentChat => {
      const previousChat = prevChats.find(p => p.id === currentChat.id);

      const onChatListScreen = segments.includes('(tabs)') && segments.includes('index');
      const inThisSpecificChat = segments.includes('conversation') && chatIdFromParams === currentChat.id;

      // Handle brand-new chats (appear in `chats` but not in previous snapshot)
      if (!previousChat) {
          const isNewAfterSessionStart = currentChat.createdAt && currentChat.createdAt.toMillis() > appEnteredAt;
        const hasUnread = currentChat.adminUnread > 0;
        const hasNewMessageAfterStart = currentChat.lastMessageTimestamp && currentChat.lastMessageTimestamp.toMillis() > appEnteredAt;
        const isWaiting = currentChat.status === 'waiting';

        // Use shared logic helper
        const { shouldNotifyForNewChat } = require('./chatNotificationLogic');

        if (shouldNotifyForNewChat(currentChat, appEnteredAt, onChatListScreen, inThisSpecificChat)) {
            const candidateTs = (currentChat.lastMessageTimestamp && currentChat.lastMessageTimestamp.toMillis()) ?? (currentChat.createdAt && currentChat.createdAt.toMillis()) ?? Date.now();
            const lastNotified = notifiedTimestampsRef.current[currentChat.id] || 0;

            if (shouldNotify(candidateTs, lastNotified, THROTTLE_MS)) {
                showMessage({
                    message: `Nowy czat od ${currentChat.userInfo.contact}`,
                    description: currentChat.lastMessage ?? '',
                    duration: 5000,
                    onPress: () => { router.push((`/conversation/${currentChat.id}`) as any); },
                    floating: true,
                    hideOnPress: true,
                    chatId: currentChat.id,
                    style: {
                        backgroundColor: theme === 'light' ? 'rgba(242, 242, 247, 0.97)' : 'rgba(28, 28, 30, 0.97)',
                        borderRadius: 20,
                        marginTop: Platform.OS === 'ios' ? 40 : 20,
                        marginHorizontal: 10,
                        paddingVertical: 10,
                        paddingHorizontal: 5,
                        ...Platform.select({
                            ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6 },
                            android: { elevation: 8 }
                        })
                    },
                    titleStyle: { fontWeight: 'bold', fontSize: 15, color: themeColors.text, marginLeft: 5 },
                    textStyle: { fontSize: 13, color: themeColors.textMuted, marginLeft: 5, marginTop: 2 },
                    icon: () => (
                        <View style={{ justifyContent: 'center', height: '100%', marginLeft: 12, marginRight: 8 }}>
                            <Ionicons name="chatbubble-ellipses-outline" size={28} color={themeColors.tint} />
                        </View>
                    ),
                });
                notifiedTimestampsRef.current[currentChat.id] = candidateTs;
            }
        }

        return;
      }

      const hasNewUnreadMessage = currentChat.adminUnread > previousChat.adminUnread;
      const isMessageNewerThanSessionStart = currentChat.lastMessageTimestamp && currentChat.lastMessageTimestamp.toMillis() > appEnteredAt;

      // Detect lastMessageTimestamp advancement even if adminUnread didn't change
      const lastMessageAdvanced = !!(currentChat.lastMessageTimestamp && (
        !previousChat.lastMessageTimestamp || currentChat.lastMessageTimestamp.toMillis() > previousChat.lastMessageTimestamp!.toMillis()
      ));

      const { shouldNotifyForMessage } = require('./chatNotificationLogic');

      if (shouldNotifyForMessage(previousChat, currentChat, appEnteredAt, onChatListScreen, inThisSpecificChat)) {
        const candidateTs = (currentChat.lastMessageTimestamp && currentChat.lastMessageTimestamp.toMillis()) ?? (currentChat.createdAt && currentChat.createdAt.toMillis()) ?? Date.now();
        const lastNotified = notifiedTimestampsRef.current[currentChat.id] || 0;

        if (shouldNotify(candidateTs, lastNotified, THROTTLE_MS)) {
            showMessage({
                message: `Wiadomość od ${currentChat.userInfo.contact}`,
                description: currentChat.lastMessage,
                duration: 5000,
                onPress: () => { router.push((`/conversation/${currentChat.id}`) as any); },
                floating: true,
                hideOnPress: true,
                chatId: currentChat.id,
                style: {
                    backgroundColor: theme === 'light' ? 'rgba(242, 242, 247, 0.97)' : 'rgba(28, 28, 30, 0.97)',
                    borderRadius: 20,
                    marginTop: Platform.OS === 'ios' ? 40 : 20,
                    marginHorizontal: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 5,
                    ...Platform.select({
                        ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6 },
                        android: { elevation: 8 }
                    })
                },
                titleStyle: { fontWeight: 'bold', fontSize: 15, color: themeColors.text, marginLeft: 5 },
                textStyle: { fontSize: 13, color: themeColors.textMuted, marginLeft: 5, marginTop: 2 },
                icon: () => (
                    <View style={{ justifyContent: 'center', height: '100%', marginLeft: 12, marginRight: 8 }}>
                        <Ionicons name="chatbubble-ellipses-outline" size={28} color={themeColors.tint} />
                    </View>
                ),
            });
            notifiedTimestampsRef.current[currentChat.id] = candidateTs;
        }
      }
    });
  }, [chats, prevChats, loading, appEnteredAt, segments, chatIdFromParams, router, theme, themeColors]);

  const totalUnreadCount = useMemo(() => {
    return chats.reduce((sum, chat) => sum + (chat.adminUnread || 0), 0);
  }, [chats]);

  const value = { chats, setChats, loading, isLoadingMore, hasMore, loadMore, totalUnreadCount, admins };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}
