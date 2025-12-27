// React Native Location Service - Proper implementation for location handling
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import { APP_CONFIG } from '../utils/config'; // API config imports removed
import { getAuthHeaders } from '../frontendStore';

/**
 * Request location permission on Android
 * @returns {Promise<boolean>} - Whether permission is granted
 */
export const requestLocationPermission = async () => {
  if (Platform.OS === 'android') {
    try {
      console.log('📍 Requesting location permission (Android)...');

      // Check if permission is already granted
      const hasFineLocation = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );

      const hasCoarseLocation = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
      );

      if (hasFineLocation && hasCoarseLocation) {
        console.log('✅ Location permissions already granted');
        return true;
      }

      // Request permissions
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);

      console.log('Location permission results:', granted);

      const fineLocationGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
      const coarseLocationGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;

      if (fineLocationGranted || coarseLocationGranted) {
        console.log('✅ Location permission granted');
        return true;
      } else {
        console.log('❌ Location permission denied');
        return false;
      }
    } catch (err) {
      console.error('Location permission error:', err);
      return false;
    }
  } else {
    // iOS handles permissions differently - permission is requested when geolocation is first used
    console.log('📍 iOS - Location permission will be requested on first use');
    return true;
  }
};

/**
 * Get current location using React Native Geolocation with improved error handling
 * @returns {Promise<Object>} - Location data or error
 */
export const getCurrentLocation = () => {
  return new Promise(async (resolve) => {
    console.log('📍 Getting current location...');

    try {
      // Request permission first
      const hasPermission = await requestLocationPermission();
      
      if (!hasPermission) {
        resolve({
          success: false,
          error: 'Location permission denied. Please enable location services in settings.',
          code: 'PERMISSION_DENIED',
        });
        return;
      }

      // Import Geolocation dynamically
      const Geolocation = require('@react-native-community/geolocation').default;
      
      // Try multiple strategies in sequence
      await tryLocationStrategies(Geolocation, resolve);
      
    } catch (error) {
      console.error('❌ Geolocation service error:', error);
      resolve({
        success: false,
        error: 'Location service is not available on this device.',
        code: 'SERVICE_UNAVAILABLE',
      });
    }
  });
};

/**
 * Try different location strategies in sequence
 * @param {Object} Geolocation - Geolocation object
 * @param {Function} resolve - Promise resolve function
 */
const tryLocationStrategies = async (Geolocation, resolve) => {
  const strategies = [
    {
      name: 'Quick Network Location',
      options: {
        timeout: 8000, // 8 seconds - faster timeout
        maximumAge: 30000, // 30 seconds - accept older data
        enableHighAccuracy: false,
        distanceFilter: 50, // More tolerant distance filter
      }
    },
    {
      name: 'Medium Accuracy GPS',
      options: {
        timeout: 12000, // 12 seconds
        maximumAge: 15000, // 15 seconds
        enableHighAccuracy: false,
        distanceFilter: 20,
      }
    },
    {
      name: 'High Accuracy GPS',
      options: {
        timeout: 15000, // 15 seconds
        maximumAge: 10000, // 10 seconds
        enableHighAccuracy: true,
        distanceFilter: 0,
      }
    }
  ];

  // Append a final watch-based quick capture fallback
  const tryWatchFallback = async () => {
    console.log('📍 Trying WatchPosition quick fallback (approximate)...');
    const result = await tryWatchStrategy(Geolocation, {
      enableHighAccuracy: false,
      distanceFilter: 0,
      maximumAge: 60000, // accept up to 1 min old
      timeout: 8000, // used by some implementations
    }, 7000);
    return result;
  };

  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i];
    console.log(`📍 Trying strategy ${i + 1}: ${strategy.name}`);
    
    try {
      const result = await tryLocationStrategy(Geolocation, strategy);
      if (result.success) {
        console.log(`✅ Location retrieved successfully with ${strategy.name}`);
        resolve(result);
        return;
      } else {
        console.log(`❌ ${strategy.name} failed:`, result.error);
        if (i === strategies.length - 1) {
          // Before giving up, try watch fallback
          const watchResult = await tryWatchFallback();
          if (watchResult && watchResult.success) {
            console.log('✅ WatchPosition fallback succeeded');
            resolve(watchResult);
            return;
          }
          // Last strategy failed
          resolve({
            success: false,
            error: 'Unable to get location after trying all methods. Please check your GPS and network settings.',
            code: 'ALL_STRATEGIES_FAILED',
          });
        }
      }
    } catch (error) {
      console.error(`❌ ${strategy.name} error:`, error);
      if (i === strategies.length - 1) {
        // Before giving up, try watch fallback
        const watchResult = await tryWatchFallback();
        if (watchResult && watchResult.success) {
          console.log('✅ WatchPosition fallback succeeded');
          resolve(watchResult);
          return;
        }
        resolve({
          success: false,
          error: 'Location service encountered an error. Please try again.',
          code: 'SERVICE_ERROR',
        });
      }
    }
  }
};

