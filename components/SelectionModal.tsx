import AnimatedModal from '@/components/AnimatedModal';
import { Colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';

type Option = {
  label: string;
  value: string;
};

interface SelectionModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: Option[];
  currentValue: string;
  onSelect: (value: string) => void;
}

export const SelectionModal: React.FC<SelectionModalProps> = ({ visible, onClose, title, options, currentValue, onSelect }) => {
  const theme = useColorScheme() ?? 'light';
  const themeColors = Colors[theme];

  return (
    <AnimatedModal visible={visible} onClose={onClose} position="bottom" contentStyle={[styles.modalView, { backgroundColor: themeColors.card }]}>
        <Text style={[styles.modalTitle, { color: themeColors.text }]}>{title}</Text>
        <Text style={[styles.modalDesc, { color: themeColors.textMuted }]}>Wybierz, z których czatów chcesz otrzymywać powiadomienia — tylko z przypisanych do Ciebie i nieprzypisanych, lub wszystkie.</Text>

        <View style={styles.optionsContainer}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={styles.optionButton}
              onPress={() => onSelect(option.value)}
            >
              <Text style={[styles.optionText, { color: themeColors.text }]}>{option.label}</Text>
              {currentValue === option.value && (
                <Ionicons name="checkmark-circle" size={24} color={themeColors.tint} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.closeButton, { backgroundColor: themeColors.background }]}
          onPress={onClose}
        >
          <Text style={[styles.closeButtonText, { color: themeColors.text }]}>Anuluj</Text>
        </TouchableOpacity>
    </AnimatedModal>
  );
};

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40, // Extra space for safe area
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  optionsContainer: {
    marginBottom: 20,
    transform: [{ translateY: 8 }],
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  optionText: {
    fontSize: 16,
  },
  closeButton: {
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    transform: [{ translateY: 10 }],
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
