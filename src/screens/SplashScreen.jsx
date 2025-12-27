import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  StatusBar,
  Image,
} from 'react-native';
import { APP_CONFIG } from '../utils/config';
import { initializeLanguage } from '../utils/translations';

const { width, height } = Dimensions.get('window');

const SplashScreen = ({ navigation }) => {
  useEffect(() => {
    // Initialize language from storage
    const initializeApp = async () => {
      console.log('🚀 App starting - initializing language...');
      await initializeLanguage();
      console.log('✅ Language initialized');
    };
    
    initializeApp();
    
    const timer = setTimeout(() => {
      navigation.replace('DriverLogin');
    }, APP_CONFIG.SPLASH_DURATION);

    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <Image 
        source={require('../../assets/OSG_Logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000', // Black background to match OSG logo
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: width * 0.8, // 80% of screen width
    height: height * 0.4, // 40% of screen height
    maxWidth: 400,
    maxHeight: 300,
  },
});

export default SplashScreen; 