/**
 * Try a single location strategy
 * @param {Object} Geolocation - Geolocation object
 * @param {Object} strategy - Strategy configuration
 * @returns {Promise<Object>} - Location result
 */
const tryLocationStrategy = (Geolocation, strategy) => {
  return new Promise((resolve) => {
    Geolocation.getCurrentPosition(
      (position) => {
        console.log('✅ Location retrieved successfully');
        console.log('Coordinates:', {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
        });

        resolve({
          success: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed || 0,
          timestamp: position.timestamp,
          strategy: strategy.name,
        });
      },
      (error) => {
        console.error(`❌ ${strategy.name} error:`, error);
        
        let errorMessage = 'Failed to get location';
        let errorCode = 'UNKNOWN_ERROR';

        switch (error.code) {
          case 1: // PERMISSION_DENIED
            errorMessage = 'Location permission denied. Please enable location services in settings.';
            errorCode = 'PERMISSION_DENIED';
            break;
          case 2: // POSITION_UNAVAILABLE
            errorMessage = 'Location information is unavailable. GPS may be disabled or signal is weak.';
            errorCode = 'POSITION_UNAVAILABLE';
            break;
          case 3: // TIMEOUT
            errorMessage = 'Location request timed out. GPS signal may be weak.';
            errorCode = 'TIMEOUT';
            break;
          default:
            errorMessage = 'An unknown error occurred while getting location.';
            errorCode = 'UNKNOWN_ERROR';
            break;
        }

        resolve({
          success: false,
          error: errorMessage,
          code: errorCode,
        });
      },
      strategy.options
    );
  });
};

/**
 * Quick watchPosition fallback to try grabbing any recent position within a short window
 * @param {Object} Geolocation
 * @param {Object} options - watch options
 * @param {number} windowMs - how long to wait for an update before giving up
 * @returns {Promise<Object>} result
 */
const tryWatchStrategy = (Geolocation, options, windowMs = 7000) => {
  return new Promise((resolve) => {
    let resolved = false;
    let watchId = null;
    const cleanup = () => {
      if (watchId != null) {
        try { Geolocation.clearWatch(watchId); } catch (e) {}
        watchId = null;
      }
    };

    try {
      watchId = Geolocation.watchPosition(
        (position) => {
          if (resolved) return;
          resolved = true;
          cleanup();
          resolve({
            success: true,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed || 0,
            timestamp: position.timestamp,
            strategy: 'WatchPosition Fallback',
          });
        },
        (error) => {
          if (resolved) return;
          // Do not resolve immediately; wait for window unless it's permission denied
          if (error && error.code === 1) { // PERMISSION_DENIED
            resolved = true;
            cleanup();
            resolve({ success: false, error: 'Location permission denied.', code: 'PERMISSION_DENIED' });
          }
        },
        options
      );
    } catch (e) {
      resolved = true;
      cleanup();
      resolve({ success: false, error: 'watchPosition not available', code: 'WATCH_UNAVAILABLE' });
      return;
    }

    // Give it a short window to capture any update
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve({ success: false, error: 'No position update in time window', code: 'WATCH_TIMEOUT' });
    }, windowMs);
  });
};

/**
 * Check GPS status and availability
 * @returns {Promise<Object>} - GPS status result
 */
