"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyAdminsOnNewForm = exports.notifyAdminsOnNewChat = exports.handleNewMessagePush = exports.buildNewChatMessages = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
admin.initializeApp();
const db = admin.firestore();
// Helper to build push messages for a new chat (exported for tests)
const buildNewChatMessages = (chat, adminsDocs) => {
    const assignedAdminId = chat.assignedAdminId || null;
    const contactName = (chat.userInfo && (chat.userInfo.contact || chat.userInfo.name)) || 'Klient';
    const body = `${contactName} czeka na konsultanta`;
    const messagesToSend = [];
    for (const adminDoc of adminsDocs) {
        const adminData = adminDoc.data();
        const adminId = adminDoc.id;
        if (adminData.isForeground === true || !adminData.pushToken)
            continue;
        const notificationMode = adminData.notificationSettings?.mode ?? 'assigned';
        let shouldReceive = false;
        if (notificationMode === 'all')
            shouldReceive = true;
        else if (notificationMode === 'assigned') {
            if (!assignedAdminId || assignedAdminId === adminId)
                shouldReceive = true;
        }
        if (shouldReceive) {
            messagesToSend.push({
                to: adminData.pushToken,
                title: "Nowy czat",
                body,
                sound: "default",
                priority: "high",
                channelId: "chat-messages",
                data: { chatId: chat.id || null, type: "new_chat" },
            });
        }
    }
    return messagesToSend;
};
exports.buildNewChatMessages = buildNewChatMessages;
// Helper to send pushes using native fetch
const sendExpoPushes = async (messages) => {
    if (messages.length === 0)
        return;
    try {
        await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Accept-Encoding": "gzip, deflate",
            },
            body: JSON.stringify(messages),
        });
    }
    catch (error) {
        functions.logger.error("Błąd podczas wysyłania powiadomień do Expo:", error);
    }
};
exports.handleNewMessagePush = functions
    .region("europe-west1")
    .firestore.document("chats/{chatId}/messages/{messageId}")
    .onCreate(async (snapshot, context) => {
    const message = snapshot.data();
    // Only trigger on new messages from the user
    if (message?.sender !== "user") {
        return null;
    }
    const { chatId } = context.params;
    try {
        const chatDoc = await db.collection("chats").doc(chatId).get();
        if (!chatDoc.exists) {
            functions.logger.log(`Chat ${chatId} not found.`);
            return null;
        }
        const chat = chatDoc.data();
        // If this chat hasn't been notified as 'new chat' yet, and is in waiting state,
        // treat this message as a trigger for a new-chat notification (helps when chat was created
        // without the onCreate trigger firing or if the message arrives immediately).
        if (chat.status === 'waiting' && chat.newChatNotified !== true) {
            functions.logger.log(`handleNewMessagePush: detected first message in waiting chat ${chatId}, sending new-chat notifications.`);
            const adminsSnapshot = await db.collection("users").where("role", "==", "admin").get();
            if (!adminsSnapshot.empty) {
                const assignedAdminId = chat.assignedAdminId || null;
                const messagesToSend = [];
                const contactName = (chat.userInfo && (chat.userInfo.contact || chat.userInfo.name)) || 'Klient';
                const body = `${contactName} czeka na konsultanta`;
                for (const adminDoc of adminsSnapshot.docs) {
                    const adminData = adminDoc.data();
                    const adminId = adminDoc.id;
                    if (adminData.isForeground === true || !adminData.pushToken)
                        continue;
                    const notificationMode = adminData.notificationSettings?.mode ?? 'assigned';
                    let shouldReceive = false;
                    if (notificationMode === 'all')
                        shouldReceive = true;
                    else if (notificationMode === 'assigned') {
                        if (!assignedAdminId || assignedAdminId === adminId)
                            shouldReceive = true;
                    }
                    if (shouldReceive) {
                        messagesToSend.push({
                            to: adminData.pushToken,
                            title: "Nowy czat",
                            body,
                            sound: "default",
                            priority: "high",
                            channelId: "chat-messages",
                            data: { chatId, type: "new_chat" },
                        });
                    }
                }
                if (messagesToSend.length > 0) {
                    await sendExpoPushes(messagesToSend);
                    functions.logger.log(`Sent ${messagesToSend.length} new-chat notifications for chat ${chatId} (via message-trigger).`);
                }
                try {
                    await db.collection('chats').doc(chatId).set({ newChatNotified: true }, { merge: true });
                }
                catch (e) {
                    functions.logger.warn('Failed to set newChatNotified flag (message-trigger)', e);
                }
            }
            // continue to allow message-based notifications as well (admins might want message preview)
        }
        // 🔥 KEY CONDITION: If an admin is actively viewing the chat, abort message push notifications.
        if (chat.activeAdminId) {
            functions.logger.log(`Admin ${chat.activeAdminId} is active in chat ${chatId}. Push notifications aborted.`);
            return null;
        }
        // --- If we are here, no admin is active. Proceed with message push logic. ---
        const adminsSnapshot = await db.collection("users").where("role", "==", "admin").get();
        if (adminsSnapshot.empty) {
            functions.logger.log("No admins found to send notifications to.");
            return null;
        }
        const assignedAdminId = chat.assignedAdminId || null;
        const messagesToSend = [];
        const messageBody = message.text.length > 100 ? message.text.slice(0, 97) + "…" : message.text;
        for (const adminDoc of adminsSnapshot.docs) {
            const adminData = adminDoc.data();
            const adminId = adminDoc.id;
            if (adminData.isForeground === true || !adminData.pushToken) {
                continue;
            }
            const notificationMode = adminData.notificationSettings?.mode ?? 'assigned';
            let shouldReceivePush = false;
            if (notificationMode === 'all') {
                shouldReceivePush = true;
            }
            else if (notificationMode === 'assigned') {
                if (!assignedAdminId || assignedAdminId === adminId) {
                    shouldReceivePush = true;
                }
            }
            if (shouldReceivePush) {
                messagesToSend.push({
                    to: adminData.pushToken,
                    title: "Nowa wiadomość!",
                    body: messageBody,
                    sound: "default",
                    priority: "high",
                    channelId: "chat-messages",
                    data: { chatId, type: "chat_message" },
                });
            }
        }
        if (messagesToSend.length > 0) {
            await sendExpoPushes(messagesToSend);
            functions.logger.log(`Sent ${messagesToSend.length} push notifications for chat ${chatId}.`);
        }
        return null;
    }
    catch (error) {
        functions.logger.error("Error in handleNewMessagePush:", error);
        return null;
    }
});
exports.notifyAdminsOnNewChat = functions
    .region("europe-west1")
    .firestore.document("chats/{chatId}")
    .onCreate(async (snapshot, context) => {
    const chat = snapshot.data();
    if (!chat)
        return null;
    const { chatId } = context.params;
    // Only notify when chat appears in 'waiting' state
    if (chat.status !== 'waiting')
        return null;
    try {
        // If we already notified about this chat, skip (idempotency)
        if (chat.newChatNotified === true) {
            functions.logger.log(`Chat ${chatId} already notified (newChatNotified). Skipping.`);
            return null;
        }
        // If an admin is already active in the chat, skip notifications
        if (chat.activeAdminId) {
            functions.logger.log(`Admin ${chat.activeAdminId} is active in chat ${chatId}. New-chat notifications aborted.`);
            return null;
        }
        const adminsSnapshot = await db.collection("users").where("role", "==", "admin").get();
        if (adminsSnapshot.empty) {
            functions.logger.log("No admins found to send new-chat notifications to.");
            return null;
        }
        const assignedAdminId = chat.assignedAdminId || null;
        const messagesToSend = [];
        const contactName = (chat.userInfo && (chat.userInfo.contact || chat.userInfo.name)) || 'Klient';
        const body = `${contactName} czeka na konsultanta`;
        for (const adminDoc of adminsSnapshot.docs) {
            const adminData = adminDoc.data();
            const adminId = adminDoc.id;
            if (adminData.isForeground === true || !adminData.pushToken)
                continue;
            const notificationMode = adminData.notificationSettings?.mode ?? 'assigned';
            let shouldReceive = false;
            if (notificationMode === 'all')
                shouldReceive = true;
            else if (notificationMode === 'assigned') {
                if (!assignedAdminId || assignedAdminId === adminId)
                    shouldReceive = true;
            }
            if (shouldReceive) {
                messagesToSend.push({
                    to: adminData.pushToken,
                    title: "Nowy czat",
                    body,
                    sound: "default",
                    priority: "high",
                    channelId: "chat-messages",
                    data: { chatId, type: "new_chat" },
                });
            }
        }
        if (messagesToSend.length > 0) {
            await sendExpoPushes(messagesToSend);
            functions.logger.log(`Sent ${messagesToSend.length} new-chat notifications for chat ${chatId}.`);
        }
        // Mark chat as notified to avoid duplicates
        try {
            await db.collection('chats').doc(chatId).set({ newChatNotified: true }, { merge: true });
        }
        catch (e) {
            functions.logger.warn('Failed to set newChatNotified flag', e);
        }
        return null;
    }
    catch (error) {
        functions.logger.error("Error in notifyAdminsOnNewChat:", error);
        return null;
    }
});
// The 'notifyAdminsOnNewForm' function remains unchanged.
exports.notifyAdminsOnNewForm = functions
    .region("europe-west1")
    .firestore.document("contact_forms/{formId}/messages/{messageId}")
    .onCreate(async (snapshot, context) => {
    const message = snapshot.data();
    if (message?.sender !== "user") {
        return null;
    }
    const { formId } = context.params;
    try {
        const adminsSnapshot = await db.collection("users").where("role", "==", "admin").get();
        if (adminsSnapshot.empty)
            return null;
        const messagesToSend = [];
        for (const adminDoc of adminsSnapshot.docs) {
            const adminData = adminDoc.data();
            if (adminData.isForeground === true || !adminData.pushToken) {
                continue;
            }
            messagesToSend.push({
                to: adminData.pushToken,
                title: "Formularz kontaktowy",
                body: "Nowe zgłoszenie",
                sound: "default",
                priority: "high",
                channelId: "chat-messages",
                data: { formId, type: "form_message" },
            });
        }
        if (messagesToSend.length > 0) {
            await sendExpoPushes(messagesToSend);
            functions.logger.log(`Powiadomienia o formularzu wysłane do ${messagesToSend.length} adminów.`);
        }
        return null;
    }
    catch (error) {
        functions.logger.error("Błąd w notifyAdminsOnNewForm:", error);
        return null;
    }
});
//# sourceMappingURL=index.js.map