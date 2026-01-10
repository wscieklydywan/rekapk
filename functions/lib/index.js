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
exports.notifyAdminsOnNewForm = exports.handleNewMessagePush = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
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
    if (message.sender !== "user") {
        return null;
    }
    const { chatId } = context.params;
    try {
        // Get chat document and all admin users simultaneously
        const [chatDoc, adminsSnapshot] = await Promise.all([
            db.collection("chats").doc(chatId).get(),
            db.collection("users").where("role", "==", "admin").get(),
        ]);
        if (!chatDoc.exists || adminsSnapshot.empty) {
            functions.logger.log(`Chat ${chatId} or admins not found.`);
            return null;
        }
        const chat = chatDoc.data();
        const assignedAdminId = chat.assignedAdminId || null; // Ensure it's null if undefined
        const messagesToSend = [];
        const messageBody = message.text.length > 100 ? message.text.slice(0, 97) + "…" : message.text;
        for (const adminDoc of adminsSnapshot.docs) {
            const adminData = adminDoc.data();
            const adminId = adminDoc.id;
            // Skip admin if they are active in the app or have no push token
            if (adminData.isForeground === true || !adminData.pushToken) {
                continue;
            }
            // Determine admin's notification preference ('assigned' is the default)
            const notificationMode = adminData.notificationSettings?.mode ?? 'assigned';
            let shouldReceivePush = false;
            // RULE 1: Admin with 'all' mode gets all notifications
            if (notificationMode === 'all') {
                shouldReceivePush = true;
            }
            // RULE 2: Admin with 'assigned' mode gets pushes for their chats or unassigned chats
            else if (notificationMode === 'assigned') {
                if (!assignedAdminId) { // Unassigned chat
                    shouldReceivePush = true;
                }
                else if (assignedAdminId === adminId) { // Chat is assigned to this admin
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
            functions.logger.log(`Sent ${messagesToSend.length} push notifications based on soft-assignment rules.`);
        }
        return null;
    }
    catch (error) {
        functions.logger.error("Error in handleNewMessagePush:", error);
        return null;
    }
});
// The 'notifyAdminsOnNewForm' function remains unchanged as it has simpler logic
exports.notifyAdminsOnNewForm = functions
    .region("europe-west1")
    .firestore.document("contact_forms/{formId}/messages/{messageId}")
    .onCreate(async (snapshot, context) => {
    const message = snapshot.data();
    if (message.sender !== "user") {
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