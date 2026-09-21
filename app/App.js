import React, { useContext, useEffect, useRef } from 'react';
import { Alert, Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, AuthContext } from './context/AuthContext';
import { CheckoutProvider } from './context/CheckoutContext';

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

function getDeepLinkParameter(url, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = url.match(new RegExp(`[?#&]${escapedName}=([^&#]*)`));

  if (!match || !match[1]) {
    return null;
  }

  return decodeURIComponent(match[1].replace(/\+/g, ' '));
}

function Routes() {
  const { user } = useContext(AuthContext);
  const navigationRef = useRef(null);
  const userRef = useRef(user);
  const lastRecoveryUrlRef = useRef({ url: null, handledAt: 0 });
  const lastConfirmationUrlRef = useRef({ url: null, handledAt: 0 });

  userRef.current = user;

  const openRecoveryScreen = (url) => {
    if (!url.startsWith('petgo://auth/reset-password')) {
      return;
    }

    const token = getAccessTokenFromUrl(url);
    const now = Date.now();
    const isDuplicate =
      lastRecoveryUrlRef.current.url === url &&
      now - lastRecoveryUrlRef.current.handledAt < 3000;

    if (token && navigationRef.current && !isDuplicate) {
      lastRecoveryUrlRef.current = { url, handledAt: now };
      navigationRef.current.navigate('ResetPassword', { token });
    }
  };

  const showEmailConfirmationFeedback = (url) => {
    if (!url.startsWith('petgo://auth/callback')) {
      return;
    }

    const now = Date.now();
    const isDuplicate =
      lastConfirmationUrlRef.current.url === url &&
      now - lastConfirmationUrlRef.current.handledAt < 3000;

    if (isDuplicate) {
      return;
    }

    lastConfirmationUrlRef.current = { url, handledAt: now };

    const confirmationError =
      getDeepLinkParameter(url, 'error_description') ||
      getDeepLinkParameter(url, 'error');

    if (confirmationError) {
      Alert.alert(
        'Não foi possível confirmar',
        'O link de confirmação é inválido ou expirou. Solicite um novo e-mail no aplicativo.'
      );
      return;
    }

    Alert.alert(
      'E-mail confirmado! 🎉',
      'Sua conta foi ativada com sucesso. Agora você já pode entrar no PetGo.',
      [
        {
          text: 'Ir para o login',
          onPress: () => {
            if (!userRef.current) {
              navigationRef.current?.navigate('Login');
            }
          }
        }
      ],
      { cancelable: false }
    );
  };

  const handleDeepLink = (url) => {
    openRecoveryScreen(url);
    showEmailConfirmationFeedback(url);
  };

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleNavigationReady = async () => {
    const initialUrl = await Linking.getInitialURL();

    if (initialUrl) {
      handleDeepLink(initialUrl);
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
    <SafeAreaProvider>
      <AuthProvider>
        <CheckoutProvider>
          <Routes />
        </CheckoutProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
