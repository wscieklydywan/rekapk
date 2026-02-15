
import { useFormContext } from '@/app/contexts/FormProvider';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import TabTransition from '@/components/TabTransition';
import { ANIM_FADE_DURATION, ANIM_TRANSLATE_DURATION } from '@/constants/animations';
import { Colors } from '@/constants/theme';
import { useDarkBars } from '@/hooks/useSystemBars';
import { useTapHighlight } from '@/hooks/useTapHighlight';
import { ContactForm } from '@/schemas';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { db } from '@/lib/firebase';
import { deleteCollectionInBatches } from '@/lib/firestore-utils';
import { collection, deleteDoc, doc } from 'firebase/firestore';

const categoryTranslations: { [key: string]: string } = {
    'websites': 'Strony Internetowe',
    'seo': 'SEO i pozycjonowanie',
    'social_media': 'Social Media',
    'branding': 'Branding i identyfikacja',
    'analytics': 'Analityka i raporty',
    'other': 'Inne',
};

const getTranslatedSubject = (category?: string, service?: string): string => {
    const key = category || service;
    if (key && categoryTranslations[key]) {
        return categoryTranslations[key];
    }
    if (typeof key === 'string' && key.length > 0) {
        return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
    }
    return 'Formularz ogólny';
};

const AVATAR_COLORS = ['#c56b66', '#8c7aa8', '#5f9ac9', '#4caaa0', '#83a869', '#e59f49', '#7c635a', '#b0b86c', '#d15f8a', '#4baadd'];
const generateColor = (str: string) => {
    if (!str) return AVATAR_COLORS[0];
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

// Lighten a hex color by moving it towards white by `amount` (0..1).
const lightenHex = (hex: string, amount = 0.6) => {
    try {
        if (!hex || hex[0] !== '#') return hex;
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0,2), 16);
        const g = parseInt(h.substring(2,4), 16);
        const b = parseInt(h.substring(4,6), 16);
        const nr = Math.round(r + (255 - r) * amount);
        const ng = Math.round(g + (255 - g) * amount);
        const nb = Math.round(b + (255 - b) * amount);
        const toHex = (v: number) => v.toString(16).padStart(2, '0');
        return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
    } catch (e) { return hex; }
};

const Avatar = ({ contactName }: { contactName: string }) => {
    const initial = contactName ? contactName.charAt(0).toUpperCase() : '?';
    const bgColor = generateColor(contactName || '');
    return (
        <View style={[styles.avatar, { backgroundColor: bgColor }]}>
            <Text style={styles.avatarText}>{initial}</Text>
        </View>
    );
};

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList) as unknown as typeof FlatList;

const FormListItem = ({ item, themeColors, selectionMode, isSelected, onSelect, onDeselect, isFirst, isLast }: { item: ContactForm, themeColors: any, selectionMode: boolean, isSelected: boolean, onSelect: (id: string) => void, onDeselect: (id: string) => void, isFirst?: boolean, isLast?: boolean }) => {
    const router = useRouter();
    const isUnread = item.adminUnread > 0;

    const { isPressed, handlePress } = useTapHighlight(() => {
        if (selectionMode) {
            isSelected ? onDeselect(item.id) : onSelect(item.id);
            return;
        }
        router.push({
            pathname: `/forms/${item.id}`,
            params: { contactName: item.userInfo.contact || 'Formularz' }
        } as any);
    });

    const handleLongPress = () => {
        if (!selectionMode) {
            onSelect(item.id);
        }
    };

    const formattedDate = React.useMemo(() => {
        if (!item.createdAt?.toDate) return '';
        const d = new Date(item.createdAt.toDate());
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
    }, [item.createdAt]);
    
    const animatedContentStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: withTiming(selectionMode ? 40 : 0, { duration: ANIM_TRANSLATE_DURATION, easing: Easing.inOut(Easing.ease) }) }],
        };
    });

    return (
        <Pressable onPress={handlePress} onLongPress={handleLongPress} android_ripple={{ color: 'rgba(0,0,0,0.04)', borderless: false }} style={[styles.itemContainer, (isSelected || isPressed) && { backgroundColor: themeColors.selection }]}>
             {selectionMode && (
                <Animated.View entering={FadeIn.duration(ANIM_FADE_DURATION)} exiting={FadeOut.duration(ANIM_FADE_DURATION)} style={styles.checkboxContainer}>
                    <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={isSelected ? themeColors.tint : themeColors.textMuted}/>
                </Animated.View>
            )}
            <Animated.View style={[styles.slidingContainer, animatedContentStyle]}>
                <Avatar contactName={item.userInfo.contact || 'Anonim'} />
                <View style={styles.textContainer}>
                    <View style={styles.lineOne}>
                        <Text style={[styles.contactName, { color: themeColors.text, fontWeight: isUnread ? 'bold' : 'normal' }]} numberOfLines={1}>
                            {item.userInfo.contact || 'Brak kontaktu'}
                        </Text>
                        <Text style={[styles.timestamp, { color: isUnread ? themeColors.tint : themeColors.textMuted }]}>{formattedDate}</Text>
                    </View>
                    <View style={styles.lineTwo}>
                        <Text style={[styles.subject, { color: themeColors.text, fontWeight: isUnread ? '600' : 'normal' }]} numberOfLines={1}>
                            {getTranslatedSubject((item as any).category, (item as any).service)} 
                        </Text>
                        {isUnread && <View style={[styles.unreadDot, { backgroundColor: themeColors.tint }]} />}
                    </View>
                </View>
            </Animated.View>
        </Pressable>
    );
};