export const checkGPSStatus = async () => {
  try {
    console.log('🔍 Checking GPS status...');
    
    const Geolocation = require('@react-native-community/geolocation').default;
    
    return new Promise((resolve) => {
      // Try a quick location check with very short timeout
      Geolocation.getCurrentPosition(
        (position) => {
          console.log('✅ GPS is working and location is available');
          resolve({
            success: true,
            message: 'GPS is working properly',
            hasLocation: true,
            accuracy: position.coords.accuracy,
          });
        },
        (error) => {
          console.log('⚠️ GPS status check error:', error);
          
          let status = {
            success: false,
            hasLocation: false,
            message: 'GPS status unknown',
            error: error.code,
          };
          
          switch (error.code) {
            case 1: // PERMISSION_DENIED
              status.message = 'Location permission denied';
              status.code = 'PERMISSION_DENIED';
              break;
            case 2: // POSITION_UNAVAILABLE
              status.message = 'GPS is disabled or no signal';
              status.code = 'GPS_DISABLED';
              break;
            case 3: // TIMEOUT
              status.message = 'GPS signal is weak or unavailable';
              status.code = 'GPS_WEAK';
              break;
            default:
              status.message = 'GPS status unknown';
              status.code = 'UNKNOWN';
              break;
          }
          
          resolve(status);
        },
        {
          timeout: 5000, // Very short timeout for status check
          maximumAge: 60000, // Accept older location data
          enableHighAccuracy: false, // Don't require high accuracy for status check
          distanceFilter: 1000, // Large distance filter for status check
        }
      );
    });
  } catch (error) {
    console.error('❌ GPS status check error:', error);
    return {
      success: false,
      message: 'Failed to check GPS status',
      code: 'CHECK_FAILED',
    };
  }
};

/**
 * Check if location services are available and enabled
 * @returns {Promise<Object>} - Result with success status and error message if any
 */
export const checkLocationServicesReady = async () => {
  try {
    console.log('🔍 Checking location services...');

    // Request permission first
    const hasPermission = await requestLocationPermission();
    
    if (!hasPermission) {
      return {
        success: false,
        error: 'Location permission is required for geofence validation. Please enable it in settings.',
        code: 'PERMISSION_DENIED',
      };
    }

    // Check GPS status first
    const gpsStatus = await checkGPSStatus();
    console.log('GPS Status:', gpsStatus);
    
  if (!gpsStatus.success) {
      if (gpsStatus.code === 'PERMISSION_DENIED') {
        return {
          success: false,
          error: 'Location permission denied. Please enable location services in settings.',
          code: 'PERMISSION_DENIED',
        };
      } else if (gpsStatus.code === 'GPS_DISABLED') {
        // GPS fully disabled – cannot proceed
        return {
          success: false,
          error: 'GPS is disabled. Please enable GPS in your device settings.',
          code: 'GPS_DISABLED',
        };
      } else if (gpsStatus.code === 'GPS_WEAK') {
        // Allow proceeding if fallback accuracy is permitted by app config
        if (APP_CONFIG?.GEOFENCE?.FALLBACK_ACCURACY) {
          console.log('⚠️ GPS weak, but allowing fallback accuracy as per configuration');
          return {
            success: true,
            gpsStatus,
            fallbackAllowed: true,
          };
        }
        return {
          success: false,
          error: 'GPS signal is weak. Please move to an area with better GPS signal.',
          code: 'GPS_WEAK',
        };
      }
    }

    console.log('✅ Location services are ready');
    return {
      success: true,
      gpsStatus: gpsStatus,
    };
  } catch (error) {
    console.error('❌ Error checking location services:', error);
    return {
      success: false,
      error: 'Failed to check location services.',
      code: 'CHECK_FAILED',
    };
  }
};

/**
 * Check if device might be indoors or have poor GPS conditions
 * @param {Object} position - GPS position object
 * @returns {Object} - Indoor/poor signal assessment
 */
