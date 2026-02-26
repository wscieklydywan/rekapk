import { Message, User } from '@/schemas';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Timestamp } from '@/lib/firebase';
import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';

const GROUP_THRESHOLD_MINUTES = 3;

const copyToClipboard = async (text?: string) => {
    try {
        if (!text) return;
        await Clipboard.setStringAsync(String(text));
    } catch (e) { /* ignore */ }
};

const formatMessageTimestamp = (d: Date) => {
    const now = new Date();
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
    const daysDiff = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / (1000 * 60 * 60 * 24));
    const time = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

    if (daysDiff === 0) return time;
    if (daysDiff === 1) return `wczoraj o ${time}`;
    if (daysDiff > 1 && daysDiff < 7) {
        const weekday = new Intl.DateTimeFormat('pl-PL', { weekday: 'short' }).format(d);
        return `${weekday} o ${time}`;
    }
    const day = d.getDate();
    const monthShort = new Intl.DateTimeFormat('pl-PL', { month: 'short' }).format(d);
    if (d.getFullYear() === now.getFullYear()) return `${day} ${monthShort} o ${time}`;
    return `${day} ${monthShort} ${d.getFullYear()} o ${time}`;
};

const MessageBubble = ({ message, prevMessage, nextMessage, themeColors, admins, showAdminTag, onRetry, index, activeMessageId, activeMessageIndex, onToggleActive, showTimeSeparator, separatorLabel, listInverted }: { message: Message; prevMessage?: Message; nextMessage?: Message; themeColors: any; admins: { [key: string]: User }, showAdminTag?: boolean, onRetry?: (m: Message) => void, index: number, activeMessageId: string | null, activeMessageIndex: number | null, onToggleActive: (id: string | null, idx?: number) => void, showTimeSeparator?: boolean, separatorLabel?: string | null, listInverted?: boolean }) => {
    // TEMP PERF CHECK: log renders per bubble
    try { console.log('render bubble', message.id); } catch (e) { /* ignore */ }
    const { width: _mbWidth } = useWindowDimensions();
    const BUBBLE_MAX = Math.round((_mbWidth || 360) * 0.74);
    const isMyMessage = message.sender === 'admin';

    const PERF_DEBUG = !!(global as any).__PERF_DEBUG__ || false;
    const _mbRenderStart = useRef<number | null>(null);
    if (PERF_DEBUG) _mbRenderStart.current = Date.now();
    useEffect(() => {
        if (!PERF_DEBUG) return;
        const d = Date.now() - (_mbRenderStart.current || 0);
        if (d > 8) console.warn(`[perf][MessageBubble] ${message.id} render ${d}ms`);
    });

    if (message.sender === 'system') {
        const lowerCaseText = message.text.toLowerCase();
        const isContextMessage = lowerCaseText.includes('kontekst rozmowy z ai') || lowerCaseText.includes('koniec rozmowy z konsultantem ai');

            if (isContextMessage) {
            const cleanedText = message.text.replace(/^-+\s*|\s*-+$/g, '').trim();
            return (
                <Pressable onLongPress={() => { copyToClipboard(cleanedText); onToggleActive(message.id, index); }} style={{ width: '100%' }}>
                    <View style={styles.dividerContainer}>
                        <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
                        <Text selectable={false} style={[styles.dividerText, { color: themeColors.textMuted }]}>{cleanedText}</Text>
                        <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
                    </View>
                </Pressable>
            );
        }
        return (
            <Pressable onLongPress={() => { copyToClipboard(message.text); onToggleActive(message.id, index); }} style={{ width: '100%' }}>
                <View style={styles.systemMessageContainer}><Text selectable={false} style={[styles.systemMessageText, {color: '#FEFEFE'}]}>{message.text}</Text></View>
            </Pressable>
        );
    }

    const getMinutesDiff = (ts1?: Timestamp, ts2?: Timestamp) => {
        if (!ts1 || !ts2) return Infinity;
        return (ts1.toMillis() - ts2.toMillis()) / (1000 * 60);
    };
    
    const isFirstInGroup = !prevMessage || prevMessage.sender !== message.sender || (message.sender === 'admin' && prevMessage.adminId !== message.adminId) || getMinutesDiff(prevMessage.createdAt, message.createdAt) > GROUP_THRESHOLD_MINUTES;
    const isLastInGroup = !nextMessage || nextMessage.sender !== message.sender || (message.sender === 'admin' && nextMessage.adminId !== message.adminId) || getMinutesDiff(message.createdAt, nextMessage.createdAt) > GROUP_THRESHOLD_MINUTES;
    const isSolo = isFirstInGroup && isLastInGroup;

    const showAdminName = isMyMessage && message.adminId && (typeof showAdminTag === 'boolean' ? showAdminTag : (
        !prevMessage || prevMessage.sender !== 'admin' || prevMessage.adminId !== message.adminId
    ));

    const adminName = showAdminName ? (admins[message.adminId as string]?.displayName || admins[message.adminId as string]?.email) : null;

    const bubbleStyles: any[] = [styles.bubble, { maxWidth: BUBBLE_MAX }];
    const interSenderGapTop = prevMessage && prevMessage.sender !== message.sender ? 12 : 1;
    const bottomGap = nextMessage && nextMessage.sender === message.sender ? 1 : 8;
    const messageRowStyle = [
        styles.row,
        isMyMessage ? styles.right : styles.left,
        { marginTop: interSenderGapTop, marginBottom: bottomGap }
    ];

    const formattedTime = useMemo(() => {
        if (!message.createdAt?.toDate) return '';
        return formatMessageTimestamp(new Date(message.createdAt.toDate()));
    }, [message.createdAt]);

    const isActive = activeMessageId === message.id;

    // Parent owns the active-timer; child shows timestamp when `isActive`.

    if (isMyMessage) {
        bubbleStyles.push(styles.myMessageBubble, { backgroundColor: themeColors.tint });
        if (isSolo) bubbleStyles.push(styles.soloBubble);
        else if (isFirstInGroup) bubbleStyles.push(styles.myBubble_first);
        else if (isLastInGroup) bubbleStyles.push(styles.myBubble_last);
        else bubbleStyles.push(styles.myBubble_middle);
    } else {
        bubbleStyles.push(message.sender === 'ai' ? styles.aiMessageBubble : styles.theirMessageBubble);
        if (isSolo) bubbleStyles.push(styles.soloBubble);
        else if (isFirstInGroup) bubbleStyles.push(styles.theirBubble_first);
        else if (isLastInGroup) bubbleStyles.push(styles.theirBubble_last);
        else bubbleStyles.push(styles.theirBubble_middle);
    }

    bubbleStyles.push({ overflow: 'hidden', position: 'relative' });

    return (
        <>
            {!listInverted && showTimeSeparator && separatorLabel && (
                <View style={styles.timeSeparatorFullRow} pointerEvents="none">
                    <View style={[styles.timeSeparatorPill, { backgroundColor: themeColors.input }]}> 
                        <Text style={[styles.timeSeparatorText, { color: themeColors.textMuted }]}>{separatorLabel}</Text>
                    </View>
                </View>
            )}
            <View style={messageRowStyle}>
                {!isMyMessage && (
                        <View style={styles.avatarContainer}> 
                                {isLastInGroup ? (
                                    <View style={styles.adminAvatar}>
                                        <Ionicons name="person-circle-outline" size={34} color={themeColors.textMuted} />
                                    </View>
                                ) : (
                                    <View style={{ width: 54 }} />
                                )}
                            {isLastInGroup && <Text style={[styles.timestamp, { color: themeColors.textMuted, marginTop: 6 }]}>{formattedTime}</Text>}
                        </View>
                    )}

                    <View style={[styles.stack, isMyMessage ? styles.rightStack : styles.leftStack, isMyMessage ? styles.stackPadRight : styles.stackPadLeft]}>
                        <Pressable onPress={() => onToggleActive(message.id, index)} onLongPress={() => { copyToClipboard(message.text); onToggleActive(message.id, index); }} hitSlop={6} android_ripple={{ color: '#00000010', borderless: false }} style={bubbleStyles}>
                        <Text selectable={true} style={[styles.text, isMyMessage ? styles.myMessageText : [styles.theirMessageText, { color: themeColors.text }]]} numberOfLines={0} {...({ includeFontPadding: false } as any)}>
                            {message.text}
                        </Text>
                        {message.pending && (
                            <ActivityIndicator size="small" color={themeColors.tint} style={{ marginLeft: 8, marginTop: 6 }} />
                        )}
                        {message.failed && onRetry && (
                            <TouchableOpacity onPress={() => onRetry(message)} style={{ marginTop: 6 }}>
                                <Text style={{ color: themeColors.tint, fontSize: 13 }}>Retry</Text>
                            </TouchableOpacity>
                        )}
                    </Pressable>
                </View>

                {isMyMessage && (
                    <View style={styles.avatarContainer}><View style={{ width: 60 }} /></View>
                )}
            </View>
            {listInverted && showTimeSeparator && separatorLabel && (
                <View style={styles.timeSeparatorFullRow} pointerEvents="none">
                    <View style={[styles.timeSeparatorPill, { backgroundColor: themeColors.input }]}> 
                        <Text style={[styles.timeSeparatorText, { color: themeColors.textMuted }]}>{separatorLabel}</Text>
                    </View>
                </View>
            )}
        </>
    );
};

