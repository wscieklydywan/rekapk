
import { Stack } from 'expo-router';
import React from 'react';

const FormsLayout = () => {
    return (
        <Stack screenOptions={{ headerShown: false, detachInactiveScreens: false, freezeOnBlur: false } as any}>
            <Stack.Screen name="index" />
            <Stack.Screen name="[id]" />
        </Stack>
    );
}

export default FormsLayout;
