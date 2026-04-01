import React, { useContext } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function AccountScreen() {
  const { user, logout } = useContext(AuthContext);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={50} color="#FFF" />
        </View>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.badge}>Membro Voluntário</Text>
      </View>

      <View style={styles.menu}>
        <TouchableOpacity style={styles.menuItem}>
          <Ionicons name="heart-outline" size={24} color="#4A90E2" />
          <Text style={styles.menuText}>Meus Resgates</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <Ionicons name="settings-outline" size={24} color="#666" />
          <Text style={styles.menuText}>Configurações</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Sair da Conta</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  profileHeader: { alignItems: 'center', padding: 40, borderBottomWidth: 1, borderColor: '#F0F0F0' },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#4A90E2', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  email: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  badge: { backgroundColor: '#E1F0FF', color: '#4A90E2', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20, marginTop: 10, fontSize: 12, fontWeight: 'bold' },
  menu: { padding: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: '#F9F9F9' },
  menuText: { fontSize: 16, marginLeft: 15, color: '#444' },
  logoutButton: { marginTop: 40, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#FF3B30', padding: 15, borderRadius: 12, alignItems: 'center' },
  logoutText: { color: '#FF3B30', fontWeight: 'bold' }
});