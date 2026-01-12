import { Timestamp } from "firebase/firestore";

export interface User {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  roles: ('admin' | 'user')[];
  expoPushTokens?: string[];
  createdAt: Timestamp;
  role: 'admin' | 'user';
}

export interface Chat {
  id: string;
  status: 'waiting' | 'active' | 'closed';
  createdAt: Timestamp;
  lastActivity: Timestamp;
  lastMessage?: string;
  lastMessageSender?: 'user' | 'admin' | 'system';
  lastMessageTimestamp?: Timestamp;
  operatorId?: string;
  operatorJoinedAt?: Timestamp;
  userInfo: {
    name?: string;
    email?: string;
    phone?: string;
    contact?: string; 
  };
  userActive?: boolean;
  closedBy?: 'user' | 'admin' | 'system';
  rating?: number;
  feedback?: string;
  adminTyping?: boolean;
  adminUnread: number;
  userUnread: number;
  activeAdminId: string | null;
  assignedAdminId: string | null;
  isBlocked?: boolean;
  lastPushAt?: Timestamp | null;

  // Optional denormalized user ban fields (for quick client-side checks without extra reads)
  userUid?: string;
  userIsBanned?: boolean;
  bannedUntil?: Timestamp | null;
  banReason?: string;
  bannedBy?: string;
  bannedAt?: Timestamp | null;
}

export interface Message {
  id: string;
  chatId: string;
  text: string;
  sender: 'user' | 'admin' | 'system' | 'ai';
  createdAt: Timestamp;
  adminId?: string;
  clientId?: string;
  type?: 'text' | 'image' | 'file';
  isRead: boolean;
  metadata?: Record<string, any>;
  isFirstMessage?: boolean;
  // Local-only runtime flags (not necessarily persisted on server)
  pending?: boolean;
  failed?: boolean;
} 

export interface ContactForm {
  id: string;
  userInfo: {
    contact: string;
    [key: string]: any;
  };
  createdAt: Timestamp;
  lastActivity: Timestamp;
  status: 'new' | 'read' | 'waiting' | 'answered';
  adminUnread: number;
  [key: string]: any; 
}

// Message stored on contact forms
export interface FormMessage {
  id: string;
  text: string;
  createdAt: Timestamp;
  [key: string]: any;
} 

export interface AiConversation {
    id: string;
    userId?: string; 
    title: string;
    createdAt: Timestamp;
    lastActivity: Timestamp;
    model: string;
    systemPrompt?: string; 
    messages: AiMessage[];
}

export interface AiMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Timestamp;
    metadata?: Record<string, any>;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'chat' | 'form' | 'system';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Timestamp;
  link?: string;
}
