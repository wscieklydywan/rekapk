import { Colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

interface ConfirmationModalProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText: string;
    cancelText?: string;
    variant?: 'destructive' | 'secondary';
    // allow callers to request the top warning icon even for non-destructive variants
    showIcon?: boolean;
}

export const ConfirmationModal = ({
    visible,
    onClose,
    onConfirm,
    title,
    message,
    confirmText,
    cancelText,
    variant,
    showIcon,
}: ConfirmationModalProps) => {
    const theme = useColorScheme() ?? 'light';
    const themeColors = Colors[theme];

    const [NativeBlur, setNativeBlur] = useState<any | null>(null);

    const scale = useSharedValue(0.95);
    const opacity = useSharedValue(0);
    const backdropOpacity = useSharedValue(0);

    const [mounted, setMounted] = useState(visible);

    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout> | undefined;

        // Try to dynamically require expo-blur on native platforms (optional)
        try {
            if (Platform.OS !== 'web') {
                // require inside try to avoid bundler errors if dependency missing at runtime
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const mod = require('expo-blur');
                if (mod && mod.BlurView) setNativeBlur(() => mod.BlurView);
            }
        } catch (e) {
            // ignore — fallback will be used
        }

        if (visible) {
            // Make content fully opaque immediately to avoid transient blending
            // during the first render frame (this was causing the "cancel"
            // button to momentarily look different). We still animate scale for
            // the pop effect and animate the backdrop separately for the dim.
            opacity.value = 1;
            // mount synchronously so the very first frame is already opaque
            setMounted(true);

            // animate in (scale only — no content fade)
            scale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.exp) });
            backdropOpacity.value = withTiming(1, { duration: 150 });
        } else {
            if (Platform.OS === 'web') {
                // On web, skip exit animation to avoid intermittent flash caused by timers/focus changes
                scale.value = 0.95;
                opacity.value = 0;
                backdropOpacity.value = 0;
                // unmount immediately
                setMounted(false);
            } else {
                // animate out (native)
                scale.value = withTiming(0.95, { duration: 200 });
                // fade content out on exit to keep closing smooth
                opacity.value = withTiming(0, { duration: 160 });
                backdropOpacity.value = withTiming(0, { duration: 180 });
                // wait for animation to finish before unmounting
                timeout = setTimeout(() => setMounted(false), 320);
            }
        }

        return () => {
            if (timeout) clearTimeout(timeout);
        };
    }, [visible, scale, opacity, backdropOpacity]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: scale.value }],
            opacity: opacity.value,
        };
    });

    const backdropAnim = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

    let confirmButtonBgColor = themeColors.tint;
    if (variant === 'destructive') {
        confirmButtonBgColor = themeColors.danger;
    } else if (variant === 'secondary') {
        confirmButtonBgColor = themeColors.secondary;
    }

    const showTopIcon = variant === 'destructive' || !!(showIcon) || (typeof confirmText === 'string' && confirmText.toLowerCase() === 'zamknij');
    // Choose icon name and background based on intent: destructive uses warning triangle,
    // closing uses a close (X) glyph so they visually differ.
    const computedIcon = (() => {
        if (variant === 'destructive') return { name: 'warning', bg: themeColors.danger };
        if (typeof confirmText === 'string' && confirmText.toLowerCase() === 'zamknij') return { name: 'archive', bg: confirmButtonBgColor };
        return { name: 'warning', bg: themeColors.danger };
    })();
    // Slightly darker overlay to improve contrast while preserving the real blur underneath
    // Reduced light theme alpha slightly per request
    const overlayColor = theme === 'light' ? 'rgba(0,0,0,0.54)' : 'rgba(0,0,0,0.70)';

    // If caller passed a transient/empty config, silently skip render.
    // This is a normal UI transient (parent may set `visible` before filling props)
    // — not an application error, so avoid LogBox spam.
    const hasReadableContent = !!((title && String(title).trim()) || (message && String(message).trim()) || (confirmText && String(confirmText).trim()));
    if (!hasReadableContent) {
      return null;
    }

    if (!mounted) return null;

    return (
        <Modal
            animationType="none"
            transparent={true}
            visible={mounted}
            onRequestClose={onClose}
            presentationStyle="overFullScreen"
            // Allow the modal content to draw under the status bar on Android so the
            // BlurView can cover the full screen including system bars where supported.
            statusBarTranslucent={Platform.OS === 'android'}
        >
            <View style={styles.background}>
                {/* Backdrop: web uses CSS backdrop-filter; native will use BlurView if available, otherwise semi-transparent dim */}
                {Platform.OS === 'web' ? (
                    // On web: use backdrop-filter on a transparent overlay so underlying content blurs.
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.backdrop,
                            backdropAnim,
                            ({ backgroundColor: overlayColor, backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)' } as any),
                        ]}
                    />
                ) : (
                    // Native: render a full-screen BlurView when available. Don't place an opaque
                    // background behind it (that produces white/solid look). Add a semi-transparent
                    // overlay above the BlurView if we want to darken the scene while keeping
                    // the real blur effect.
                    <Animated.View style={[styles.backdrop, backdropAnim]} pointerEvents="none">
                        {NativeBlur ? (
                            <>
                                <NativeBlur intensity={150} tint={theme === 'light' ? 'light' : 'dark'} style={StyleSheet.absoluteFill} />
                                {/* Dim overlay above the blur to increase darkness while preserving blur */}
                                <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor }]} />
                            </>
                        ) : (
                            // Fallback: no native blur available — use semi-transparent dim
                            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor }]} />
                        )}
                    </Animated.View>
                )}
                {/* Fullscreen overlay that closes the modal when tapping outside the content. Rendered before content so content sits above it and receives taps. */}
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <Animated.View style={[styles.modalView, { backgroundColor: themeColors.modalBackground }, animatedStyle]}>
                    {showTopIcon && (
                        <View style={styles.iconInlineWrapper} pointerEvents="none">
                            <View style={[styles.iconCircle, { backgroundColor: computedIcon.bg }]}> 
                                <Ionicons name={computedIcon.name as any} size={24} color="white" style={{ alignSelf: 'center', transform: [{ translateY: -1 }] }} />
                            </View>
                        </View>
                    )}

                    <Text style={[styles.modalTitle, { color: themeColors.text, marginTop: showTopIcon ? 16 : 0 }]}>{title}</Text>
                    <Text style={[styles.modalMessage, { color: themeColors.textMuted }]}>{message}</Text>

                    <View style={[styles.buttonContainer, cancelText ? styles.buttonRow : undefined]}>
                        <TouchableOpacity
                            style={[styles.button, cancelText ? [styles.buttonRowButton, { marginRight: 6 }] : undefined, { backgroundColor: confirmButtonBgColor }]}
                            onPress={onConfirm}
                        >
                            <Text style={styles.buttonTextConfirm}>{confirmText}</Text>
                        </TouchableOpacity>
                            {cancelText && (
                                <TouchableOpacity
                                    style={[styles.button, styles.buttonCancelRow, styles.buttonRowButton, { backgroundColor: themeColors.input }]}
                                    onPress={onClose}
                                >
                                    <Text style={[styles.buttonText, { color: themeColors.text }]}>{cancelText}</Text>
                                </TouchableOpacity>
                            )}
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    background: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backdrop: { ...StyleSheet.absoluteFillObject },
    modalView: {
        margin: 20,
        borderRadius: 20,
        paddingHorizontal: 18,
        paddingVertical: 22,
        minHeight: 220,
        alignItems: 'center',
        width: '85%',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 5 },
                shadowOpacity: 0.15,
                shadowRadius: 15,
            },
            android: {
                elevation: 10,
            },
            web: {
                boxShadow: '0px 5px 15px rgba(0, 0, 0, 0.15)',
            },
        }),
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
        textAlign: 'center',
    },
    modalMessage: {
        fontSize: 15,
        marginBottom: 20,
        textAlign: 'center',
        lineHeight: 20,
    },
    buttonContainer: {
        width: '100%',
    },
    button: {
        borderRadius: 12,
        paddingVertical: 6,
        paddingHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    buttonRowButton: {
        flex: 1,
        alignSelf: 'stretch',
        minHeight: 40,
        justifyContent: 'center',
    },
    buttonCancel: {
        marginTop: 10,
    },
    buttonCancelRow: {
        marginTop: 0,
    },
    iconInlineWrapper: {
        marginBottom: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 6,
    },
    buttonText: {
        fontSize: 13,
        fontWeight: '600',
    },
    buttonTextConfirm: {
        color: 'white',
        fontSize: 14,
        fontWeight: '700',
    },
});