export const assessGPSConditions = (position) => {
  if (!position || !position.coords) {
    return {
      isIndoors: false,
      signalQuality: 'unknown',
      message: 'Unable to assess GPS conditions'
    };
  }

  const accuracy = position.coords.accuracy;
  const altitude = position.coords.altitude;
  const speed = position.coords.speed;

  let isIndoors = false;
  let signalQuality = 'good';
  let message = 'GPS signal is good';

  // Assess based on accuracy - more tolerant for geofence purposes
  if (accuracy > 200) {
    signalQuality = 'poor';
    isIndoors = true;
    message = 'GPS signal is very weak - you might be indoors or in a basement';
  } else if (accuracy > 100) {
    signalQuality = 'fair';
    message = 'GPS signal is weak - try moving to an open area';
  } else if (accuracy > 50) {
    signalQuality = 'good';
    message = 'GPS signal is acceptable for geofence checking';
  } else if (accuracy > 20) {
    signalQuality = 'very good';
    message = 'GPS signal is good';
  } else {
    signalQuality = 'excellent';
    message = 'GPS signal is excellent';
  }

  // Additional checks for indoor conditions
  if (altitude !== null && altitude < 0) {
    isIndoors = true;
    message += ' - You appear to be below ground level';
  }

  if (speed !== null && speed === 0 && accuracy > 100) {
    isIndoors = true;
    message += ' - Stationary with very poor accuracy suggests indoor location';
  }

  return {
    isIndoors,
    signalQuality,
    message,
    accuracy,
    altitude,
    speed
  };
};

/**
 * Show an alert for location permission/services issues
 * @param {string} errorMessage - Error message to display
 * @param {string} errorCode - Error code (PERMISSION_DENIED, SERVICES_DISABLED, etc.)
 */
export const showLocationErrorAlert = (errorMessage, errorCode) => {
  let title = 'Location Error';
  let message = errorMessage;
  let buttons = [{ text: 'OK' }];

  if (errorCode === 'PERMISSION_DENIED') {
    title = 'Location Permission Required';
    message = 'This app needs location permission to validate your pickup location. Please enable it in your device settings.';
    buttons = [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Open Settings', 
        onPress: () => {
          // On Android, this will open the app settings
          if (Platform.OS === 'android') {
            // You can use Linking to open settings if needed
            console.log('Open app settings for location permission');
          }
        }
      },
    ];
  } else if (errorCode === 'SERVICES_DISABLED') {
    title = 'Location Services Disabled';
    message = 'Please enable location/GPS in your device settings to use geofence validation.';
  } else if (errorCode === 'GPS_DISABLED') {
    title = 'GPS Disabled';
    message = 'GPS is disabled on your device. Please enable GPS in your device settings.';
  } else if (errorCode === 'GPS_WEAK') {
    title = 'GPS Signal Weak';
    message = 'GPS signal is weak or unavailable. Please move to an open area with better GPS signal.';
  }

  Alert.alert(title, message, buttons);
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude 1
 * @param {number} lon1 - Longitude 1
 * @param {number} lat2 - Latitude 2
 * @param {number} lon2 - Longitude 2
 * @returns {number} - Distance in meters
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance;
};

/**
 * Format distance for display
 * @param {number} distance - Distance in meters
 * @returns {string} - Formatted distance string
 */
export const formatDistance = (distance) => {
  if (distance < 1000) {
    return `${Math.round(distance)}m`;
  } else {
    return `${(distance / 1000).toFixed(2)}km`;
  }
};

/**
 * Check if GPS accuracy is acceptable for geofence checking
 * @param {number} accuracy - GPS accuracy in meters
 * @returns {boolean} - Whether accuracy is acceptable
 */
export const isAccuracyAcceptableForGeofence = (accuracy) => {
  // Accept accuracy up to 200 meters for geofence checking
  // This allows for broader tolerance as requested
  return accuracy <= 200.0;
};

/**
 * Background location tracking state
 */
let locationTrackingInterval = null;
let isLocationTrackingActive = false;

/**
 * Start periodic location tracking
 * @param {Object} driverData - Driver information (dl_number, vehicle_no)
 * @param {number} intervalMs - Interval in milliseconds (default 120000 = 2 minutes)
 * @returns {Object} - Tracking status
 */
export const startPeriodicLocationTracking = (driverData, intervalMs = 120000) => {
  console.log('🔄 Starting periodic location tracking...');
  console.log('📍 Update interval:', intervalMs, 'ms (', intervalMs / 60000, 'minutes )');
  console.log('📍 Driver data:', JSON.stringify(driverData, null, 2));

  // Stop any existing tracking first
  stopPeriodicLocationTracking();

  // Start periodic tracking
  isLocationTrackingActive = true;
  
  // Send first update immediately
  sendLocationUpdate(driverData, 'periodic')
    .then(result => {
      console.log('📍 Initial location update result:', result.success ? '✅ Success' : '❌ Failed');
    })
    .catch(error => {
      console.error('❌ Initial location update error:', error);
    });

  // Set up interval for periodic updates
  locationTrackingInterval = setInterval(async () => {
    if (!isLocationTrackingActive) {
      console.log('⚠️ Location tracking is no longer active, skipping update');
      return;
    }

    console.log('📍 Sending periodic location update...');
    try {
      const result = await sendLocationUpdate(driverData, 'periodic');
      if (result.success) {
        console.log('✅ Periodic location update successful');
        console.log('📍 Pickup ID:', result.pickup_id);
        console.log('📍 Timestamp:', result.timestamp);
      } else {
        console.log('⚠️ Periodic location update failed:', result.error);
      }
    } catch (error) {
      console.error('❌ Error in periodic location update:', error);
    }
  }, intervalMs);

  console.log('✅ Periodic location tracking started');
  return {
    success: true,
    message: 'Periodic location tracking started',
    intervalMs: intervalMs,
  };
};

