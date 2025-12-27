import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Animated,
  Linking,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'react-native-linear-gradient';
import { logout, getSessionToken, getAuthHeaders, getSessionData } from '../frontendStore';

const { width, height } = Dimensions.get('window');

const BaseScreen = ({ navigation }) => {
  // Logout state to prevent race conditions
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const cardRotateX = useRef(new Animated.Value(0)).current;
  const cardRotateY = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Initial entrance animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous rotation animation
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 20000,
        useNativeDriver: true,
      })
    ).start();

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [fadeAnim, slideAnim, scaleAnim, rotateAnim, pulseAnim]);


  const handleStartNavigation = async () => {
    try {
      // Convert coordinates to decimal format for Google Maps
      const latitude = 28.484556; // 28°29'04.4"N converted to decimal
      const longitude = 77.008500; // 77°00'30.6"E converted to decimal
      
      // Create Google Maps navigation URL
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
      
      console.log('Opening navigation to:', latitude, longitude);
      await Linking.openURL(mapsUrl);
    } catch (error) {
      console.error('Error opening navigation:', error);
      // Fallback to regular maps URL
      try {
        await Linking.openURL('https://maps.app.goo.gl/8nyA6dVMEhS3XaK37');
      } catch (fallbackError) {
        console.error('Fallback navigation failed:', fallbackError);
      }
    }
  };

  const callLogoutAPI = async () => {
    // API removed - returning mock logout success
    console.log('🔄 Mock logout API call');
    
    // Simulate API response time
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('✅ Mock logout successful');
    return { 
      success: true, 
      message: 'Driver logged out successfully',
      shouldClearLocal: true
    };
  };

  const handleEndTrip = async () => {
    // Prevent multiple simultaneous logout attempts
    if (isLoggingOut) {
      console.log('⚠️ Logout already in progress, ignoring duplicate request');
      return;
    }
    
    // Show confirmation dialog
    Alert.alert(
      'End Trip',
      'Are you sure you want to end the current trip and logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'End Trip',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            
            try {
              console.log('=== STARTING LOGOUT PROCESS ===');
              
              // Get current session data for logging
              const sessionData = getSessionData();
              console.log('📊 Current session:', {
                isLoggedIn: sessionData.isLoggedIn,
                hasToken: !!sessionData.sessionToken,
                vehicleNumber: sessionData.assignment?.vehicle_number,
                driverLicense: sessionData.assignment?.driver_license,
              });
              
              // Call logout API - backend handles the logout logic
              console.log('🌐 Calling logout API...');
              const logoutResult = await callLogoutAPI();
              console.log('📥 Logout API result:', logoutResult);
              
              if (logoutResult.success) {
                // Backend confirmed logout was successful
                console.log('✅ Backend logout successful:', logoutResult.message);
                
                // Now clear local session data
                await logout();
                console.log('✅ Local session cleared');
                
                // Show success message
                Alert.alert(
                  'Logout Successful', 
                  logoutResult.message || 'You have been logged out successfully.',
                  [{ 
                    text: 'OK',
                    onPress: () => navigation.reset({ index: 0, routes: [{ name: 'DriverLogin' }] })
                  }]
                );
                
              } else {
                // Backend logout failed
                console.log('❌ Backend logout failed:', logoutResult.error);
                
                if (logoutResult.shouldClearLocal) {
                  // Backend says to clear local session anyway (e.g., invalid token)
                  console.log('⚠️ Clearing local session as instructed by backend response');
                  await logout();
                  
                  Alert.alert(
                    'Session Cleared', 
                    `${logoutResult.error}\n\nYour local session has been cleared.`,
                    [{ 
                      text: 'OK',
                      onPress: () => navigation.reset({ index: 0, routes: [{ name: 'DriverLogin' }] })
                    }]
                  );
                } else {
                  // Backend says don't clear - ask user what to do
                  Alert.alert(
                    'Logout Failed',
                    `${logoutResult.error}\n\nThe server could not process your logout request. Do you want to force logout locally?`,
                    [
                      {
                        text: 'Cancel',
                        style: 'cancel',
                        onPress: () => setIsLoggingOut(false)
                      },
                      {
                        text: 'Force Logout',
                        style: 'destructive',
                        onPress: async () => {
                          console.log('⚠️ User chose to force logout locally');
                          await logout();
                          console.log('✅ Local session force-cleared');
                          navigation.reset({ index: 0, routes: [{ name: 'DriverLogin' }] });
                        }
                      }
                    ]
                  );
                  return; // Don't reset isLoggingOut yet if user cancels
                }
              }
              
            } catch (error) {
              console.error('❌ Unexpected error during logout:', error);
              
              // Show error with option to force logout
              Alert.alert(
                'Logout Error',
                `An unexpected error occurred: ${error.message}\n\nDo you want to force logout locally?`,
                [
                  {
                    text: 'Cancel',
                    style: 'cancel',
                    onPress: () => setIsLoggingOut(false)
                  },
                  {
                    text: 'Force Logout',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await logout();
                        console.log('✅ Local session force-cleared after error');
                      } catch (logoutError) {
                        console.error('❌ Failed to clear local session:', logoutError);
                      }
                      navigation.reset({ index: 0, routes: [{ name: 'DriverLogin' }] });
                    }
                  }
                ]
              );
              return; // Don't reset isLoggingOut yet if user cancels
            } finally {
              // Reset logout state after process completes
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  };


  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const cardRotateXInterpolate = cardRotateX.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '15deg'],
  });

  const cardRotateYInterpolate = cardRotateY.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '15deg'],
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      
      {/* Animated Background */}
      <LinearGradient
        colors={['#000000', '#1a1a1a', '#2d2d2d', '#404040']}
        style={styles.backgroundGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Floating 3D Elements */}
        <Animated.View
          style={[
            styles.floatingElement,
            styles.element1,
            {
              transform: [
                { rotate: spin },
                { scale: pulseAnim },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.floatingElement,
            styles.element2,
            {
              transform: [
                { rotate: spin },
                { scale: pulseAnim },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.floatingElement,
            styles.element3,
            {
              transform: [
                { rotate: spin },
                { scale: pulseAnim },
              ],
            },
          ]}
        />

        {/* Main Content */}
        <Animated.View
          style={[
            styles.contentContainer,
            {
              opacity: fadeAnim,
              transform: [
                { translateY: slideAnim },
                { scale: scaleAnim },
              ],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Base Location</Text>
          </View>

          {/* Main Card with 3D Effect */}
          <Animated.View
            style={[
              styles.mainCard,
              {
                transform: [
                  { rotateX: cardRotateXInterpolate },
                  { rotateY: cardRotateYInterpolate },
                  { scale: cardScale },
                ],
              },
            ]}
            onTouchStart={() => {
              Animated.parallel([
                Animated.timing(cardRotateX, {
                  toValue: 1,
                  duration: 200,
                  useNativeDriver: true,
                }),
                Animated.timing(cardRotateY, {
                  toValue: 1,
                  duration: 200,
                  useNativeDriver: true,
                }),
                Animated.timing(cardScale, {
                  toValue: 1.02,
                  duration: 200,
                  useNativeDriver: true,
                }),
              ]).start();
            }}
            onTouchEnd={() => {
              Animated.parallel([
                Animated.timing(cardRotateX, {
                  toValue: 0,
                  duration: 200,
                  useNativeDriver: true,
                }),
                Animated.timing(cardRotateY, {
                  toValue: 0,
                  duration: 200,
                  useNativeDriver: true,
                }),
                Animated.timing(cardScale, {
                  toValue: 1,
                  duration: 200,
                  useNativeDriver: true,
                }),
              ]).start();
            }}
          >
            <LinearGradient
              colors={['#2d2d2d', '#1a1a1a']}
              style={styles.cardGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {/* Address Section */}
              <View style={styles.addressSection}>
                <Text style={styles.sectionTitle}>📍 Address</Text>
                <Text style={styles.addressText}>
                  5488/2927 & 5491/2928{'\n'}
                  Laxman Vihar{'\n'}
                  Gurgaon - 122006 (HR)
                </Text>
              </View>

              {/* Navigation Section */}
              <View style={styles.navigationSection}>
                <TouchableOpacity 
                  style={styles.navigationButton}
                  onPress={handleStartNavigation}
                >
                  <Image 
                    source={require('../assets/image/navigation.png')}
                    style={styles.navigationIcon}
                  />
                  <Text style={styles.navigationButtonText}>Start Navigation</Text>
                </TouchableOpacity>
              </View>

              {/* End Trip Section */}
              <View style={styles.endTripSection}>
                <TouchableOpacity 
                  style={styles.endTripButton}
                  onPress={handleEndTrip}
                >
                  <Text style={styles.endTripButtonText}>END TRIP</Text>
                  <Text style={styles.endTripArrow}>→</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </Animated.View>
        </Animated.View>
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  backgroundGradient: {
    flex: 1,
    position: 'relative',
  },
  floatingElement: {
    position: 'absolute',
    borderRadius: 50,
    opacity: 0.1,
  },
  element1: {
    width: 100,
    height: 100,
    backgroundColor: '#444444',
    top: height * 0.1,
    left: width * 0.1,
  },
  element2: {
    width: 80,
    height: 80,
    backgroundColor: '#555555',
    top: height * 0.6,
    right: width * 0.1,
  },
  element3: {
    width: 120,
    height: 120,
    backgroundColor: '#666666',
    bottom: height * 0.2,
    left: width * 0.2,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 40,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#b0b0b0',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  mainCard: {
    backgroundColor: '#2d2d2d',
    borderRadius: 24,
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 20,
    },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
    borderWidth: 1,
    borderColor: '#444444',
  },
  cardGradient: {
    borderRadius: 24,
    padding: 30,
  },
  addressSection: {
    marginBottom: 25,
  },
  navigationSection: {
    marginBottom: 25,
  },
  endTripSection: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 15,
    textAlign: 'center',
  },
  addressText: {
    fontSize: 18,
    color: '#e0e0e0',
    lineHeight: 28,
    textAlign: 'center',
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#1a4d2e',
    borderWidth: 1,
    borderColor: '#444444',
  },
  navigationButton: {
    backgroundColor: '#1a4d2e',
    paddingVertical: 20,
    paddingHorizontal: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#1a4d2e',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 2,
    borderColor: '#2d5a3d',
  },
  navigationIcon: {
    width: 24,
    height: 24,
    marginRight: 10,
    tintColor: 'white',
  },
  navigationButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  endTripButton: {
    backgroundColor: '#d32f2f',
    paddingVertical: 18,
    paddingHorizontal: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: 'row',
    shadowColor: '#d32f2f',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 2,
    borderColor: '#e57373',
  },
  endTripButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    letterSpacing: 1,
  },
  endTripArrow: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export default BaseScreen;
