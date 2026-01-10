import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// Helper to send pushes using native fetch
const sendExpoPushes = async (messages: object[]) => {
  if (messages.length === 0) return;
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
  } catch (error) {
    functions.logger.error("Błąd podczas wysyłania powiadomień do Expo:", error);
  }
};

export const handleNewMessagePush = functions
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
      const chatDoc = await db.collection("chats").doc(chatId).get();

      if (!chatDoc.exists) {
        functions.logger.log(`Chat ${chatId} not found.`);
        return null;
      }

      const chat = chatDoc.data()!;

      // 🔥 KEY CONDITION: If an admin is actively viewing the chat, abort all push notifications.
      if (chat.activeAdminId) {
        functions.logger.log(`Admin ${chat.activeAdminId} is active in chat ${chatId}. Push notifications aborted.`);
        return null;
      }

      // --- If we are here, no admin is active. Proceed with push logic. ---

      const adminsSnapshot = await db.collection("users").where("role", "==", "admin").get();

      if (adminsSnapshot.empty) {
        functions.logger.log("No admins found to send notifications to.");
        return null;
      }

      const assignedAdminId = chat.assignedAdminId || null; 
      const messagesToSend: object[] = [];
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
    } catch (error) {
      functions.logger.error("Error in handleNewMessagePush:", error);
      return null;
    }
  });

// The 'notifyAdminsOnNewForm' function remains unchanged.
export const notifyAdminsOnNewForm = functions
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
      if (adminsSnapshot.empty) return null;

      const messagesToSend: object[] = [];
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
    } catch (error) {
      functions.logger.error("Błąd w notifyAdminsOnNewForm:", error);
      return null;
    }
  });