const FormListItemMemo = React.memo(FormListItem, (prev, next) => {
    const sameId = prev.item.id === next.item.id;
    const sameSelected = prev.isSelected === next.isSelected;
    const sameSelectionMode = prev.selectionMode === next.selectionMode;
    const sameIsFirst = prev.isFirst === next.isFirst;
    const sameIsLast = prev.isLast === next.isLast;
    const sameName = (prev.item.userInfo?.contact || null) === (next.item.userInfo?.contact || null);
    const sameUnread = (prev.item.adminUnread || 0) === (next.item.adminUnread || 0);
    
    if (!sameId || !sameSelected || !sameSelectionMode || !sameIsFirst || !sameIsLast || !sameName || !sameUnread) return false;
    return true;
});

const FormsListScreen = () => {
    const theme = useColorScheme() ?? 'light';
    const themeColors = { ...Colors[theme], selection: theme === 'light' ? '#E8F0FE' : '#2A2A3D', danger: '#FF3B30' };
    const subtleBorder = lightenHex(themeColors.border, 0.80);
    useDarkBars('#2b2f33');
    const insets = useSafeAreaInsets();
    const headerBase = 110;
    const headerHeight = headerBase + insets.top;
    const { forms, loading, setForms } = useFormContext();
    const navigation = useNavigation();

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [canScroll, setCanScroll] = useState(false);
    const [modalConfig, setModalConfig] = useState<any>(null);
    const modalLockRef = useRef(false);
    const modalTimerRef = useRef<number | null>(null);
    const containerHeightRef = useRef<number>(0);
    const contentHeightRef = useRef<number>(0);
    const jellyY = useSharedValue(0);
    const canScrollSV = useSharedValue(false);
    const JELLY_MULT = 6;

    const jellyStyle = useAnimatedStyle(() => ({ transform: [{ translateY: jellyY.value }] }));

    const makeGestureForList = useCallback(() => {
        const isScrollable = contentHeightRef.current > containerHeightRef.current;
        if (isScrollable) return Gesture.Tap();

        return Gesture.Pan()
            .activeOffsetY([-5, 5])
            .failOffsetX([-10, 10])
            .onUpdate((e) => {
                if (canScrollSV.value) return;
                const damped = Math.tanh(e.translationY / 90) * JELLY_MULT;
                jellyY.value = damped;
            })
            .onEnd(() => {
                try { cancelAnimation(jellyY); } catch (e) {}
                jellyY.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.cubic) });
            });
    }, []);
    const closeModal = () => {
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
            try {
                const doBlur = () => {
                    try { (document.activeElement as any)?.blur?.(); } catch (e) { /* ignore */ }
                    try {
                        const body = document.body as HTMLElement | null;
                        if (body) {
                            const prevTab = body.getAttribute('tabindex');
                            body.setAttribute('tabindex', '-1');
                            try { body.focus(); } catch (e) { /* ignore */ }
                            if (prevTab === null) body.removeAttribute('tabindex');
                            else body.setAttribute('tabindex', prevTab);
                        }
                    } catch (e) { /* ignore */ }
                };
                doBlur();
                setTimeout(doBlur, 10);
                setTimeout(doBlur, 60);
                setTimeout(doBlur, 120);
            } catch (e) { /* ignore */ }
        }

        // clear any scheduled modal shows
        if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }

        setModalConfig(null);
        modalLockRef.current = true;
        try { if (typeof window !== 'undefined') { (window as any).__modalIsClosing = true; (window as any).__modalSuppressedUntil = Date.now() + 280; } } catch(e) {}
        setTimeout(() => { try { if (typeof window !== 'undefined') (window as any).__modalIsClosing = false; } catch(e) {} modalLockRef.current = false; }, 260);
    };

    const showModal = (config: { title: string; message?: string; confirmText?: string; onConfirm?: () => void; cancelText?: string; variant?: 'destructive' | 'secondary' }) => {
        try {
            if (typeof window !== 'undefined' && (window as any).__modalIsClosing) {
                const until = (window as any).__modalSuppressedUntil || 0;
                const now = Date.now();
                const delay = Math.max(until - now + 60, 420);
                if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }
                modalTimerRef.current = window.setTimeout(() => {
                    if (modalLockRef.current) {
                        modalTimerRef.current = window.setTimeout(() => {
                            const normalized = { title: config.title ?? '', message: config.message ?? '', confirmText: config.confirmText ?? 'OK', cancelText: config.cancelText, onConfirm: config.onConfirm, variant: config.variant } as any;
                            setModalConfig(normalized);
                            modalTimerRef.current = null;
                        }, 420);
                    } else {
                        const normalized = { title: config.title ?? '', message: config.message ?? '', confirmText: config.confirmText ?? 'OK', cancelText: config.cancelText, onConfirm: config.onConfirm, variant: config.variant } as any;
                        setModalConfig(normalized);
                        modalTimerRef.current = null;
                    }
                }, delay);
                return;
            }
            if (typeof window !== 'undefined') {
                const until = (window as any).__modalSuppressedUntil || 0;
                const now = Date.now();
                if (now < until) {
                    const delay = until - now + 40;
                    if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }
                    modalTimerRef.current = window.setTimeout(() => {
                        const safe = (v?: string) => (typeof v === 'string' && v.trim().length > 0 ? v : undefined);
                        const hadEmptyString = (config && ((config.title === '') || (config.message === '') || (config.confirmText === '')));
                        if ((global as any).__DEV__ && hadEmptyString) {
                            console.warn('showModal called with empty-string fields — normalizing to avoid blank modal', { original: config });
                            console.warn(new Error().stack);
                        }
                        const normalized = { title: safe(config?.title), message: safe(config?.message), confirmText: safe(config?.confirmText) ?? 'OK', cancelText: safe(config?.cancelText), onConfirm: config?.onConfirm, variant: config?.variant } as any;
                        if (modalLockRef.current) {
                            modalTimerRef.current = window.setTimeout(() => { setModalConfig(normalized); modalTimerRef.current = null; }, 420);
                        } else {
                            setModalConfig(normalized);
                            modalTimerRef.current = null;
                        }
                    }, delay);
                    return;
                }
            }
        } catch(e) {}

        if (modalLockRef.current) {
            if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }
            modalTimerRef.current = window.setTimeout(() => {
                const safe = (v?: string) => (typeof v === 'string' && v.trim().length > 0 ? v : undefined);
                const hadEmptyString = (config && ((config.title === '') || (config.message === '') || (config.confirmText === '')));
                if ((global as any).__DEV__ && hadEmptyString) {
                    console.warn('showModal called with empty-string fields — normalizing to avoid blank modal', { original: config });
                    console.warn(new Error().stack);
                }
                const normalized = { title: safe(config?.title), message: safe(config?.message), confirmText: safe(config?.confirmText) ?? 'OK', cancelText: safe(config?.cancelText), onConfirm: config?.onConfirm, variant: config?.variant } as any;
                setModalConfig(normalized);
                modalTimerRef.current = null;
            }, 420);
        } else {
            const safe = (v?: string) => (typeof v === 'string' && v.trim().length > 0 ? v : undefined);
            const hadEmptyString = (config && ((config.title === '') || (config.message === '') || (config.confirmText === '')));
            if ((global as any).__DEV__ && hadEmptyString) {
                console.warn('showModal called with empty-string fields — normalizing to avoid blank modal', { original: config });
                console.warn(new Error().stack);
            }
            const normalized = { title: safe(config?.title), message: safe(config?.message), confirmText: safe(config?.confirmText) ?? 'OK', cancelText: safe(config?.cancelText), onConfirm: config?.onConfirm, variant: config?.variant } as any;
            setModalConfig(normalized);
        }
    }; 

    useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

    const sortedForms = useMemo(() => {
        return [...forms].sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
    }, [forms]);

    const enterSelectionMode = () => setSelectionMode(true);
    const exitSelectionMode = () => { setSelectionMode(false); setSelectedItems([]); };

    const handleSelect = (id: string) => {
        if (!selectionMode) enterSelectionMode();
        setSelectedItems(prev => [...prev, id]);
    };

    const handleDeselect = (id: string) => {
        setSelectedItems(prev => {
            const newSelection = prev.filter(i => i !== id);
            if (newSelection.length === 0) exitSelectionMode();
            return newSelection;
        });
    };

    const handleDeleteSelected = async () => {
        const performDelete = async () => {
            const itemsToDelete = [...selectedItems];
            closeModal();
            exitSelectionMode();
            
            // optimistic remove
            const prev = forms;
            setForms(prevForms => prevForms.filter(form => !itemsToDelete.includes(form.id)));

            try {
                for (const formId of itemsToDelete) {
                    await deleteCollectionInBatches(db, collection(db, 'contact_forms', formId, 'messages'));
                    await deleteDoc(doc(db, 'contact_forms', formId));
                }
            } catch (error) {
                console.error("Błąd podczas usuwania formularzy i ich wiadomości:", error);
                // rollback UI
                try { setForms(prev); } catch (e) { /* ignore */ }
            }
        };
        
        showModal({
            title: selectedItems.length > 1 ? `Usuń formularze (${selectedItems.length})` : 'Usuń formularz',
            message: 'Czy na pewno chcesz trwale usunąć zaznaczone formularze i wszystkie ich wiadomości? Tej operacji nie można cofnąć.',
            confirmText: 'Usuń',
            cancelText: 'Anuluj',
            onConfirm: performDelete,
            variant: 'destructive'
        });
    };

    const headerOpacityAnim = useSharedValue(selectionMode ? 1 : 0);
    useEffect(() => { headerOpacityAnim.value = withTiming(selectionMode ? 1 : 0, { duration: ANIM_FADE_DURATION }); }, [selectionMode]);
    const defaultHeaderStyle = useAnimatedStyle(() => ({ opacity: 1 - headerOpacityAnim.value }));
    const selectionHeaderStyle = useAnimatedStyle(() => ({ opacity: headerOpacityAnim.value }));

    return (
        <TabTransition tabIndex={1} quick={true} style={{ flex: 1, backgroundColor: themeColors.background }}>
            {modalConfig?.title && modalConfig?.confirmText && (
              <ConfirmationModal
                visible={true}
                onClose={closeModal}
                title={modalConfig.title}
                message={modalConfig.message || ''}
                confirmText={modalConfig.confirmText}
                cancelText={modalConfig.cancelText}
                variant={modalConfig.variant}
                onConfirm={() => {
                    const onConfirmAction = modalConfig?.onConfirm;
                    closeModal();
                    if (onConfirmAction) {
                        setTimeout(() => { try { onConfirmAction(); } catch (e) { console.error(e); } }, 160);
                    }
                }}
              />
            )}
            {/* status bar handled via focus hook */}
            <View style={[styles.headerSlot, { height: headerHeight, backgroundColor: '#2b2f33', borderBottomColor: 'transparent' }]}> 
                <Animated.View style={[styles.headerLayer, { zIndex: 6 }, defaultHeaderStyle]} pointerEvents={!selectionMode ? 'auto' : 'none'}>
                    <View style={[styles.headerContent, { paddingTop: 6 + insets.top, paddingBottom: 6, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}> 
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.headerTitle, { color: '#ffffff' }]}>Formularze</Text>
                        </View>
                        <View style={{ marginLeft: 12 }}>
                            {/* no subtitle for this tab */}
                        </View>
                    </View>
                </Animated.View>
                <Animated.View style={[styles.headerLayer, { zIndex: 6 }, selectionHeaderStyle]} pointerEvents={selectionMode ? 'auto' : 'none'}>
                    <View style={[styles.headerContent, { justifyContent: 'space-between', paddingTop: 0, paddingBottom: 6, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }]}> 
                        <Pressable onPress={exitSelectionMode} style={{ padding: 8, marginTop: -36 }}>
                            <Ionicons name="arrow-back" size={24} color={'#ffffff'} />
                        </Pressable>
                        <Text style={[styles.selectionTitle, { color: '#ffffff', textAlign: 'center', marginTop: -36 }]}>{`Zaznaczono: ${selectedItems.length}`}</Text>
                        <Pressable onPress={handleDeleteSelected} disabled={selectedItems.length === 0} style={{ padding: 8, marginTop: -36 }}>
                            <Ionicons name="trash-outline" size={24} color={selectedItems.length > 0 ? themeColors.danger : 'rgba(255,255,255,0.7)'} />
                        </Pressable>
                    </View>
                </Animated.View>
            </View>

            {loading && forms.length === 0 ? (
                <ActivityIndicator style={{ flex: 1 }} size="large" color={themeColors.tint} />
            ) : (
                <View style={{ flex: 1 }} onLayout={(e) => { containerHeightRef.current = e.nativeEvent.layout.height; const cs = contentHeightRef.current > containerHeightRef.current; canScrollSV.value = cs; setCanScroll(cs); }}>
                    {/* darker card background in light theme, tiles inside */}
                    <View style={[styles.contentCard, { backgroundColor: theme === 'light' ? '#f3f4f6' : themeColors.card, marginTop: -48, paddingTop: 0, zIndex: 1 }]}> 
                        <View style={[styles.contentCardInner, { backgroundColor: 'transparent' }]}> 
                               <View style={{ paddingHorizontal: 10, paddingTop: 0 }}>
                            {/* header moved into ListHeaderComponent so it scrolls with the list */}
                        </View>
                               </View>
                        { /* Render AnimatedFlatList directly when scrollable, otherwise wrap in GestureDetector */ }
                        { (contentHeightRef.current > containerHeightRef.current) ? (
                                    <AnimatedFlatList
                                        data={sortedForms}
                                        keyExtractor={(item) => item.id}
                                        renderItem={({ item, index }) => {
                                            const isSelected = selectedItems.includes(item.id);
                                            const isFirst = index === 0;
                                            const isLast = index === sortedForms.length - 1;
                                            return (
                                                <View style={{ paddingHorizontal: 8 }}>
                                                    <View style={{ backgroundColor: '#fff', borderRadius: 6, borderTopLeftRadius: isFirst ? 20 : 6, borderTopRightRadius: isFirst ? 20 : 6, borderBottomLeftRadius: isLast ? 20 : 6, borderBottomRightRadius: isLast ? 20 : 6, marginTop: 1, marginBottom: 1, overflow: 'hidden' }}>
                                                        <FormListItemMemo
                                                            item={item}
                                                            themeColors={themeColors}
                                                            selectionMode={selectionMode}
                                                            isSelected={isSelected}
                                                            isFirst={isFirst}
                                                            isLast={isLast}
                                                            onSelect={handleSelect}
                                                            onDeselect={handleDeselect}
                                                        />
                                                    </View>
                                                </View>
                                            );
                                        }}
                                        ListHeaderComponent={() => (
                                            <View style={{ paddingLeft: 17, paddingRight: 8, paddingTop: 6 }}>
                                                <Text style={{ color: themeColors.textMuted, fontSize: 15, fontWeight: '600', marginBottom: 6 }}>Odebrane</Text>
                                            </View>
                                        )}
                                        ListEmptyComponent={
                                            <View style={styles.emptyContainer}>
                                                <Ionicons name="mail-outline" size={50} color={themeColors.textMuted} />
                                                <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>Twoja skrzynka jest pusta</Text>
                                            </View>
                                        }
                                        contentContainerStyle={[styles.listContainer, { backgroundColor: 'transparent', paddingTop: 0 }]}
                                        extraData={{ selectionMode, selectedItems }}
                                        scrollEnabled={true}
                                        onContentSizeChange={(_, h) => { contentHeightRef.current = h; const cs = contentHeightRef.current > containerHeightRef.current; canScrollSV.value = cs; setCanScroll(cs); }}
                                    />
                                ) : (
                            <GestureDetector gesture={makeGestureForList()}>
                                    <Animated.View style={[{ flex: 1 }, jellyStyle]}>
                                    <AnimatedFlatList
                                        data={sortedForms}
                                        keyExtractor={(item) => item.id}
                                        renderItem={({ item, index }) => {
                                            const isSelected = selectedItems.includes(item.id);
                                            const isFirst = index === 0;
                                            const isLast = index === sortedForms.length - 1;
                                            return (
                                                <View style={{ paddingHorizontal: 8 }}>
                                                    <View style={{ backgroundColor: '#fff', borderRadius: isFirst || isLast ? 20 : 6, marginTop: 1, marginBottom: 1, overflow: 'hidden' }}>
                                                        <FormListItemMemo
                                                            item={item}
                                                            themeColors={themeColors}
                                                            selectionMode={selectionMode}
                                                            isSelected={isSelected}
                                                            isFirst={isFirst}
                                                            isLast={isLast}
                                                            onSelect={handleSelect}
                                                            onDeselect={handleDeselect}
                                                        />
                                                    </View>
                                                </View>
                                            );
                                        }}
                                        ListHeaderComponent={() => (
                                            <View style={{ paddingLeft: 18, paddingRight: 8, paddingTop: 6 }}>
                                                <Text style={{ color: themeColors.textMuted, fontSize: 15, fontWeight: '600', marginBottom: 6 }}>Odebrane</Text>
                                            </View>
                                        )}
                                        ListEmptyComponent={
                                            <View style={styles.emptyContainer}>
                                                <Ionicons name="mail-outline" size={50} color={themeColors.textMuted} />
                                                <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>Twoja skrzynka jest pusta</Text>
                                            </View>
                                        }
                                        contentContainerStyle={[styles.listContainer, { backgroundColor: 'transparent', paddingTop: 0 }]}
                                        extraData={{ selectionMode, selectedItems }}
                                        scrollEnabled={false}
                                        onContentSizeChange={(_, h) => { contentHeightRef.current = h; const cs = contentHeightRef.current > containerHeightRef.current; canScrollSV.value = cs; setCanScroll(cs); }}
                                    />
                                </Animated.View>
                            </GestureDetector>
                        )}
                    </View>
                </View>
            )}

        </TabTransition>
    );
};

