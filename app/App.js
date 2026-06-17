import React, { useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';

import { AuthProvider, AuthContext } from './context/AuthContext';

import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import MapScreen from './screens/MapScreen';
import NearbyScreen from './screens/NearbyScreen';
import RescuedScreen from './screens/RescuedScreen';
import AccountScreen from './screens/AccountScreen';
// ADIÇÃO: Importando a nova tela de Planos
import SubscriptionScreen from './screens/SubscriptionScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          let icon;
          if (route.name === 'Mapa') icon = 'map';
          if (route.name === 'Próximos') icon = 'location';
          if (route.name === 'Resgatados') icon = 'heart';
          if (route.name === 'Conta') icon = 'person';
          return <Ionicons name={icon} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Mapa" component={MapScreen} />
      <Tab.Screen name="Próximos" component={NearbyScreen} />
      <Tab.Screen name="Resgatados" component={RescuedScreen} />
      <Tab.Screen name="Conta" component={AccountScreen} />
    </Tab.Navigator>
  );
}

function Routes() {
  const { user } = useContext(AuthContext);

  return (
    <NavigationContainer>
      {user ? (
        // ADIÇÃO: Envolvendo as Tabs em um Stack para podermos navegar para a SubscriptionScreen
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="MainTabs" component={Tabs} />
          <Stack.Screen name="Subscription" component={SubscriptionScreen} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Cadastro" component={RegisterScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  );
}