/**
 * Stop periodic location tracking
 * @returns {Object} - Stop status
 */
export const stopPeriodicLocationTracking = () => {
  console.log('🛑 Stopping periodic location tracking...');
  
  if (locationTrackingInterval) {
    clearInterval(locationTrackingInterval);
    locationTrackingInterval = null;
    console.log('✅ Location tracking interval cleared');
  }
  
  isLocationTrackingActive = false;
  console.log('✅ Periodic location tracking stopped');
  
  return {
    success: true,
    message: 'Periodic location tracking stopped',
  };
};

/**
 * Check if location tracking is currently active
 * @returns {boolean} - Whether tracking is active
 */
export const isTrackingActive = () => {
  return isLocationTrackingActive;
};

/**
 * Test location update connectivity and data format
 * @param {Object} driverData - Driver information (dl_number, vehicle_no)
 * @returns {Promise<Object>} - Diagnostic results
 */
export const testLocationUpdateConnectivity = async (driverData) => {
  console.log('🔧 ===== TESTING LOCATION UPDATE =====');
  console.log('🔧 Driver data received:', JSON.stringify(driverData, null, 2));
  
  const diagnostics = {
    steps: [],
    success: false,
  };
  
  // Step 1: Validate driver data
  if (!driverData || !driverData.dl_number || !driverData.vehicle_no) {
    diagnostics.steps.push({
      step: 'Driver Data Validation',
      status: 'FAILED',
      message: 'Missing dl_number or vehicle_no',
      data: driverData,
    });
    console.log('❌ Driver data validation failed');
    return diagnostics;
  }
  diagnostics.steps.push({
    step: 'Driver Data Validation',
    status: 'PASSED',
    message: 'Driver data is valid',
  });
  console.log('✅ Driver data validation passed');
  
  // Step 2: Test location services
  try {
    const locationResult = await getCurrentLocation();
    if (locationResult.success) {
      diagnostics.steps.push({
        step: 'GPS Location',
        status: 'PASSED',
        message: 'GPS location retrieved successfully',
        data: {
          latitude: locationResult.latitude,
          longitude: locationResult.longitude,
          accuracy: locationResult.accuracy,
        },
      });
      console.log('✅ GPS location retrieved');
    } else {
      diagnostics.steps.push({
        step: 'GPS Location',
        status: 'FAILED',
        message: locationResult.error,
        code: locationResult.code,
      });
      console.log('❌ GPS location failed:', locationResult.error);
      return diagnostics;
    }
  } catch (error) {
    diagnostics.steps.push({
      step: 'GPS Location',
      status: 'FAILED',
      message: error.message,
    });
    return diagnostics;
  }
  
  // Step 3: Test API connectivity
  try {
    // API removed - mock connectivity test
    diagnostics.steps.push({
      step: 'API URL',
      status: 'INFO',
      message: 'Mock API - No real endpoint configured',
    });
    console.log('🔧 Mock API test');
    
    // Test a simple request
    const result = await sendLocationUpdate(driverData, 'periodic');
    if (result.success) {
      diagnostics.steps.push({
        step: 'API Request',
        status: 'PASSED',
        message: 'Location update successful',
        response: result,
      });
      diagnostics.success = true;
      console.log('✅ API request successful');
    } else {
      diagnostics.steps.push({
        step: 'API Request',
        status: 'FAILED',
        message: result.error,
        code: result.code,
      });
      console.log('❌ API request failed:', result.error);
    }
  } catch (error) {
    diagnostics.steps.push({
      step: 'API Request',
      status: 'FAILED',
      message: error.message,
    });
  }
  
  console.log('🔧 ===== TEST RESULTS =====');
  console.log(JSON.stringify(diagnostics, null, 2));
  console.log('🔧 =========================');
  
  return diagnostics;
};

