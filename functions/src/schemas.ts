
import { Timestamp } from 'firebase/firestore';

export interface UserInfo {
    contact: string;
    name: string;
    userAgent: string;
}

export interface Chat {
    id: string;
    status: 'waiting' | 'active' | 'closed' | 'ai_chat';
    aiConversationId?: string;
    adminId?: string | null;
    operatorId?: string | null;
    userInfo: UserInfo;
    lastMessage: string;
    lastMessageSender: 'user' | 'admin' | 'system' | 'ai';
    lastMessageTimestamp: Timestamp;
    createdAt: Timestamp;
    lastActivity: Timestamp;
    adminUnread: number;
    userUnread: number;
    operatorJoinedAt?: Timestamp;
    closedAt?: Timestamp;
    closedBy?: 'user' | 'admin' | 'system';
    openPushSent?: boolean;
    adminPushCount?: number; 
    lastAdminPushAt?: Timestamp;
    assignedAdminId?: string | null;
    activeAdminId?: string | null;

    // Denormalized user ban fields (for admin/client quick checks)
    userUid?: string;
    userIsBanned?: boolean;
    bannedUntil?: Timestamp | null;
    banReason?: string;
    bannedBy?: string | null;
    bannedAt?: Timestamp | null;
}

export interface Message {
    id: string;
    text: string;
    sender: 'user' | 'admin' | 'system' | 'ai';
    createdAt: Timestamp;
    clientId?: string;
    isAiContext?: boolean; // Added field
    isAiContextFooter?: boolean; // Added field
} 

export interface AdminUser {
    uid: string;
    email?: string;
    displayName?: string;
    app_status: 'active' | 'background';
    pushToken?: string;
}

export interface ContactForm {
    id: string;
    userInfo: UserInfo;
    message: string;
    createdAt: Timestamp;
    status: 'new' | 'read';
    pushSent?: boolean;
}
