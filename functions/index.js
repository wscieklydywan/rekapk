// Final, cleaned up version.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios_1 = require("axios");
admin.initializeApp();
exports.sendPushNotification = functions.firestore
    .document('chats/{chatId}')
    .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const oldData = change.before.data();
    const chatId = context.params.chatId;
    const lastMessage = newData.lastMessage;
    if (!lastMessage || lastMessage === oldData.lastMessage || lastMessage.startsWith('https://firebasestorage')) {
        console.log(`No new text message in ${chatId}. Skipping notification.`);
        return null;
    }
    if (newData.userUnread > (oldData.userUnread || 0)) {
        const adminId = newData.adminId;
        if (!adminId) {
            console.error(`CRITICAL: No adminId found in chat ${chatId}. Cannot notify admin.`);
            return null;
        }
        console.log(`New message from user in chat ${chatId}. Attempting to notify admin ${adminId}.`);
        const adminDoc = await admin.firestore().collection('admin_users').doc(adminId).get();
        const adminPushToken = adminDoc.data()?.pushToken;
        if (!adminPushToken) {
            console.error(`ERROR: Admin ${adminId} does not have a push token. Cannot send notification.`);
            return null;
        }
        const message = {
            to: adminPushToken,
            sound: 'default',
            title: `Nowa wiadomość od klienta`,
            body: lastMessage,
            data: { chatId: chatId },
        };
        try {
            await axios_1.default.post('https://exp.host/--/api/v2/push/send', message, {
                headers: {
                    'Accept': 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
            });
            console.log(`SUCCESS: Push notification sent to admin ${adminId} for chat ${chatId}.`);
        }
        catch (error) {
            console.error(`FATAL: Error sending push notification to admin ${adminId}:`, error);
        }
    }
    else if (newData.adminUnread > (oldData.adminUnread || 0)) {
        const userPushToken = newData.userPushToken;
        if (!userPushToken) {
            console.log(`User in chat ${chatId} does not have a push token. Skipping notification.`);
            return null;
        }
        console.log(`New message from admin in chat ${chatId}. Attempting to notify user.`);
        const message = {
            to: userPushToken,
            sound: 'default',
            title: 'Nowa wiadomość od Re-klamy',
            body: lastMessage,
            data: { chatId: chatId },
        };
        try {
            await axios_1.default.post('https://exp.host/--/api/v2/push/send', message, {
                headers: {
                    'Accept': 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
            });
            console.log(`SUCCESS: Push notification sent to user for chat ${chatId}.`);
        }
        catch (error) {
            console.error(`FATAL: Error sending push notification to user in chat ${chatId}:`, error);
        }
    }
    return null;
});
