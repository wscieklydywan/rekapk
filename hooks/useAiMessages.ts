
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { Message } from '@/schemas';

export const useAiMessages = (chatId: string) => {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!chatId) {
        setMessages([]);
        return;
    }

    const messagesCollection = collection(db, 'ai_conversations', chatId, 'messages');
    const q = query(messagesCollection, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messagesData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          text: data.text,
          sender: data.sender,
          createdAt: data.createdAt,
          adminOnly: data.adminOnly,
          isAiContextHeader: data.isAiContextHeader,
          isAiContext: data.isAiContext,
          isAiContextFooter: data.isAiContextFooter,
          aiRole: data.aiRole,
        } as Message;
      });
      setMessages(messagesData);
    }, (error) => {
      console.error("Error fetching AI messages: ", error);
    });

    return () => unsubscribe();
  }, [chatId]);

  const sendAiMessage = async (text: string) => {
    if (!chatId) return;

    const messagesCollection = collection(db, 'ai_conversations', chatId, 'messages');
    await addDoc(messagesCollection, {
      text,
      sender: 'admin', // Assuming the mobile app user is the admin/consultant
      createdAt: serverTimestamp(),
    });
  };

  return { messages, sendAiMessage };
};
