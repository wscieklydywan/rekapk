
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, Timestamp, getDocs, limit } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { Message } from '@/schemas';

export const useMessages = (chatId: string) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!chatId || !user) {
        setMessages([]);
        return;
    }

    const loadHistory = async () => {
      const messagesCollection = collection(db, 'chats', chatId, 'messages');
      const q = query(messagesCollection, orderBy('createdAt', 'asc'));
      const historySnapshot = await getDocs(q);
      const history = historySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Message));
      setMessages(history);
    };

    loadHistory();

    const messagesCollection = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesCollection, orderBy('createdAt', 'desc'), limit(1));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const docData = change.doc.data();
          const newMessage: Message = {
            id: change.doc.id,
            chatId: chatId,
            text: docData.text,
            sender: docData.sender,
            createdAt: docData.createdAt || Timestamp.now(),
            isRead: docData.isRead || false,
          };

          setMessages(prev => {
            if (prev.some(m => m.id === newMessage.id)) return prev;
            return [...prev, newMessage].sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
          });
        }
      });
    }, (error) => {
      console.error("Error fetching messages: ", error);
    });

    return () => unsubscribe();
  }, [chatId, user]);

  const sendMessage = async (text: string) => {
    if (!chatId || !user) return;

    const messagesCollection = collection(db, 'chats', chatId, 'messages');
    await addDoc(messagesCollection, {
      text,
      sender: 'admin',
      createdAt: serverTimestamp(),
      isRead: false,
      chatId: chatId,
    });
  };

  return { messages, sendMessage };
};
