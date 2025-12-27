import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Alert,
  Linking,
  Image,
  ActivityIndicator,
} from 'react-native';
import { getCurrentPickupDetails, getPickupProgress, startCurrentPickup, ensureValidSession, setCurrentPage, updateAppState, getSessionData, getAllStops, moveToNextPickup, markCurrentPickupCompleted, autoStartTripAPI } from '../frontendStore';
// Geofence service removed
import { checkLocationServicesReady, showLocationErrorAlert, sendLocationUpdate, startPeriodicLocationTracking } from '../services/locationService';
import { APP_CONFIG } from '../utils/config';
import { t, getCurrentLanguage, subscribeToLanguageChanges } from '../utils/translations';
import { useLanguage } from '../contexts/LanguageContext';

const { width, height } = Dimensions.get('window');

const PickupStartScreen = ({ navigation, route }) => {
  const [pickupDetails, setPickupDetails] = useState(null);
  const [progress, setProgress] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingLocation, setIsSendingLocation] = useState(false);
  const { currentLanguage, forceUpdate, updateTrigger } = useLanguage();
  const [refreshKey, setRefreshKey] = useState(0);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    loadPickupData();
    // Set current page when component mounts
    setCurrentPage('pickup_start').catch(console.error);
    
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Subscribe to language changes
  useEffect(() => {
    console.log('🔄 PickupStartScreen: Subscribing to language changes');
    const unsubscribe = subscribeToLanguageChanges((newLang) => {
      console.log('🔄 PickupStartScreen: Language changed to:', newLang);
      setRefreshKey(prev => prev + 1); // Force re-render
    });
    
    return () => {
      console.log('🔄 PickupStartScreen: Unsubscribing from language changes');
      unsubscribe();
    };
  }, []);

  const loadPickupData = async () => {
    try {
      if (isMounted.current) {
        setIsLoading(true);
      }
      
      // Check if session is still valid
      if (!ensureValidSession()) {
        if (isMounted.current) {
          Alert.alert('Session Expired', 'Your session has expired. Please login again.');
          navigation.navigate('DriverLogin');
        }
        return;
      }
      
      // Get current pickup details
      const details = await getCurrentPickupDetails();
      const progressData = await getPickupProgress();
      
      if (!isMounted.current) return;
      
      if (details) {
        setPickupDetails(details);
        setProgress(progressData);
      } else {
        Alert.alert('Error', 'No pickup data found. Please login again.');
        navigation.navigate('DriverLogin');
      }
    } catch (error) {
      console.error('Error loading pickup data:', error);
      if (isMounted.current) {
        Alert.alert('Error', 'Failed to load pickup data. Please try again.');
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  };

  const handleStartNavigation = async () => {
    console.log('🚀 ========================================');
    console.log('🚀 START NAVIGATION CLICKED');
    console.log('🚀 ========================================');
    
    if (!pickupDetails) {
      console.log('❌ No pickup details');
      return;
    }
    
    setIsSendingLocation(true);
    
    try {
      // Get session data
      const sessionData = getSessionData();
      console.log('📍 Getting session data...');
      
      if (!sessionData || !sessionData.assignment) {
        console.log('❌ No session data');
        setIsSendingLocation(false);
        await openNavigationApp();
        return;
      }
      
      // Prepare driver data for multi-pickup system
      const driverData = {
        dl_number: sessionData.assignment.driver_dl,
        vehicle_no: sessionData.assignment.vehicle_no,
      };
      
      console.log('📍 Driver data:', JSON.stringify(driverData));
      
      if (!driverData.dl_number || !driverData.vehicle_no) {
        console.log('❌ Missing dl_number or vehicle_no');
        setIsSendingLocation(false);
        await openNavigationApp();
        return;
      }
      
      // Call sendLocationUpdate (EXACTLY like test button)
      console.log('📍 Calling sendLocationUpdate NOW...');
      const result = await sendLocationUpdate(driverData, 'navigation_start');
      console.log('📍 sendLocationUpdate returned:', JSON.stringify(result));
      
      setIsSendingLocation(false);
      
      // Check result
      if (result && result.success) {
        console.log('✅ ===== SUCCESS - DATA SAVED TO DATABASE =====');
        console.log('✅ Pickup ID:', result.pickup_id);
        console.log('✅ Timestamp:', result.timestamp);
        console.log('✅ ============================================');
      } else {
        console.log('❌ ===== FAILED - DATA NOT SAVED =====');
        console.log('❌ Result:', JSON.stringify(result));
        console.log('❌ Error:', result?.error);
        console.log('❌ ===================================');
      }
      
      // Always open navigation
      await openNavigationApp();
      
    } catch (error) {
      console.error('❌ Exception:', error.message);
      setIsSendingLocation(false);
      await openNavigationApp();
    }
    
    console.log('🚀 ========================================');
    console.log('🚀 END START NAVIGATION');
    console.log('🚀 ========================================');
  };

  const openNavigationApp = async () => {
    if (!pickupDetails) return;
    
    console.log('🗺️ Opening navigation app...');
    console.log('🗺️ Destination:', pickupDetails.address);
    console.log('🗺️ Coordinates:', pickupDetails.latitude, pickupDetails.longitude);
    
    try {
      // Use Google Maps URL from API if available, otherwise create one with coordinates
      const url = pickupDetails.google_maps_url || 
                 `https://www.google.com/maps/search/?api=1&query=${pickupDetails.latitude},${pickupDetails.longitude}`;
      
      console.log('🗺️ Opening URL:', url);
      
      // Try to open Google Maps directly
      await Linking.openURL(url);
      
      console.log('✅ Navigation app opened successfully');
      
      // Update app state to track navigation started
      const appStateData = {
        current_page: 'pickup_start',
        navigation_started: true,
        completed_steps: ['navigation'],
        last_activity: new Date().toISOString(),
      };
      
      try {
        await updateAppState(appStateData);
        console.log('✅ App state updated: Navigation started');
      } catch (error) {
        console.log('⚠️ Failed to update app state:', error);
        // Don't block navigation if app state update fails
      }
    } catch (error) {
      console.log('⚠️ Failed to open Google Maps app, trying browser...');
      // If Google Maps app fails, try opening in browser
      try {
        const browserUrl = `https://maps.google.com/maps?q=${pickupDetails.latitude},${pickupDetails.longitude}`;
        console.log('🗺️ Opening in browser:', browserUrl);
        await Linking.openURL(browserUrl);
        
        console.log('✅ Navigation opened in browser');
        
        // Update app state even if opened in browser
        const appStateData = {
          current_page: 'pickup_start',
          navigation_started: true,
          completed_steps: ['navigation'],
          last_activity: new Date().toISOString(),
        };
        
        try {
          await updateAppState(appStateData);
          console.log('✅ App state updated: Navigation started (browser)');
        } catch (error) {
          console.log('⚠️ Failed to update app state:', error);
        }
      } catch (browserError) {
        console.error('❌ Failed to open navigation:', browserError);
        Alert.alert(
          'Navigation Error',
          'Failed to open navigation. Please try again.',
          [{ text: 'OK' }]
        );
      }
    }
  };

  const handleStartPickup = async () => {
    console.log('🚀 ===== START PICKUP BUTTON CLICKED =====');
    console.log('🚀 handleStartPickup function called');
    console.log('🚀 Geofence enabled:', APP_CONFIG.GEOFENCE.ENABLED);
    console.log('🚀 Check on pickup start:', APP_CONFIG.GEOFENCE.CHECK_ON_PICKUP_START);
    console.log('🚀 =========================================');
    
    try {
      // Geofence check removed - proceed directly to start pickup
      console.log('🚀 Geofence check disabled, proceeding to start pickup');
      
      // Start pickup timing and trip on server
      console.log('🚀 ===== STARTING TRIP ON SERVER =====');
      console.log('🚀 Calling auto-start-trip API...');
      const startResult = await startCurrentPickup();
      
      if (startResult.success) {
        console.log('✅ Trip started successfully on server');
        console.log('✅ Message:', startResult.message);

        // Navigate immediately to UpdatingStats; do not block on location calls
        navigation.navigate('UpdatingStats', { pickupDetails, progress });

        // Fire-and-forget: start tracking and send initial event without blocking navigation
        try {
          const sessionData = getSessionData();
          if (sessionData && sessionData.assignment) {
            const driverData = { dl_number: sessionData.assignment.driver_dl, vehicle_no: sessionData.assignment.vehicle_no };
            setTimeout(() => {
              try { startPeriodicLocationTracking(driverData, 120000); } catch {}
            }, 0);
            setTimeout(async () => {
              try { await sendLocationUpdate(driverData, 'pickup_start'); } catch {}
            }, 0);
          }
        } catch {}
      } else {
        console.error('❌ Failed to start trip on server:', startResult.error);
        Alert.alert(
          'Failed to Start Trip', 
          startResult.error || 'Unable to start trip on server. Please try again.',
          [
            {
              text: 'Retry',
              onPress: () => handleStartPickup()
            },
            {
              text: 'Cancel',
              style: 'cancel'
            }
          ]
        );
      }
    } catch (error) {
      console.error('❌ Error in handleStartPickup:', error);
      Alert.alert('Error', `Failed to start pickup: ${error.message || 'Unknown error'}`);
    }
  };

  // Show loading screen
  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
        <ActivityIndicator size="large" color="#1a4d2e" />
        <Text style={styles.loadingText}>{t('loading')} pickup details...</Text>
      </View>
    );
  }

  // Show error if no pickup data
  if (!pickupDetails) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
        <Text style={styles.errorText}>No pickup data available</Text>
        <TouchableOpacity 
          style={styles.retryButton} 
          onPress={loadPickupData}
        >
          <Text style={styles.retryText}>{t('retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      
      {/* Task progress in left corner of screen */}
      <View style={styles.taskProgressContainer}>
        <View style={styles.taskProgress}>
          <Text style={styles.currentTask}>
            {String(progress?.current || 1).padStart(2, '0')}
          </Text>
          <Text style={styles.totalTasks}>
            {' /' + String(progress?.total || 1).padStart(2, '0')}
          </Text>
        </View>
      </View>
      
      {/* Date in right corner of screen */}
      <View style={styles.dateContainer}>
        <Text style={styles.dateText}>
          {(() => {
            // Get the date from pickup details or use current date
            const dateStr = pickupDetails.nextPickupDate || new Date().toISOString();
            const date = new Date(dateStr);
            
            // Format date as "28 Oct, Mon"
            const day = date.getDate().toString().padStart(2, '0');
            const month = date.toLocaleDateString('en-US', { month: 'short' });
            const weekDay = date.toLocaleDateString('en-US', { weekday: 'short' });
            
            return `${day} ${month}, ${weekDay}`;
          })()}
        </Text>
      </View>
      
      {/* Main white card - Square */}
      <View style={styles.mainCard}>
        
        {/* Customer name and pickup info */}
        <View style={styles.customerSection}>
          <Text style={styles.customerName}>{pickupDetails.customerName}</Text>
          <Text style={styles.pickupSequence}>
            Stop {pickupDetails.pickupIndex} of {pickupDetails.totalPickups}
          </Text>
          {pickupDetails.contact && (
            <Text style={styles.contactText}>{pickupDetails.contact}</Text>
          )}
        </View>

        {/* Address section */}
        <View style={styles.addressSection}>
          <Text style={styles.addressTitle}>{t('address')}</Text>
          <Text style={styles.addressText}>{pickupDetails.address}</Text>
          {(pickupDetails.city || pickupDetails.pincode) && (
            <Text style={styles.locationText}>
              {pickupDetails.city && pickupDetails.city}
              {pickupDetails.city && pickupDetails.pincode && ', '}
              {pickupDetails.pincode && pickupDetails.pincode}
            </Text>
          )}
          {pickupDetails.notes && (
            <Text style={styles.notesText}>
              Note: {pickupDetails.notes}
            </Text>
          )}
        </View>

        {/* Start Navigation button - Centered */}
        <TouchableOpacity 
          style={[styles.navigationButton, isSendingLocation && styles.buttonDisabled]} 
          onPress={handleStartNavigation}
          disabled={isSendingLocation}
        >
          {isSendingLocation ? (
            <>
              <ActivityIndicator size="small" color="white" />
              <Text style={[styles.navigationText, { marginLeft: 10 }]}>Tracking Location...</Text>
            </>
          ) : (
            <>
              <Text style={styles.navigationText}>{t('startNavigation')}</Text>
              <Image 
                source={require('../assets/image/navigation.png')}
                style={styles.navigationIcon}
              />
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Start Pickup button */}
      <TouchableOpacity 
        style={styles.startPickupButton} 
        onPress={handleStartPickup}
      >
        <Text style={styles.startPickupText}>{t('startPickup')}</Text>
        <Text style={styles.arrowIcon}>→</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 20,
    justifyContent: 'center', // Center content vertically
    alignItems: 'center', // Center content horizontally
    position: 'relative', // For absolute positioning
  },
  mainCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 25,
    height: width * 0.85, // Make it square based on screen width
    width: width * 0.85, // Make it square based on screen width
    justifyContent: 'center', // Center content vertically
    alignItems: 'center', // Center content horizontally
    position: 'relative', // For absolute positioning of date
  },
  taskProgressContainer: {
    position: 'absolute',
    left: 20,
    top: 60,
    zIndex: 10,
  },
  taskProgress: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  currentTask: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  totalTasks: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '400',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  customerSection: {
    marginBottom: 12,
  },
  customerName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  pickupSequence: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1a4d2e',
    marginTop: 4,
    textAlign: 'center',
  },
  contactText: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  addressSection: {
    marginVertical: 15,
    alignItems: 'center',
  },
  addressTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 10,
    textAlign: 'center',
  },
  addressText: {
    fontSize: 14,
    color: '#1a1a1a',
    lineHeight: 20,
    textAlign: 'center',
  },
  locationText: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  notesText: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
    fontStyle: 'italic',
    textAlign: 'center',
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#1a4d2e',
  },
  customerIdText: {
    fontSize: 12,
    color: '#888',
    marginTop: 5,
    fontFamily: 'monospace',
  },
  dateContainer: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    zIndex: 10,
  },
  dateText: {
    fontSize: 16,
    color: '#000000',
    fontWeight: 'bold',
    textAlign: 'right',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    fontSize: 16,
    marginTop: 10,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#1a4d2e',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  navigationButton: {
    backgroundColor: '#1a4d2e',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
  },
  navigationText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 8,
  },
  navigationIcon: {
    width: 20,
    height: 20,
    tintColor: 'white',
  },
  startPickupButton: {
    backgroundColor: '#000000', // Black background
    borderRadius: 8,
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 15, // Reduced space since test button is above
    width: width * 0.85, // Match card width
  },
  startPickupText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  arrowIcon: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default PickupStartScreen; 