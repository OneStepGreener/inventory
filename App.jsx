/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useState, useEffect, useRef } from 'react';
import { StatusBar, View, ActivityIndicator, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import SplashScreen from './src/screens/SplashScreen';
import DriverLoginScreen from './src/screens/DriverLoginScreen';
import PickupStartScreen from './src/screens/PickupStartScreen';
import UpdatingStatsScreen from './src/screens/UpdatingStatsScreen';
import FinalPickupScreen from './src/screens/FinalPickupScreen';
import BaseScreen from './src/screens/BaseScreen';
import DetailsScreen from './src/screens/DetailsScreen';
import { checkAndRestoreSession, handleAppResume, checkAndRefreshTokenIfNeeded } from './src/frontendStore';
import { LanguageProvider } from './src/contexts/LanguageContext';

const Stack = createStackNavigator();

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState('Splash');
  const appState = useRef(AppState.currentState);
  const isMounted = useRef(true);
  const tokenRefreshInterval = useRef(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('🚀 App starting, checking for existing session...');
        
        // Check if there's a valid session to restore
        const sessionResult = await checkAndRestoreSession();
        
        if (!isMounted.current) return;
        
        if (sessionResult.success && sessionResult.hasValidSession) {
          console.log('✅ Valid session found, navigating to:', sessionResult.currentPage);
          
          // Navigate to appropriate screen based on current page
          if (sessionResult.currentPage === 'pickup_form') {
            setInitialRoute('UpdatingStats');
          } else if (sessionResult.currentPage === 'base') {
            setInitialRoute('Base');
          } else {
            setInitialRoute('PickupStart');
          }
        } else {
          console.log('❌ No valid session found, starting from login');
          setInitialRoute('Splash');
        }
      } catch (error) {
        console.error('❌ Error during app initialization:', error);
        if (isMounted.current) {
          setInitialRoute('Splash');
        }
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
        }
      }
    };

    initializeApp();

    // Setup AppState listener for background/foreground handling
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      try {
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === 'active'
        ) {
          console.log('📱 App has come to the foreground');
          
          // Handle app resume
          if (isMounted.current) {
            await handleAppResume();
          }
        } else if (
          appState.current === 'active' &&
          nextAppState.match(/inactive|background/)
        ) {
          console.log('📱 App has gone to the background');
          
          // Save session before going to background
          try {
            const { saveSessionToStorage } = require('./src/frontendStore');
            await saveSessionToStorage();
            console.log('✅ Session saved before going to background');
          } catch (error) {
            console.error('❌ Error saving session before background:', error);
          }
        }
        
        appState.current = nextAppState;
      } catch (error) {
        console.error('❌ Error handling AppState change:', error);
      }
    });

    // Setup periodic token refresh check (every 15 minutes - more frequent)
    tokenRefreshInterval.current = setInterval(async () => {
      try {
        if (isMounted.current) {
          // First ensure session is loaded from storage (in case app was killed)
          const { loadSessionFromStorage, checkAndRefreshTokenIfNeeded } = require('./src/frontendStore');
          await loadSessionFromStorage();
          
          // Then check and refresh token if needed
          await checkAndRefreshTokenIfNeeded();
        }
      } catch (error) {
        console.error('❌ Error in periodic token refresh:', error);
      }
    }, 15 * 60 * 1000); // 15 minutes - more frequent checks

    // Cleanup
    return () => {
      isMounted.current = false;
      subscription?.remove();
      if (tokenRefreshInterval.current) {
        clearInterval(tokenRefreshInterval.current);
      }
    };
  }, []);

  // Show loading screen while checking session
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a' }}>
        <ActivityIndicator size="large" color="#1a4d2e" />
      </View>
    );
  }

  return (
    <LanguageProvider>
      <NavigationContainer>
        <StatusBar barStyle="light-content" />
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="DriverLogin" component={DriverLoginScreen} />
          <Stack.Screen name="PickupStart" component={PickupStartScreen} />
          <Stack.Screen name="UpdatingStats" component={UpdatingStatsScreen} />
          <Stack.Screen name="Details" component={DetailsScreen} />
          <Stack.Screen name="FinalPickup" component={FinalPickupScreen} />
          <Stack.Screen name="Base" component={BaseScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </LanguageProvider>
  );
}

export default App;
