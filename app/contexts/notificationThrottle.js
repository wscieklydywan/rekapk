function shouldNotify(candidateTs, lastNotified, throttleMs = 1000) {
  // If we've never notified for this chat (lastNotified falsy), always allow
  if (!lastNotified) return true;
  return candidateTs > lastNotified + throttleMs;
}

module.exports = { shouldNotify };