const MemoMessageBubble = React.memo(MessageBubble, (prevProps, nextProps) => {
    const pm = prevProps.message;
    const nm = nextProps.message;
    if (pm.id !== nm.id) return false;
    if (pm.text !== nm.text) return false;
    const pCreated = pm.createdAt?.toMillis?.() || null;
    const nCreated = nm.createdAt?.toMillis?.() || null;
    if (pCreated !== nCreated) return false;

    if ((pm.pending || false) !== (nm.pending || false)) return false;
    if ((pm.failed || false) !== (nm.failed || false)) return false;

    const prevPrevId = prevProps.prevMessage?.id || null;
    const nextPrevId = nextProps.prevMessage?.id || null;
    if (prevPrevId !== nextPrevId) return false;

    const prevNextId = prevProps.nextMessage?.id || null;
    const nextNextId = nextProps.nextMessage?.id || null;
    if (prevNextId !== nextNextId) return false;

    if ((prevProps.showAdminTag || false) !== (nextProps.showAdminTag || false)) return false;

    if ((prevProps.showTimeSeparator || false) !== (nextProps.showTimeSeparator || false)) return false;
    if ((prevProps.separatorLabel || null) !== (nextProps.separatorLabel || null)) return false;
    if ((prevProps.listInverted || false) !== (nextProps.listInverted || false)) return false;

    const prevAdminName = prevProps.admins?.[pm.adminId as string]?.displayName || prevProps.admins?.[pm.adminId as string]?.email || null;
    const nextAdminName = nextProps.admins?.[nm.adminId as string]?.displayName || nextProps.admins?.[nm.adminId as string]?.email || null;
    if (prevAdminName !== nextAdminName) return false;

    if (prevProps.activeMessageId !== nextProps.activeMessageId || prevProps.activeMessageIndex !== nextProps.activeMessageIndex) {
        const affected = [prevProps.activeMessageId, nextProps.activeMessageId].some(a => a === pm.id || a === nm.id);
        const indexAffected = typeof prevProps.activeMessageIndex === 'number' && (prevProps.activeMessageIndex === prevProps.index || nextProps.activeMessageIndex === prevProps.index);
        if (affected || indexAffected) return false;
    }

    return true;
});

