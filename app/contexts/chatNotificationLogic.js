function millis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  return value;
}

function shouldNotifyForNewChat(currentChat, appEnteredAt, onChatListScreen, inThisSpecificChat) {
  const createdAtMs = millis(currentChat.createdAt);
  const lastMessageTsMs = millis(currentChat.lastMessageTimestamp);
  const isNewAfterSessionStart = createdAtMs && createdAtMs > appEnteredAt;
  const hasUnread = (currentChat.adminUnread || 0) > 0;
  const isWaiting = currentChat.status === 'waiting';
  const hasNewMessageAfterStart = lastMessageTsMs && lastMessageTsMs > appEnteredAt;

  return Boolean(isNewAfterSessionStart && !onChatListScreen && !inThisSpecificChat && (hasUnread || isWaiting || hasNewMessageAfterStart));
}

function shouldNotifyForMessage(previousChat, currentChat, appEnteredAt, onChatListScreen, inThisSpecificChat) {
  const prevLastMs = millis(previousChat && previousChat.lastMessageTimestamp);
  const currLastMs = millis(currentChat && currentChat.lastMessageTimestamp);
  const hasNewUnreadMessage = (currentChat.adminUnread || 0) > (previousChat && (previousChat.adminUnread || 0));
  const lastMessageAdvanced = Boolean(currLastMs && (!prevLastMs || currLastMs > prevLastMs));
  const isMessageNewerThanSessionStart = currLastMs && currLastMs > appEnteredAt;

  return Boolean((hasNewUnreadMessage || lastMessageAdvanced) && isMessageNewerThanSessionStart && !onChatListScreen && !inThisSpecificChat);
}

function candidateTimestampForChat(currentChat) {
  const lastMs = millis(currentChat.lastMessageTimestamp);
  const createdMs = millis(currentChat.createdAt);
  return lastMs ?? createdMs ?? Date.now();
}

module.exports = { shouldNotifyForNewChat, shouldNotifyForMessage, candidateTimestampForChat };
