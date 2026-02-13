
import { Colors } from '@/constants/theme';
import { auth } from '@/lib/firebase';
import toast from '@/lib/toastController';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, useColorScheme, View } from 'react-native';

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const router = useRouter();
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];

  const handleLogin = async () => {
    if (loading) return; // Zabezpieczenie przed wielokrotnym kliknięciem

    if (!email || !password) {
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace('/(tabs)/');
    } catch (error: any) {
      let errorMessage = 'Błędne hasło lub mail, skontaktuj się z administratorem.';
      if (error.code === 'auth/invalid-email') {
        errorMessage = 'Proszę podać poprawny adres e-mail.';
      }
      try { toast.show({ text: errorMessage, variant: 'error' }); } catch (e) { /* ignore */ }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={[styles.container, { backgroundColor: themeColors.background }]} >


        
      <Text style={[styles.title, { color: themeColors.text }]}>Logowanie</Text>
      
      <View style={styles.inputContainer}>
        <Text style={[styles.label, { color: themeColors.textMuted }]}>E-mail</Text>
        <View style={[styles.inputWrapper, { backgroundColor: themeColors.input }]}>
            <Ionicons name="mail-outline" size={20} color={themeColors.icon} style={styles.icon} />
            <TextInput
                nativeID="login-email"
                style={[styles.input, { color: themeColors.text }]}
                placeholder="Wpisz swój e-mail"
                placeholderTextColor={themeColors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
            />
        </View>
      </View>

      <View style={styles.inputContainer}>
        <Text style={[styles.label, { color: themeColors.textMuted }]}>Hasło</Text>
        <View style={[styles.inputWrapper, { backgroundColor: themeColors.input }]}>
            <Ionicons name="lock-closed-outline" size={20} color={themeColors.icon} style={styles.icon} />
            <TextInput
                nativeID="login-password"
                style={[styles.input, { color: themeColors.text }]}
                placeholder="Wpisz swoje hasło"
                placeholderTextColor={themeColors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!isPasswordVisible}
                autoComplete="password"
                textContentType="password"
            />
            <TouchableOpacity onPress={() => setIsPasswordVisible(!isPasswordVisible)} style={styles.eyeIcon}>
                 <Ionicons name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'} size={22} color={themeColors.icon} />
            </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={themeColors.tint} style={{ marginTop: 20 }} />
      ) : (
        <TouchableOpacity style={[styles.button, { backgroundColor: themeColors.tint }]} onPress={handleLogin}>
            <Text style={styles.buttonText}>Zaloguj się</Text>
        </TouchableOpacity>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 40,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
      fontSize: 14,
      marginBottom: 8,
      marginLeft: 5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    height: 50,
    paddingHorizontal: 15,
  },
  icon: {
      marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  eyeIcon: {
      paddingLeft: 10, 
  },
  button: {
      height: 50,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 20,
      shadowColor: "#000",
      shadowOffset: {
          width: 0,
          height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
  },
  buttonText: {
      color: 'white',
      fontSize: 16,
      fontWeight: 'bold',
  }
});

export default LoginScreen;
