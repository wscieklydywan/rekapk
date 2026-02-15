
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { Colors } from '@/constants/theme';
import { useLightBars } from '@/hooks/useSystemBars';
import { db } from '@/lib/firebase';
import { deleteCollectionInBatches } from '@/lib/firestore-utils';
import toast from '@/lib/toastController';
import { ContactForm, FormMessage } from '@/schemas';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// animation timings chosen to match Conversation smooth feel
const FORM_FADE_IN_DUR = 100;
const FORM_FADE_OUT_DUR = 90;
const FORM_SLIDE_IN_DUR = 110;
const FORM_SLIDE_OUT_DUR = 90;

import { useFormContext } from '@/app/contexts/FormProvider';

const AVATAR_COLORS = ['#c56b66', '#8c7aa8', '#5f9ac9', '#4caaa0', '#83a869', '#e59f49', '#7c635a', '#b0b86c', '#d15f8a', '#4baadd'];
const generateColor = (str: string) => {
    if (!str) return AVATAR_COLORS[0];
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const Avatar = ({ name, size = 38 }: { name: string; size?: number }) => {
    const initial = name ? name.charAt(0).toUpperCase() : '?';
    const bgColor = generateColor(name || '');
    return (
        <View style={[styles.avatar, { backgroundColor: bgColor, width: size, height: size, borderRadius: size / 2 }]}>
            <Text style={[styles.avatarText, { fontSize: size / 2.2 }]}>{initial}</Text>
        </View>
    );
};

const categoryTranslations: { [key: string]: string } = { websites: 'Strony internetowe', seo: 'SEO i pozycjonowanie', social_media: 'Social Media', branding: 'Branding', analytics: 'Analityka', other: 'Inne' };
const getCategoryDisplayName = (category: string) => categoryTranslations[category] || category || 'Ogólna';

const FormDetailScreen = () => {
    const router = useRouter();
    const navigation = useNavigation();
    const { id: formId, contactName: encodedContactName } = useLocalSearchParams<{ id: string, contactName?: string }>();
    const theme = useColorScheme() ?? 'light';
    const themeColors = { ...Colors[theme], danger: '#FF3B30' };
    const { totalUnreadCount } = useFormContext();
    useLightBars();
    const insets = useSafeAreaInsets();
    const headerBase = 64;
    const headerHeight = headerBase + insets.top;

    const [form, setForm] = useState<ContactForm | null>(null);
    const [messages, setMessages] = useState<FormMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [showBackButtonBadge, setShowBackButtonBadge] = useState(false);
    const isDeleting = useRef(false);

    const contactName = encodedContactName ? decodeURIComponent(encodedContactName) : 'Formularz';
    const headerTitle = form?.userInfo.contact || contactName;

    useEffect(() => {
        if (form) {
            const unreadInThisForm = form.adminUnread || 0;
            setShowBackButtonBadge(totalUnreadCount > 0 && (totalUnreadCount - unreadInThisForm > 0));
        }
    }, [totalUnreadCount, form]);

    useEffect(() => {
        navigation.setOptions({ headerShown: false });

        if (!formId) return;
        
        const formRef = doc(db, 'contact_forms', formId);
        const unsubForm = onSnapshot(formRef, async (docSnapshot) => {
            if (docSnapshot.exists()) {
                const formData = { id: docSnapshot.id, ...docSnapshot.data() } as ContactForm;
                setForm(formData);
                if (formData.adminUnread > 0) {
                    await updateDoc(formRef, { adminUnread: 0 });
                }
            } else {
                if (!isDeleting.current && router.canGoBack()) {
                    router.back();
                }
            }
        });

        const messagesQuery = query(collection(db, 'contact_forms', formId, 'messages'), orderBy('createdAt', 'asc'));
        const unsubMessages = onSnapshot(messagesQuery, (snapshot) => {
            setMessages(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FormMessage)));
            setLoading(false);
        });

        return () => { unsubForm(); unsubMessages(); };
    }, [formId, navigation]);

    const [modalVisible, setModalVisible] = useState(false);

    const requestDelete = () => setModalVisible(true);

    const handleDelete = async () => {
        if (!formId) return;
        isDeleting.current = true;


        if (router.canGoBack()) {
            router.back();
        }
        
        try {
            await deleteCollectionInBatches(db, collection(db, 'contact_forms', formId, 'messages'));
            await deleteDoc(doc(db, 'contact_forms', formId));
            try { setTimeout(() => { toast.show({ text: 'Formularz usunięty', variant: 'info' }); }, 220); } catch (e) { /* ignore */ }
        } catch (error) {
            console.error("Błąd podczas usuwania formularza i jego wiadomości: ", error);
            isDeleting.current = false;
            try { setTimeout(() => { toast.show({ text: 'Błąd: nie udało się usunąć formularza', variant: 'error', duration: 2500 }); }, 50); } catch (e) { /* ignore */ }
        }
    };

    const closeFormModal = () => setModalVisible(false);

    const formattedDate = form?.createdAt?.toDate ? new Date(form.createdAt.toDate()).toLocaleString('pl-PL', { day: 'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';

    return (
        <Animated.View entering={FadeIn.duration(FORM_FADE_IN_DUR).easing(Easing.out(Easing.cubic))} exiting={FadeOut.duration(FORM_FADE_OUT_DUR).easing(Easing.in(Easing.cubic))} style={{ flex: 1 }}>
            <Animated.View entering={SlideInRight.duration(FORM_SLIDE_IN_DUR).easing(Easing.out(Easing.cubic))} exiting={SlideOutRight.duration(FORM_SLIDE_OUT_DUR).easing(Easing.in(Easing.cubic))} style={{ flex: 1 }}>
                <View style={[styles.container, { backgroundColor: themeColors.background }]}>
            <View style={[styles.header, { height: headerHeight, paddingTop: 12 + insets.top, backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
                    <Ionicons name="arrow-back" size={24} color={themeColors.text} />
                     {showBackButtonBadge && (
                        <View style={[styles.backButtonBadge, { backgroundColor: themeColors.danger, borderColor: themeColors.background }]} />
                    )}
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={[styles.headerTitle, { color: themeColors.text }]} numberOfLines={1}>{headerTitle}</Text>
                    <Text style={[styles.headerSubtitle, { color: themeColors.textMuted }]}>Formularz</Text>
                </View>
                <TouchableOpacity onPress={requestDelete} style={styles.headerIcon}>
                    <Ionicons name="trash-outline" size={22} color={themeColors.danger} />
                </TouchableOpacity>
            </View>

            {loading || !form ? (
                <ActivityIndicator size="large" color={themeColors.tint} style={{flex: 1}} />
            ) : (
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <Text style={[styles.mainTitle, { color: themeColors.text }]}>{getCategoryDisplayName(form.category || form.service || '')}</Text>
                    <View style={[styles.senderInfo, { borderBottomColor: themeColors.border }]}>
                        <Avatar name={form.userInfo.contact || 'A'} />
                        <View style={styles.senderTextContainer}>
                            <Text style={[styles.senderName, { color: themeColors.text }]}>{form.userInfo.contact || 'Brak nazwy'}</Text>
                            <Text style={[styles.senderDate, { color: themeColors.textMuted }]}>{formattedDate}</Text>
                        </View>
                    </View>
                    {(form.userInfo.email || form.userInfo.phone || form.userInfo.company) && (
                        <View style={styles.contactSection}>
                            <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Dane kontaktowe</Text>
                            <View style={[styles.contactCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                                {form.userInfo.email && <InfoRow icon="mail-outline" value={form.userInfo.email} onValuePress={() => Linking.openURL(`mailto:${form.userInfo.email}`)} themeColors={themeColors} isFirst />}
                                {form.userInfo.phone && <InfoRow icon="call-outline" value={form.userInfo.phone} onValuePress={() => Linking.openURL(`tel:${form.userInfo.phone}`)} themeColors={themeColors} isFirst={!form.userInfo.email} />}
                                {form.userInfo.company && <InfoRow icon="business-outline" value={form.userInfo.company} themeColors={themeColors} isFirst={!form.userInfo.email && !form.userInfo.phone} />}
                            </View>
                        </View>
                    )}
                    <View style={styles.messageBody}>
                        <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Wiadomość</Text>
                        {messages.map((msg) => <Text key={msg.id} style={[styles.messageText, { color: themeColors.text }]}>{msg.text}</Text>)}
                    </View>
                </ScrollView>
            )}

            {modalVisible && (
                <ConfirmationModal
                    visible={true}
                    onClose={closeFormModal}
                    title={'Usuń formularz'}
                    message={'Czy na pewno chcesz trwale usunąć ten formularz i wszystkie jego wiadomości?'}
                    confirmText={'Usuń'}
                    cancelText={'Anuluj'}
                    variant={'destructive'}
                    onConfirm={() => {
                        closeFormModal();
                        setTimeout(() => { handleDelete(); }, 160);
                    }}
                />
            )}


                </View>
            </Animated.View>
        </Animated.View>
    );
};

const InfoRow = ({ icon, value, onValuePress, themeColors, isFirst = false }: any) => (
    <TouchableOpacity onPress={onValuePress} disabled={!onValuePress} style={[styles.infoRow, { borderTopWidth: isFirst ? 0 : 1, borderTopColor: themeColors.border }]}>
        <Ionicons name={icon} size={18} color={themeColors.textMuted} style={styles.infoIcon} />
        <Text style={[styles.infoValue, { color: onValuePress ? themeColors.tint : themeColors.text }]} numberOfLines={1}>{value}</Text>
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { 
        paddingTop: Platform.OS === 'android' ? 25 : 45, 
        paddingBottom: 10, 
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingHorizontal: 10, 
        borderBottomWidth: 1,
    },
    headerIcon: { 
        padding: 5, 
        position: 'relative' 
    },
    backButtonBadge: {
        position: 'absolute',
        top: 3,
        right: 3,
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 1.5,
    },
    headerTitleContainer: { 
        flex: 1, 
        marginLeft: 15, 
        alignItems: 'flex-start' 
    },
    headerTitle: { 
        fontSize: 17, 
        fontWeight: '600' 
    },
    headerSubtitle: { 
        fontSize: 13, 
        opacity: 0.8 
    },
    scrollContent: { paddingTop: 20, paddingBottom: 30, paddingHorizontal: 16 },
    mainTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
    senderInfo: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, marginBottom: 12 },
    avatar: { justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    avatarText: { color: 'white', fontWeight: 'bold' },
    senderTextContainer: { flex: 1 },
    senderName: { fontSize: 15, fontWeight: '600' },
    senderDate: { fontSize: 12, marginTop: 2 },
    sectionTitle: { fontSize: 13, fontWeight: '500', marginBottom: 8, textTransform: 'uppercase' },
    contactSection: { marginBottom: 20 },
    messageBody: { marginTop: 8 },
    messageText: { fontSize: 16, lineHeight: 24 },
    contactCard: { borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
    infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10 },
    infoIcon: { marginRight: 10, width: 18 },
    infoValue: { fontSize: 14, flexShrink: 1 },
});

export default FormDetailScreen;
