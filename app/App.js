import React, { useContext, useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';

import { AuthProvider, AuthContext } from './context/AuthContext';

import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
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
        }
      })}
    >
      <Tab.Screen name="Mapa" component={MapScreen} />
      <Tab.Screen name="Próximos" component={NearbyScreen} />
      <Tab.Screen name="Resgatados" component={RescuedScreen} />
      <Tab.Screen name="Conta" component={AccountScreen} />
    </Tab.Navigator>
  );
}

function getAccessTokenFromUrl(url) {
  const match = url.match(/[#&]access_token=([^&]+)/);

  if (!match || !match[1]) {
    return null;
  }

  return decodeURIComponent(match[1]);
}

function Routes() {
  const { user } = useContext(AuthContext);
  const navigationRef = useRef(null);

  const openRecoveryScreen = (url) => {
    if (!url.startsWith('petgo://auth/reset-password')) {
      return;
    }

    const token = getAccessTokenFromUrl(url);

    if (token && navigationRef.current) {
      navigationRef.current.navigate('ResetPassword', { token });
    }
  };

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      openRecoveryScreen(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleNavigationReady = async () => {
    const initialUrl = await Linking.getInitialURL();

    if (initialUrl) {
      openRecoveryScreen(initialUrl);
    }
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={handleNavigationReady}
    >
      {user ? (
        // ADIÇÃO: Envolvendo as Tabs em um Stack para podermos navegar para a SubscriptionScreen
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="MainTabs" component={Tabs} />
          <Stack.Screen name="Subscription" component={SubscriptionScreen} />
          <Stack.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
          />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Cadastro" component={RegisterScreen} />
          <Stack.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
            options={{
              title: 'Redefinir senha',
              headerShown: false
            }}
          />
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