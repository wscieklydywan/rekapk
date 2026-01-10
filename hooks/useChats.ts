
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { Chat } from '@/schemas';

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