const styles = StyleSheet.create({
    headerSlot: { height: 110 },
    headerLayer: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%', zIndex: 10 },
    headerContent: { paddingTop: 6, paddingBottom: 8, paddingHorizontal: 20, flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', height: '100%' },
    headerTitle: { fontSize: 24, fontWeight: 'bold', marginTop: -40 },
    selectionTitle: { fontSize: 18, fontWeight: 'bold' },
    contentCard: { flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', marginTop: -18, paddingTop: 18 },
    contentCardInner: { flex: 1, padding: 6, paddingTop: 0, paddingBottom: 0 },
    listContainer: { paddingBottom: 20 },
    itemContainer: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
    checkboxContainer: { position: 'absolute', left: 15, top: 12, bottom: 12, justifyContent: 'center' },
    slidingContainer: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    avatarText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
    textContainer: { flex: 1, justifyContent: 'center' },
    lineOne: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
    contactName: { fontSize: 16 },
    timestamp: { fontSize: 13, marginLeft: 8 },
    lineTwo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    subject: { fontSize: 14, flexShrink: 1, marginRight: 10 },
    unreadDot: { width: 9, height: 9, borderRadius: 5, marginLeft: 5 },
    separator: { height: 1, marginLeft: 68 }, 
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 150 },
    emptyText: { marginTop: 16, fontSize: 16 },
});

export default FormsListScreen;
