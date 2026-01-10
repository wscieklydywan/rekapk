
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface DebugViewProps {
    user: { uid: string } | null;
    token: string | null | undefined;
}

export const DebugView: React.FC<DebugViewProps> = ({ user, token }) => {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>--- LIVE DEBUG ---</Text>
            <Text style={styles.text}>User ID: {user ? user.uid : 'null'}</Text>
            <Text style={styles.text}>Push Token: {token ?? 'null'}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#333',
        padding: 10,
        margin: 10,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: 'orange',
    },
    title: {
        fontWeight: 'bold',
        fontSize: 16,
        marginBottom: 5,
        color: 'orange',
    },
    text: {
        fontFamily: 'monospace',
        color: '#eee',
    }
});
