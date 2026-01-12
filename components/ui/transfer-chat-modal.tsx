
import AnimatedModal from '@/components/AnimatedModal';
import { Colors } from '@/constants/theme';
import { useAdmins } from '@/hooks/useAdmins';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, useColorScheme } from 'react-native';

interface TransferChatModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectAdmin: (adminId: string) => void;
  currentOperatorId?: string;
}

export const TransferChatModal = ({ visible, onClose, onSelectAdmin, currentOperatorId }: TransferChatModalProps) => {
  const { admins, loading } = useAdmins();

  const availableAdmins = admins.filter(admin => admin.id !== currentOperatorId);

  const theme = useColorScheme() ?? 'light';
  const themeColors = Colors[theme];

  return (
    <AnimatedModal visible={visible} onClose={onClose} contentStyle={[styles.modalView, { backgroundColor: themeColors.card }]}>
        <Text style={[styles.modalText, { color: themeColors.text }]}>Przekaż czat do...</Text> {/* Tłumaczenie */}
        {loading ? (
          <ActivityIndicator size="large" />
        ) : (
          <FlatList
            data={availableAdmins}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.adminItem}
                onPress={() => onSelectAdmin(item.id)}                
              >
                <Text style={[styles.adminName, { color: themeColors.tint }]}>{item.email}</Text>
              </TouchableOpacity>
            )}
          />
        )}
        <TouchableOpacity
          style={[styles.button, styles.buttonClose, { backgroundColor: themeColors.secondary }]}
          onPress={onClose}
        >
          <Text style={[styles.textStyle, { color: '#fff' }]}>Zamknij</Text> {/* Tłumaczenie */}
        </TouchableOpacity>
    </AnimatedModal>
  );
};

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: "white",
    borderRadius: 20,
    padding: 35,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '80%',
    maxHeight: '60%',
  },
  modalText: {
    marginBottom: 15,
    textAlign: "center",
    fontSize: 18,
    fontWeight: 'bold',
  },
  adminItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    width: '100%',
    alignItems: 'center',
  },
  adminName: {
    fontSize: 16,
    color: '#007bff'
  },
  button: {
    borderRadius: 20,
    padding: 10,
    elevation: 2,
    marginTop: 15,
  },
  buttonClose: {
    backgroundColor: "#2196F3",
  },
  textStyle: {
    color: "white",
    fontWeight: "bold",
    textAlign: "center"
  }
});
