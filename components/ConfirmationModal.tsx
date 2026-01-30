import { Colors } from '@/constants/theme';
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
}: ConfirmationModalProps) => {
    const theme = useColorScheme() ?? 'light';
    const themeColors = Colors[theme];

    const scale = useSharedValue(0.95);
    const opacity = useSharedValue(0);
    const backdropOpacity = useSharedValue(0);

    const [mounted, setMounted] = useState(visible);

    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout> | undefined;

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
        >
            <Pressable style={styles.background} onPress={onClose}>
                <Animated.View style={[styles.backdrop, backdropAnim, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
                <Animated.View style={[styles.modalView, { backgroundColor: themeColors.modalBackground }, animatedStyle]}>
                    <Text style={[styles.modalTitle, { color: themeColors.text }]}>{title}</Text>
                    <Text style={[styles.modalMessage, { color: themeColors.textMuted }]}>{message}</Text>

                    <View style={styles.buttonContainer}>
                         <TouchableOpacity
                            style={[styles.button, { backgroundColor: confirmButtonBgColor }]}
                            onPress={onConfirm}
                        >
                            <Text style={styles.buttonTextConfirm}>{confirmText}</Text>
                        </TouchableOpacity>
                        {cancelText && (
                            <TouchableOpacity
                                style={[styles.button, styles.buttonCancel, { backgroundColor: themeColors.input }]}
                                onPress={onClose}
                            >
                                <Text style={[styles.buttonText, { color: themeColors.text }]}>{cancelText}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </Animated.View>
            </Pressable>
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
        padding: 25,
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
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 10,
        textAlign: 'center',
    },
    modalMessage: {
        fontSize: 16,
        marginBottom: 25,
        textAlign: 'center',
        lineHeight: 22,
    },
    buttonContainer: {
        width: '100%',
    },
    button: {
        borderRadius: 15,
        padding: 12,
        alignItems: 'center',
        width: '100%',
    },
    buttonCancel: {
        marginTop: 10,
    },
    buttonText: {
        fontSize: 17,
        fontWeight: '600',
    },
    buttonTextConfirm: {
        color: 'white',
        fontSize: 17,
        fontWeight: '700',
    },
});