
import React, { useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, useColorScheme, Pressable, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { Colors } from '@/constants/theme';

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

    useEffect(() => {
        if (visible) {
            scale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.exp) });
            opacity.value = withTiming(1, { duration: 150 });
        } else {
            scale.value = withTiming(0.95, { duration: 150 });
            opacity.value = withTiming(0, { duration: 100 });
        }
    }, [visible, scale, opacity]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: scale.value }],
            opacity: opacity.value,
        };
    });

    let confirmButtonBgColor = themeColors.tint;
    if (variant === 'destructive') {
        confirmButtonBgColor = themeColors.danger;
    } else if (variant === 'secondary') {
        confirmButtonBgColor = themeColors.secondary;
    }

    return (
        <Modal
            animationType="none"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <Pressable style={styles.background} onPress={onClose}>
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
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
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