/**
 * Send real-time location update to backend
 * @param {Object} driverData - Driver information (dl_number, vehicle_no)
 * @param {string} eventType - Event type (periodic, navigation_start, pickup_start, etc.)
 * @returns {Promise<Object>} - Result of location update
 */
export const sendLocationUpdate = async (driverData, eventType = 'periodic') => {
  try {
    console.log('📍 ===== LOCATION UPDATE STARTED =====');
    console.log('📍 Event type:', eventType);
    console.log('📍 Driver data:', JSON.stringify(driverData, null, 2));
    console.log('📍 Timestamp:', new Date().toISOString());
    console.log('📍 ===================================');
    
    // Validate driver data first
    if (!driverData) {
      console.error('❌ Driver data is null or undefined');
      return {
        success: false,
        error: 'Driver data is required',
        code: 'MISSING_DRIVER_DATA',
      };
    }
    
    if (!driverData.dl_number) {
      console.error('❌ dl_number is missing from driver data');
      return {
        success: false,
        error: 'Driver license number (dl_number) is required',
        code: 'MISSING_DL_NUMBER',
      };
    }
    
    if (!driverData.vehicle_no) {
      console.error('❌ vehicle_no is missing from driver data');
      return {
        success: false,
        error: 'Vehicle number (vehicle_no) is required',
        code: 'MISSING_VEHICLE_NO',
      };
    }

    // Get current location
    console.log('📍 Getting current GPS location...');
    const locationResult = await getCurrentLocation();
    
    if (!locationResult.success) {
      console.error('❌ Failed to get current location:', locationResult.error);
      console.error('❌ Error code:', locationResult.code);
      return {
        success: false,
        error: locationResult.error,
        code: locationResult.code,
      };
    }

    console.log('✅ GPS location retrieved successfully');
    console.log('📍 Location details:', JSON.stringify({
      latitude: locationResult.latitude,
      longitude: locationResult.longitude,
      accuracy: locationResult.accuracy,
      speed: locationResult.speed,
      strategy: locationResult.strategy
    }, null, 2));

    // Prepare location data with proper speed handling
    const speed = locationResult.speed !== null && locationResult.speed !== undefined 
      ? locationResult.speed 
      : 0;
    
    const locationData = {
      dl_number: driverData.dl_number,
      vehicle_no: driverData.vehicle_no,
      latitude: locationResult.latitude,
      longitude: locationResult.longitude,
      event_type: eventType,
      speed: speed,
      is_moving: speed > 0,
    };

    console.log('📍 ===== SENDING TO BACKEND =====');
    console.log('📍 Location data to send:', JSON.stringify(locationData, null, 2));

    // API removed - mock location update success
    console.log('🔄 Mock location update API call');
    
    // Simulate API response time
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Mock successful response
    const data = {
      success: true,
      status: 'success',
      message: 'Location updated successfully',
      pickup_id: 'mock_pickup_001',
      timestamp: new Date().toISOString()
    };
    
    console.log('✅ Mock location updated successfully');
    console.log('✅ Mock response details:', {
      message: data.message,
      pickup_id: data.pickup_id,
      timestamp: data.timestamp
    });
    
    return {
      success: true,
      message: data.message || 'Location updated successfully',
      pickup_id: data.pickup_id,
      timestamp: data.timestamp,
      data: data,
    };
  } catch (error) {
    console.error('❌ Location update error:', error);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    
    if (error.name === 'AbortError') {
      console.error('❌ Request timed out after 10 seconds');
      return { success: false, error: 'Request timed out' };
    }
    
    if (error.message.includes('Network request failed')) {
      console.error('❌ Network request failed - server might be unreachable');
      return { success: false, error: 'Network error. Please check your connection.' };
    }
    
    if (error.message.includes('Failed to fetch')) {
      console.error('❌ Fetch failed - check if server is running');
      return { success: false, error: 'Cannot connect to server. Please check if the server is running.' };
    }
    
    console.error('❌ Unknown error occurred');
    return { success: false, error: `Network error: ${error.message}` };
  }
};
