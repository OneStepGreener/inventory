// Global Base URL Configuration
 export const GLOBAL_BASE_URL = 'http://192.168.5.9:5000/aiml/corporatewebsite';
// export const GLOBAL_BASE_URL = 'https://reactapp.tcil.in/aiml/corporatewebsite';

// App Configuration
export const APP_CONFIG = {
  // App branding
  APP_NAME: 'B2B Vehicle',
  APP_TAGLINE: 'Greener together',
  
  // Splash screen duration (in milliseconds)
  SPLASH_DURATION: 2000,
  
  // Validation rules
  VALIDATION: {
    VEHICLE_NUMBER_LENGTH: 10,
    DRIVING_LICENSE_LENGTH: 15,
    MIN_WEIGHT: 0.1,
    MAX_WEIGHT: 1000,
  },
  
  // Colors
  COLORS: {
    PRIMARY_BACKGROUND: '#1a1a1a',
    ACCENT_GREEN: '#1a4d2e',
    WHITE: '#ffffff',
    BLACK: '#000000',
    RED: '#ff0000',
    GRAY: '#666666',
    LIGHT_GRAY: '#f0f0f0',
  },
  
  // Mock data for development
  MOCK_DATA: {
    TASK_PROGRESS: {
      current: 1,
      total: 50,
    },
    SAMPLE_ADDRESS: 'H no 2-250, Mayavati nagar, Gurugram',
    SAMPLE_COORDINATES: {
      latitude: 28.4595,
      longitude: 77.0266,
    },
  },
  
  // Camera settings
  CAMERA: {
    QUALITY: 0.8,
    MAX_WIDTH: 2000,
    MAX_HEIGHT: 2000,
    ALLOW_EDITING: false,
    INCLUDE_BASE64: false,
  },
  
  // Geofence settings
  GEOFENCE: {
    DEFAULT_RADIUS: 100.0, // meters
    ENABLED: true,
    CHECK_ON_PICKUP_START: true,
    CHECK_ON_PICKUP_COMPLETION: true,
    LOCATION_TIMEOUT: 30000, // milliseconds - increased to 30 seconds
    HIGH_ACCURACY: false, // Disabled to allow 5-10m accuracy tolerance
    FALLBACK_ACCURACY: true, // Enable fallback to lower accuracy if high accuracy fails
    MAX_ACCEPTABLE_ACCURACY: 200.0, // Accept accuracy up to 200 meters
  },
};

// Geofence API base configuration (uses global base URL)
export const GEOFENCE_API_CONFIG = {
  // Use global base URL for consistency
  BASE_URL: GLOBAL_BASE_URL,
  // Toggle this to true for local development
  USE_LOCAL: true,
};

export const getGeofenceBaseUrl = () => {
  return GEOFENCE_API_CONFIG.BASE_URL;
};

// Dynamic API Configuration (uses global base URL)
export const getApiBaseUrl = () => {
  return `${GLOBAL_BASE_URL}/api`;
};

// API configuration removed - implement new APIs as needed
// export const API_CONFIG = {
//   BASE_URL: GLOBAL_BASE_URL,
//   ENDPOINTS: {
//     // All API endpoints removed - add new ones here
//   },
//   TIMEOUT: 30000, // 30 seconds default timeout
// };

// Navigation Configuration
export const NAVIGATION_CONFIG = {
  SCREENS: {
    SPLASH: 'Splash',
    DRIVER_LOGIN: 'DriverLogin',
    PICKUP_START: 'PickupStart',
    UPDATING_STATS: 'UpdatingStats',
    FINAL_PICKUP: 'FinalPickup',
  },
}; 