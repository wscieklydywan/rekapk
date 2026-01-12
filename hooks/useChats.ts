
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { Chat } from '@/schemas';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';

export const useChats = () => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setChats([]);
      setLoading(false);
      return;
    }

    const chatsCollection = collection(db, 'chats');
    const q = query(
      chatsCollection, 
      orderBy('lastActivity', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          status: data.status,
          createdAt: data.createdAt,
          lastActivity: data.lastActivity,
          lastMessage: data.lastMessage || '', 
          lastMessageSender: data.lastMessageSender || null,
          lastMessageTimestamp: data.lastMessageTimestamp || null,
          operatorId: data.operatorId,
          operatorJoinedAt: data.operatorJoinedAt,
          userInfo: data.userInfo,
          userActive: data.userActive,
          closedBy: data.closedBy,
          rating: data.rating,
          feedback: data.feedback,
          adminTyping: data.adminTyping,
          adminUnread: data.adminUnread,
          userUnread: data.userUnread,
          activeAdminId: data.activeAdminId || null,
          assignedAdminId: data.assignedAdminId || null,
          isBlocked: data.isBlocked || false,
          // Denormalized ban fields (may be absent on older docs)
          userUid: data.userUid || null,
          userIsBanned: typeof data.userIsBanned === 'boolean' ? data.userIsBanned : false,
          bannedUntil: data.bannedUntil || null,
          banReason: data.banReason || null,
          bannedAt: data.bannedAt || null,
          lastPushAt: data.lastPushAt || null,
        } as Chat;
      });
      setChats(chatsData);
      setLoading(false);
    }, (error) => {
      console.error("Błąd podczas pobierania czatów: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const updateChatStatus = async (chatId: string, status: string) => {
    const chatRef = doc(db, 'chats', chatId);
    await updateDoc(chatRef, { status });
  };

  const deleteChat = async (chatId: string) => {
    const chatRef = doc(db, 'chats', chatId);
    await deleteDoc(chatRef);
  };

  return { chats, setChats, loading, updateChatStatus, deleteChat };
};
