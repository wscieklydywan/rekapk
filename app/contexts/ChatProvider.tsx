
import React, { createContext, useContext, useMemo, useEffect, useRef, useState } from 'react';
import { Platform, useColorScheme, View } from 'react-native';
import { useChats } from '@/hooks/useChats';
import { Chat, User } from '@/schemas';
import { showMessage } from 'react-native-flash-message';
import { useRouter, useSegments, useGlobalSearchParams } from 'expo-router';
import { Colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from './SessionContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => { ref.current = value; });
  return ref.current;
}

interface ChatContextType {
  chats: Chat[];
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  loading: boolean;
  totalUnreadCount: number;
  admins: { [key: string]: User };
}

const ChatContext = createContext<ChatContextType>({ chats: [], setChats: () => {}, loading: true, totalUnreadCount: 0, admins: {} });

export const useChatContext = () => useContext(ChatContext);

export const ChatProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const { chats, setChats, loading } = useChats();
  const [admins, setAdmins] = useState<{ [key: string]: User }>({});
  const prevChats = usePrevious(chats);
  const { appEnteredAt } = useSession();

  const theme = useColorScheme() ?? 'light';
  const themeColors = Colors[theme];
  const router = useRouter();
  const segments: string[] = useSegments();
  const { id: chatIdFromParams } = useGlobalSearchParams();

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
      if (!previousChat) return; // Nowy czat, zignoruj

      const hasNewUnreadMessage = currentChat.adminUnread > previousChat.adminUnread;
      const isMessageNewerThanSessionStart = currentChat.lastMessageTimestamp && currentChat.lastMessageTimestamp.toMillis() > appEnteredAt;

      if (hasNewUnreadMessage && isMessageNewerThanSessionStart) {
        const onChatListScreen = segments.includes('(tabs)') && segments.includes('index');
        const inThisSpecificChat = segments.includes('conversation') && chatIdFromParams === currentChat.id;
        
        if (!onChatListScreen && !inThisSpecificChat) {
            showMessage({
                message: `Wiadomość od ${currentChat.userInfo.contact}`,
                description: currentChat.lastMessage,
                duration: 5000,
                onPress: () => router.push((`/conversation/${currentChat.id}`) as any),
                floating: true,
                hideOnPress: true,
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
        }
      }
    });
  }, [chats, prevChats, loading, appEnteredAt, segments, chatIdFromParams, router, theme, themeColors]);

  const totalUnreadCount = useMemo(() => {
    return chats.reduce((sum, chat) => sum + (chat.adminUnread || 0), 0);
  }, [chats]);

  const value = { chats, setChats, loading, totalUnreadCount, admins };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}