const styles = StyleSheet.create({
    dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 15, paddingHorizontal: 20, },
    dividerLine: { flex: 1, height: 1, },
    dividerText: { marginHorizontal: 10, fontSize: 12, fontWeight: '500', },
    systemMessageContainer: { alignSelf: 'center', marginVertical: 10, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, backgroundColor: '#8A8A8D' },
    systemMessageText: { fontSize: 12, fontWeight: '500' },
    timeSeparatorFullRow: { width: '100%', alignItems: 'center', marginVertical: 8 },
    timeSeparatorPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
    timeSeparatorText: { fontSize: 12, color: '#777' },
    row: { width: '100%', flexDirection: 'row', position: 'relative' },
    left: { justifyContent: 'flex-start' },
    right: { justifyContent: 'flex-end' },
    avatarContainer: { width: 54, alignItems: 'center', justifyContent: 'center' },
    adminAvatar: { width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center' },
    timestamp: { fontSize: 12, color: '#999', marginBottom: 2 },
    stack: { flexDirection: 'column', alignItems: 'flex-start', maxWidth: '82%' },
    rightStack: { alignItems: 'flex-end' },
    leftStack: { alignItems: 'flex-start' },
    stackPadLeft: { paddingLeft: 2 },
    stackPadRight: { paddingRight: 2 },
    bubble: { paddingVertical: 6, paddingHorizontal: 13, borderRadius: 17, flexShrink: 1 },
    myMessageBubble: { marginLeft: 0, marginRight: 0 },
    theirMessageBubble: { backgroundColor: '#f3f4f8', marginLeft: 0, marginRight: 0 },
    aiMessageBubble: { backgroundColor: '#e8e8eb' },
    soloBubble: { borderRadius: 20 },
    myBubble_first: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 6 },
    myBubble_middle: { borderTopLeftRadius: 20, borderTopRightRadius: 6, borderBottomLeftRadius: 20, borderBottomRightRadius: 6 },
    myBubble_last: { borderTopLeftRadius: 20, borderTopRightRadius: 6, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
    theirBubble_first: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 6, borderBottomRightRadius: 20 },
    theirBubble_middle: { borderTopLeftRadius: 6, borderTopRightRadius: 20, borderBottomLeftRadius: 6, borderBottomRightRadius: 20 },
    theirBubble_last: { borderTopLeftRadius: 6, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
    myMessageText: { color: 'white', fontSize: 16, lineHeight: 24 },
    text: { fontSize: 16, lineHeight: 24, flexShrink: 1, flexWrap: 'wrap' },
    theirMessageText: { color: '#000' },
});

export default MemoMessageBubble;
