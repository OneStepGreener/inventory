import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Alert,
  Image,
  ActivityIndicator,
  Animated,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loginV2 } from '../frontendStore';
import { t, getCurrentLanguage, setCurrentLanguage as setGlobalLanguage, subscribeToLanguageChanges, translations } from '../utils/translations';

const { width, height } = Dimensions.get('window');

// Responsive calculations
const isSmallScreen = height < 700;
const isLargeScreen = height > 800;
const responsiveFontSize = isSmallScreen ? 14 : 16;
const responsiveHeaderMargin = isSmallScreen ? 30 : 50;
const responsiveInputMargin = isSmallScreen ? 40 : 80;

const DriverLoginScreen = ({ navigation }) => {
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [drivingLicense, setDrivingLicense] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
const currentLanguage = getCurrentLanguage();
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Auto-cycling language states
  const [isAutoCycling, setIsAutoCycling] = useState(true);
  const [currentCycleIndex, setCurrentCycleIndex] = useState(0);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  
  // Debug: Log modal state changes
  useEffect(() => {
    console.log('🎯 showLanguageModal state changed to:', showLanguageModal);
  }, [showLanguageModal]);
  
  // Animation for welcome message
const welcomeOpacity = useRef(new Animated.Value(1)).current;
const welcomeScale = useRef(new Animated.Value(1)).current;
  
  // Available languages for cycling
  const cyclingLanguages = ['en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa'];
  
  const languageNames = {
    en: 'English',
    hi: 'हिंदी',
    bn: 'বাংলা',
    ta: 'தமிழ்',
    te: 'తెలుగు',
    mr: 'मराठी',
    gu: 'ગુજરાતી',
    kn: 'ಕನ್ನಡ',
    ml: 'മലയാളം',
    pa: 'ਪੰਜਾਬੀ',
  };

  // Initialize with saved language
  useEffect(() => {
    const savedLang = getCurrentLanguage();
    console.log('🔄 DriverLoginScreen: Initializing with language:', savedLang);
    
    // If there's a saved language (not default English), stop auto-cycling
    if (savedLang !== 'en') {
      console.log('🔄 DriverLoginScreen: Found saved language, stopping auto-cycle');
      setIsAutoCycling(false);
      const savedIndex = cyclingLanguages.indexOf(savedLang);
      if (savedIndex >= 0) {
        setCurrentCycleIndex(savedIndex);
      }
    }
  }, []);

  // Subscribe to language changes
  useEffect(() => {
    console.log('🔄 DriverLoginScreen: Subscribing to language changes');
    const unsubscribe = subscribeToLanguageChanges((newLang) => {
      console.log('🔄 DriverLoginScreen: Language changed to:', newLang);
      setRefreshKey(prev => prev + 1); // Force re-render
    });
    
    return () => {
      console.log('🔄 DriverLoginScreen: Unsubscribing from language changes');
      unsubscribe();
    };
  }, []);

  // Auto-cycling effect
  useEffect(() => {
    let interval;
    if (isAutoCycling) {
      interval = setInterval(() => {
        setCurrentCycleIndex((prevIndex) => {
          const nextIndex = (prevIndex + 1) % cyclingLanguages.length;
          const nextLanguage = cyclingLanguages[nextIndex];
          
          // Animate language change
          Animated.sequence([
            Animated.parallel([
              Animated.timing(welcomeOpacity, {
                toValue: 0.3,
                duration: 300,
                useNativeDriver: true,
              }),
              Animated.timing(welcomeScale, {
                toValue: 0.95,
                duration: 300,
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(welcomeOpacity, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
              }),
              Animated.spring(welcomeScale, {
                toValue: 1,
                tension: 100,
                friction: 8,
                useNativeDriver: true,
              }),
            ]),
          ]).start();
          
          // Do NOT change global language while auto-cycling; only update local cycle index
          return nextIndex;
        });
      }, 2500); // Change language every 2.5 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAutoCycling]);

  const handleWelcomePress = () => {
    console.log('🎯 Welcome message pressed - opening language modal');
    console.log('🎯 Available languages:', cyclingLanguages);
    console.log('🎯 Current language:', currentLanguage);
    // Stop auto-cycling and show language selector
    setIsAutoCycling(false);
    setShowLanguageModal(true);
    console.log('🎯 Modal state set to true');
  };

  const handleLanguageSelect = (selectedLanguage) => {
    console.log('📱 User selected language:', selectedLanguage);
    
    // Stop auto-cycling and set selected language
    setIsAutoCycling(false);
    setShowLanguageModal(false);
    
    // Find the index of selected language
    const selectedIndex = cyclingLanguages.indexOf(selectedLanguage);
    setCurrentCycleIndex(selectedIndex);
    
    // Animate language change
    Animated.sequence([
      Animated.parallel([
        Animated.timing(welcomeOpacity, {
          toValue: 0.3,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(welcomeScale, {
          toValue: 0.95,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(welcomeOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(welcomeScale, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
    
    console.log('📱 Calling setGlobalLanguage with:', selectedLanguage);
    setGlobalLanguage(selectedLanguage);
  };

  const validateAndProceed = async () => {
    console.log('🚀 validateAndProceed function started!');
    console.log('📝 Vehicle Number:', vehicleNumber);
    console.log('📝 Driving License:', drivingLicense);
    console.log('📏 Vehicle Number length:', vehicleNumber.length);
    console.log('📏 Driving License length:', drivingLicense.length);
    
    // Check if fields are empty
    if (!vehicleNumber.trim()) {
      Alert.alert(t('invalidVehicleNumber'), t('enterVehicleNumber'));
      return;
    }

    if (!drivingLicense.trim()) {
      Alert.alert(t('invalidDlNumber'), t('enterDlNumber'));
      return;
    }
    
    if (vehicleNumber.length < 8 || vehicleNumber.length > 10) {
      Alert.alert(t('invalidVehicleNumber'), t('vehicleNumberLength'));
      return;
    }

    if (drivingLicense.length < 10 || drivingLicense.length > 15) {
      Alert.alert(t('invalidDlNumber'), t('dlNumberLength'));
      return;
    }

    console.log('✅ Validation passed, starting authentication...');
    setIsLoading(true);

    try {
      // Proceed directly with authentication
      console.log('🔄 Starting authentication...');
      
      // Authenticate with backend using multi-pickup API
      console.log('🔄 Using multi-pickup authentication system...');
      
      const result = await loginV2(vehicleNumber, drivingLicense);
      console.log('✅ Authentication completed:', result);
      
      if (result.success) {
        console.log('✅ Authentication successful, navigating to PickupStart');
        setIsNavigating(true);
        // Small delay to show success state before navigation
        setTimeout(() => {
          navigation.navigate('PickupStart');
          setIsNavigating(false);
        }, 800);
      } else {
        Alert.alert(t('loginFailed'), result.error || t('invalidCredentials'));
      }
    } catch (error) {
      console.error('Login error:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      let errorMessage = t('networkError');
      
      if (error.message.includes('Network request failed')) {
        errorMessage = t('serverError');
      } else if (error.message.includes('timed out')) {
        errorMessage = t('timeoutError');
      } else if (error.message.includes('Invalid credentials')) {
        errorMessage = t('invalidCredentials');
      } else if (error.message.includes('JSON') || error.message.includes('parse')) {
        errorMessage = 'Server response error. Please try again.';
      } else if (error.message.includes('Empty response')) {
        errorMessage = 'Server is not responding. Please check your connection.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert(t('loginError'), errorMessage);
    } finally {
      if (!isNavigating) {
        setIsLoading(false);
      }
    }
  };


  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      
      {/* Content area - no keyboard handling */}
      <View style={styles.contentArea}>
        {/* Logo */}
        <View style={styles.header}>
          <Image 
            source={require('../../assets/OSG_Logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Welcome Message with Language Cycling */}
        <Animated.View 
          style={[
            styles.welcomeMessageContainer,
            {
              opacity: welcomeOpacity,
              transform: [{ scale: welcomeScale }],
            }
          ]}
        >
          <TouchableOpacity 
            onPress={handleWelcomePress}
            activeOpacity={0.8}
            style={styles.languageBoxContent}
          >
            <Text style={styles.welcomeMessage}>
              {isAutoCycling
                ? (translations[cyclingLanguages[currentCycleIndex]]?.selectLanguage || translations.en.selectLanguage)
                : t('selectLanguage')}
            </Text>
            <Image 
              source={require('../assets/image/down-arrow.png')}
              style={styles.downArrow}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </Animated.View>

        {/* Input fields */}
        <View style={styles.inputContainer}>
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>{t('vehicleNumber')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('vehicleNumberPlaceholder')}
              placeholderTextColor="#999"
              value={vehicleNumber}
              onChangeText={(text) => {
                // Allow letters, numbers, and spaces, convert to uppercase
                const cleanText = text.replace(/[^A-Za-z0-9\s]/g, '').toUpperCase();
                if (cleanText.length <= 10) {
                  setVehicleNumber(cleanText);
                }
              }}
              keyboardType="default"
              maxLength={10}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>{t('dlNumber')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('dlNumberPlaceholder')}
              placeholderTextColor="#999"
              value={drivingLicense}
              onChangeText={(text) => {
                // Allow letters, numbers, convert to uppercase
                const cleanText = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                if (cleanText.length <= 15) {
                  setDrivingLicense(cleanText);
                }
              }}
              keyboardType="default"
              maxLength={15}
              autoCapitalize="characters"
            />
          </View>
        </View>
      </View>

      {/* Start Trip button - Absolutely fixed at bottom */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.startTripButton, (isLoading || isNavigating) && styles.buttonDisabled]} 
          onPress={validateAndProceed}
          disabled={isLoading || isNavigating}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="white" />
          ) : isNavigating ? (
            <>
              <ActivityIndicator size="small" color="white" />
              <Text style={[styles.startTripText, {marginLeft: 10}]}>{t('successLoading')}</Text>
            </>
          ) : (
            <>
              <Text style={styles.startTripText}>{t('startTrip')}</Text>
              <Text style={styles.arrowIcon}>→</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Language Selection Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showLanguageModal}
        onRequestClose={() => {
          console.log('🎯 Modal close requested');
          setShowLanguageModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalOverlayTouchable} 
            activeOpacity={1} 
            onPress={() => {
              console.log('🎯 Overlay pressed - closing modal');
              setShowLanguageModal(false);
            }}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('selectLanguage')}</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  console.log('🎯 Close button pressed');
                  setShowLanguageModal(false);
                }}
                activeOpacity={0.6}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={cyclingLanguages}
              renderItem={({ item, index }) => {
                console.log('🎯 Rendering language item:', item, 'at index:', index);
                return (
                  <TouchableOpacity
                    style={[
                      styles.languageItem,
                      currentLanguage === item && styles.selectedLanguageItem
                    ]}
                    onPress={() => {
                      console.log('🎯 Language selected:', item);
                      handleLanguageSelect(item);
                    }}
                    activeOpacity={0.6}
                  >
                    <Text style={[
                      styles.languageText,
                      currentLanguage === item && styles.selectedLanguageText
                    ]}>
                      {languageNames[item]}
                    </Text>
                  </TouchableOpacity>
                );
              }}
              keyExtractor={(item) => item}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.languageListContent}
              ListEmptyComponent={() => {
                console.log('🎯 FlatList is empty!');
                return <Text style={{color: 'white', padding: 20}}>No languages available</Text>;
              }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  contentArea: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 90, // Space for the fixed button
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: responsiveHeaderMargin,
    marginBottom: isSmallScreen ? 20 : 40,
  },
  logo: {
    width: width * 0.8, // 80% of screen width
    height: height * 0.15, // 15% of screen height
    maxWidth: isSmallScreen ? 250 : 300,
    maxHeight: isSmallScreen ? 120 : 150,
  },
  welcomeMessageContainer: {
    marginBottom: 20,
  },
  languageBoxContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#2196F3', // Blue background
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#1976D2', // Darker blue border
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  welcomeMessage: {
    color: 'white',
    fontSize: isSmallScreen ? 20 : 21,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginRight: 10,
  },
  downArrow: {
    width: 20,
    height: 20,
    tintColor: 'white',
  },
  languageIndicator: {
    alignItems: 'center',
  },
  languageIndicatorText: {
    color: '#ccc',
    fontSize: isSmallScreen ? 12 : 14,
    marginBottom: 10,
    textAlign: 'center',
  },
  languageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  languageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 3,
  },
  inputContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    marginTop: isSmallScreen ? 20 : 40,
  },
  inputWrapper: {
    marginBottom: 30,
  },
  inputLabel: {
    color: 'white',
    fontSize: responsiveFontSize,
    marginBottom: 10,
    fontWeight: '500',
  },
  input: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: isSmallScreen ? 10 : 12,
    color: 'white',
    fontSize: responsiveFontSize,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: isSmallScreen ? 20 : 40,
    left: 0,
    right: 0,
    paddingBottom: isSmallScreen ? 15 : 20,
    paddingTop: 10,
    paddingHorizontal: 20,
    backgroundColor: '#1a1a1a',
  },
  startTripButton: {
    backgroundColor: '#1a4d2e',
    borderRadius: 8,
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  buttonDisabled: {
    backgroundColor: '#4a4a4a',
    opacity: 0.6,
  },
  startTripText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 10,
  },
  arrowIcon: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    width: width * 0.85,
    height: height * 0.65,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  languageListContent: {
    paddingBottom: 10,
  },
  languageItem: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  selectedLanguageItem: {
    backgroundColor: '#1a4d2e',
  },
  languageText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  selectedLanguageText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default DriverLoginScreen; 