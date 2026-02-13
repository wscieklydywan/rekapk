import TabTransition from '@/components/TabTransition';
import { Colors } from '@/constants/theme';
import React, { useState } from 'react';
import { FlatList, StatusBar, StyleSheet, Text, useColorScheme, View } from 'react-native';

const TestScreen = () => {
  const theme = useColorScheme() ?? 'light';
  const themeColors = Colors[theme];
  const [selected, setSelected] = useState(0);

  const pills = ['Browsing', 'Queued', 'Chatting', 'Supervising'];

  const testChats = [
    { id: '1', contact: 'Anna Kowalska', lastMessage: 'Cześć, potrzebuję pomocy z zamówieniem', status: 'Aktywny', time: '09:12', unread: 2 },
    { id: '2', contact: 'Marek Nowak', lastMessage: 'Czy mogę zmienić adres dostawy?', status: 'Oczekujące', time: '08:45', unread: 0 },
    { id: '3', contact: 'Paulina Zielińska', lastMessage: 'Dziękuję za szybką odpowiedź!', status: 'Zamknięty', time: 'Wczoraj', unread: 0 },
    { id: '4', contact: 'Jan Kowalski', lastMessage: 'Gdzie mogę znaleźć fakturę?', status: 'Aktywny', time: '07:30', unread: 1 },
    { id: '5', contact: 'Katarzyna Bąk', lastMessage: 'Proszę o wycenę usługi', status: 'Oczekujące', time: '06:50', unread: 0 },
    { id: '6', contact: 'Tomasz Wiśniewski', lastMessage: 'Czy macie dostępne terminy?', status: 'Aktywny', time: '06:12', unread: 3 },
    { id: '7', contact: 'Monika Szymańska', lastMessage: 'Dziękuję, czekam na wiadomość', status: 'Zamknięty', time: '02:21', unread: 0 },
    { id: '8', contact: 'Paweł Zieliński', lastMessage: 'Jak anulować zamówienie?', status: 'Aktywny', time: '01:10', unread: 0 },
    { id: '9', contact: 'Agnieszka Nowakowska', lastMessage: 'Błąd na stronie przy płatności', status: 'Oczekujące', time: '00:45', unread: 1 },
    { id: '10', contact: 'Łukasz Kamiński', lastMessage: 'Czy mogę otrzymać fakturę VAT?', status: 'Aktywny', time: '23:12', unread: 0 },
    { id: '11', contact: 'Natalia Wójcik', lastMessage: 'Gdzie jest moje zamówienie?', status: 'Aktywny', time: '22:50', unread: 2 },
    { id: '12', contact: 'Michał Krawczyk', lastMessage: 'Problem z logowaniem', status: 'Oczekujące', time: '21:33', unread: 0 },
    { id: '13', contact: 'Ewa Pawłowska', lastMessage: 'Jak zmienić dane kontaktowe?', status: 'Zamknięty', time: '20:10', unread: 0 },
    { id: '14', contact: 'Grzegorz Zieliński', lastMessage: 'Prośba o kontakt telefoniczny', status: 'Aktywny', time: '19:45', unread: 1 },
    { id: '15', contact: 'Barbara Maj', lastMessage: 'Dziękuję za pomoc!', status: 'Zamknięty', time: '18:05', unread: 0 },
    { id: '16', contact: 'Piotr Głowacki', lastMessage: 'Czy oferujecie rabaty dla stałych klientów?', status: 'Aktywny', time: '17:22', unread: 0 },
    { id: '17', contact: 'Dorota Sokołowska', lastMessage: 'Proszę o zmianę terminu', status: 'Oczekujące', time: '16:10', unread: 0 },
    { id: '18', contact: 'Kamil Marciniak', lastMessage: 'Jak działa gwarancja?', status: 'Aktywny', time: '15:01', unread: 4 },
    { id: '19', contact: 'Magdalena Lis', lastMessage: 'Czy mogę zamówić większą ilość?', status: 'Oczekujące', time: '14:30', unread: 0 },
    { id: '20', contact: 'Rafał Kowalczyk', lastMessage: 'Proszę o ofertę na maila', status: 'Aktywny', time: '13:20', unread: 0 },
    { id: '21', contact: 'Izabela Król', lastMessage: 'Nie mogę zarejestrować konta', status: 'Oczekujące', time: '12:05', unread: 1 },
    { id: '22', contact: 'Marcin Sadowski', lastMessage: 'Czy mogę otrzymać pomoc online?', status: 'Aktywny', time: '11:15', unread: 0 },
    { id: '23', contact: 'Joanna Kaczmarek', lastMessage: 'Pytanie dotyczące projektu', status: 'Aktywny', time: '10:42', unread: 0 },
    { id: '24', contact: 'Adam Woźniak', lastMessage: 'Kiedy dostawa?', status: 'Oczekujące', time: '09:05', unread: 0 },
    { id: '25', contact: 'Sylwia Bednarska', lastMessage: 'Potrzebuję pomocy z kontem', status: 'Aktywny', time: '08:02', unread: 2 },
    { id: '26', contact: 'Robert Nowicki', lastMessage: 'Prośba o kontakt', status: 'Aktywny', time: '07:22', unread: 0 },
    { id: '27', contact: 'Paulina Koper', lastMessage: 'Jak anulować subskrypcję?', status: 'Zamknięty', time: '06:11', unread: 0 },
    { id: '28', contact: 'Sebastian Lis', lastMessage: 'Czy macie wsparcie 24/7?', status: 'Oczekujące', time: '05:00', unread: 0 },
    { id: '29', contact: 'Alicja Nowak', lastMessage: 'Dziękuję bardzo', status: 'Aktywny', time: '04:30', unread: 1 },
    { id: '30', contact: 'Wojciech Bielecki', lastMessage: 'Jak mogę złożyć reklamację?', status: 'Oczekujące', time: '03:12', unread: 0 }
  ];

  return (
    <TabTransition tabIndex={0} quick style={{ flex: 1, backgroundColor: themeColors.background }}>
      <StatusBar backgroundColor="#2b2f33" barStyle="light-content" />
       <View style={[styles.headerSlot, { backgroundColor: '#2b2f33', borderBottomColor: 'transparent' }]}>
        <View style={styles.headerLayer}>
          <View style={styles.headerContent}>
            <Text style={[styles.title, { color: '#ffffff' }]}>Formularze</Text>
          </View>
        </View>
      </View>

      <View style={[styles.cardWrapper, { backgroundColor: theme === 'light' ? '#f3f4f6' : themeColors.card }] }>
        <View style={[styles.contentCardInner, { backgroundColor: 'transparent' }]}> 
          <FlatList
          data={testChats}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingTop: 0, backgroundColor: 'transparent' }}
          style={{ backgroundColor: 'transparent' }}
          renderItem={({ item, index }) => {
            const isFirst = index === 0;
            const isLast = index === testChats.length - 1;
            return (
                <View style={{ paddingHorizontal: 8 }}>
                  <View style={{ backgroundColor: '#fff', borderTopLeftRadius: isFirst ? 16 : 0, borderTopRightRadius: isFirst ? 16 : 0, borderBottomLeftRadius: isLast ? 16 : 0, borderBottomRightRadius: isLast ? 16 : 0, marginTop: isFirst ? 8 : 2, marginBottom: isLast ? 8 : 2, overflow: 'hidden' }}>
                    <View style={[styles.chatItem, { paddingHorizontal: 12 }]}>
                      <View style={styles.chatAvatar}><Text style={styles.avatarText}>{item.contact.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}</Text></View>
                      <View style={styles.chatBody}>
                        <Text style={[styles.chatName, { color: themeColors.text }]} numberOfLines={1}>{item.contact}</Text>
                        <Text style={[styles.chatMessage, { color: themeColors.textMuted }]} numberOfLines={1}>{item.lastMessage}</Text>
                      </View>
                      <View style={styles.chatMeta}>
                        <Text style={[styles.chatTime, { color: themeColors.textMuted }]}>{item.time}</Text>
                        <View style={[styles.statusPill, { backgroundColor: item.status === 'Aktywny' ? '#3CB371' : item.status === 'Oczekujące' ? '#F2C037' : '#9B9B9B' }]}>
                          <Text style={styles.statusText}>{item.status}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
            );
          }}
          ListEmptyComponent={<View style={styles.emptyContainer}><Text style={[styles.emptyTitle, { color: themeColors.text }]}>No traffic to show</Text><Text style={[styles.emptyDesc, { color: themeColors.textMuted }]}>Your website isn't connected, but you can still chat. Share your chat link with customers.</Text></View>}
          />
        </View>
      </View>
    </TabTransition>
  );
};

const styles = StyleSheet.create({
  headerSlot: { height: 110 },
  headerLayer: { position: 'absolute', top: 0, left: 0, right: 0, height: '100%', zIndex: 3 },
  headerContent: { paddingTop: 14, paddingBottom: 6, paddingHorizontal: 14, flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', height: '100%' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 2 },
  contentCard: { flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', padding: 8, marginTop: -52, paddingTop: 12 },
  emptyContainer: { flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  emptyDesc: { fontSize: 15, textAlign: 'center', maxWidth: 320 },
  chatItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10 },
  chatAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#EEE', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  avatarText: { fontWeight: '700', color: '#333' },
  chatBody: { flex: 1, justifyContent: 'center' },
  chatName: { fontSize: 16, fontWeight: '700' },
  chatMessage: { fontSize: 14, marginTop: 4 },
  chatMeta: { justifyContent: 'center', alignItems: 'flex-end', marginLeft: 8 },
  chatTime: { fontSize: 12 },
  statusPill: { marginTop: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  cardWrapper: { flex: 1, marginTop: -48, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', backgroundColor: 'transparent', zIndex: 1 },
  contentCardInner: { flex: 1, padding: 6, paddingTop: 0, paddingBottom: 0 },
});

export default TestScreen;
