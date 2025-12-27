// Frontend-only in-memory store to simulate app flow without any backend
// All API calls removed - implement new APIs as needed
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GLOBAL_BASE_URL } from './utils/config';

// Mock connectivity test function - replace with real API when needed
export const testServerConnection = async () => {
  // API removed - returning mock success
  console.log('🔄 Mock server connection test');
  return { success: true, status: 200 };
};

const session = {
  isLoggedIn: false,
  assignment: null,
  pickup: null, // Current pickup details
  stops: [], // All stops/pickups in the assignment
  totals: { current: 1, total: 1 },
  started: false,
  completed: false,
  sessionToken: null,
  tokenExpiresAt: null,
  appState: {
    currentPage: null,
    navigationStarted: false,
    pickupFormData: {},
    completedSteps: [],
    lastActivity: null,
  },
};

export const loginV2 = async (vehicleNumber, drivingLicense) => {
  // New multi-pickup API implementation
  console.log('🔄 Multi-pickup login attempt:', { vehicle_no: vehicleNumber, driver_dl: drivingLicense });
  
  const controller = new AbortController();
  const TIMEOUT_DURATION = 30000; // 30 seconds
  const API_URL = `${GLOBAL_BASE_URL}/multi-pickup/today-assignment`;
  
  console.log(`Making request to: ${API_URL}`);
  console.log(`Timeout set to: ${TIMEOUT_DURATION}ms`);
  console.log('Request payload:', { vehicle_no: vehicleNumber, driver_dl: drivingLicense });
  
  const timeoutId = setTimeout(() => {
    console.log('Request timeout reached, aborting...');
    controller.abort();
  }, TIMEOUT_DURATION);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vehicle_no: vehicleNumber,
        driver_dl: drivingLicense,
      }),
      signal: controller.signal,
    });
    
    console.log('Response received, status:', response.status);
    clearTimeout(timeoutId);

    let data;
    let responseText = '';
    try {
      responseText = await response.text();
      console.log('=== MULTI-PICKUP API RESPONSE DEBUG ===');
      console.log('Raw response text:', responseText);
      console.log('Response status:', response.status);
      console.log('Response statusText:', response.statusText);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      console.log('======================================');
      
      if (!responseText || responseText.trim() === '') {
        console.error('Empty response from server');
        return { success: false, error: 'Empty response from server. Please try again.' };
      }
      
      data = JSON.parse(responseText);
      console.log('Parsed JSON data:', JSON.stringify(data, null, 2));
      console.log('Response keys:', Object.keys(data));
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      console.error('Response text that failed to parse:', responseText);
      return { 
        success: false, 
        error: 'Invalid response from server. Please check your internet connection and try again.' 
      };
    }

    // Check for successful response
    const isSuccess = response.ok && data.status === 'success';

    console.log('Success condition check:', {
      responseOk: response.ok,
      dataStatus: data.status,
      finalIsSuccess: isSuccess
    });

    if (isSuccess) {
      console.log('✅ Multi-pickup authentication successful');
      session.isLoggedIn = true;
      
      const apiData = data.data;
      
      // Store session token and expiration
      if (apiData.session_token) {
        session.sessionToken = apiData.session_token;
        console.log('🔑 Session token received:', apiData.session_token);
        
        if (apiData.token_expires_in) {
          const expiresInSeconds = parseInt(apiData.token_expires_in);
          session.tokenExpiresAt = new Date(Date.now() + (expiresInSeconds * 1000));
          console.log('⏰ Token expires at:', session.tokenExpiresAt.toISOString());
          console.log('⏰ Token expires in:', expiresInSeconds, 'seconds');
        }
      }
      
      // Store assignment data
      session.assignment = {
        assignment_id: apiData.assignment_id,
        driver_dl: apiData.driver_dl,
        vehicle_no: apiData.vehicle_no,
        route_date: apiData.route_date,
        status: apiData.status,
        session_type: apiData.session_type,
        total_stops: apiData.total_stops,
        completed_stops: apiData.completed_stops,
        in_progress_stops: apiData.in_progress_stops,
        trip_started_at: apiData.trip_started_at,
        trip_ended_at: apiData.trip_ended_at,
        created_at: apiData.created_at,
        updated_at: apiData.updated_at,
      };
      
      // Store all stops data
      session.stops = apiData.stops || [];
      
      // Find current pickup (first pending stop or by sequence)
      const currentStop = session.stops.find(stop => stop.status === 'pending') || session.stops[0];
      
      if (currentStop) {
      session.pickup = {
          stop_id: currentStop.id,
          sequence: currentStop.sequence,
          customerName: currentStop.name,
          address: currentStop.address,
          latitude: parseFloat(currentStop.latitude),
          longitude: parseFloat(currentStop.longitude),
          customerId: currentStop.branch_id,
          branch_code: currentStop.branch_code, // Store branch_code for barcode scanning
          contact: currentStop.contact,
          notes: currentStop.notes,
          weight: parseFloat(currentStop.weight),
          status: currentStop.status,
          pickup_started_at: currentStop.pickup_started_at,
          pickup_ended_at: currentStop.pickup_ended_at,
          completed_at: currentStop.completed_at,
          photo_path: currentStop.photo_path,
        };
      }
      
      // Update totals for multi-pickup
      const currentStopIndex = session.stops.findIndex(stop => stop.status === 'pending') || 0;
      session.totals = { 
        current: currentStopIndex + 1, 
        total: apiData.total_stops 
      };
      
      session.started = false;
      session.completed = false;
      
      // Save session to storage for persistence
      await saveSessionToStorage();
      
      console.log('✅ Multi-pickup session created');
      console.log('📊 Total stops:', apiData.total_stops);
      console.log('📊 Current stop:', session.totals.current);
      console.log('📊 Current pickup:', session.pickup?.customerName);
      
      return { success: true, assignment: session.assignment };
    } else {
      console.log('❌ Multi-pickup authentication failed');
      console.log('HTTP Status:', response.status);
      console.log('Error message from API:', data.message);
      
      let errorMessage = data.message || 'Authentication failed';
      
      if (data.message && data.message.toLowerCase().includes('no assignment')) {
        errorMessage = 'No pickup assignment found for today. Please check with your supervisor.';
      } else if (data.message && data.message.toLowerCase().includes('invalid')) {
        errorMessage = 'Invalid vehicle number or driving license. Please check your credentials and try again.';
      } else if (response.status === 400) {
        errorMessage = 'Bad request. Please check your vehicle number and driving license format.';
      } else if (response.status === 401) {
        errorMessage = 'Unauthorized. Invalid credentials provided.';
      } else if (response.status === 404) {
        errorMessage = 'Vehicle or driver not found in the system.';
      } else if (response.status >= 500) {
        errorMessage = 'Server error. Please try again later or contact support.';
      }
      
      return { success: false, error: errorMessage };
    }
  } catch (error) {
    clearTimeout(timeoutId);
    
    console.error('Multi-pickup API Error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    if (error.name === 'AbortError') {
      console.log('Request was aborted due to timeout');
      return { success: false, error: 'Connection timeout after 30 seconds. The server is not responding. Please check your internet connection and server availability.' };
    }
    
    if (error.message.includes('Network request failed')) {
      return { success: false, error: 'Cannot connect to server. Please check if the server is running and your internet connection.' };
    }
    
    if (error.message.includes('fetch')) {
      return { success: false, error: 'Network error occurred. Please check your internet connection and server availability.' };
    }
    
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Connection refused')) {
      return { success: false, error: 'Server is not available. Please check if the server is running on the correct address.' };
    }
    
    return { success: false, error: `Network error: ${error.message || 'Please check your connection and try again.'}` };
  }
};

export const getCurrentPickupDetails = async () => {
  if (!session.pickup) {
    return null;
  }
  
  return {
    stop_id: session.pickup.stop_id,
    sequence: session.pickup.sequence,
    customerName: session.pickup.customerName,
    address: session.pickup.address,
    latitude: session.pickup.latitude,
    longitude: session.pickup.longitude,
    nextPickupDate: session.assignment?.route_date || null,
    pickupIndex: session.totals.current,
    totalPickups: session.totals.total,
    isLast: session.totals.current === session.totals.total,
    customerId: session.pickup.customerId,
    branch_code: session.pickup.branch_code, // Include branch_code for barcode scanning
    contact: session.pickup.contact,
    notes: session.pickup.notes,
    weight: session.pickup.weight,
    status: session.pickup.status,
    pickup_started_at: session.pickup.pickup_started_at,
    pickup_ended_at: session.pickup.pickup_ended_at,
    completed_at: session.pickup.completed_at,
    photo_path: session.pickup.photo_path,
  };
};

// Get all stops/pickups in the assignment
export const getAllStops = async () => {
  return session.stops || [];
};

// Move to next pickup
export const moveToNextPickup = async () => {
  if (session.totals.current >= session.totals.total) {
    console.log('⚠️ Already at the last pickup');
    return { success: false, error: 'Already at the last pickup' };
  }
  
  // Find next pending stop
  const nextStop = session.stops.find(stop => 
    stop.sequence > session.pickup.sequence && stop.status === 'pending'
  );
  
  if (!nextStop) {
    console.log('⚠️ No next pending pickup found');
    return { success: false, error: 'No next pending pickup found' };
  }
  
  // Update current pickup
  session.pickup = {
    stop_id: nextStop.id,
    sequence: nextStop.sequence,
    customerName: nextStop.name,
    address: nextStop.address,
    latitude: parseFloat(nextStop.latitude),
    longitude: parseFloat(nextStop.longitude),
    customerId: nextStop.branch_id,
    contact: nextStop.contact,
    notes: nextStop.notes,
    weight: parseFloat(nextStop.weight),
    status: nextStop.status,
    pickup_started_at: nextStop.pickup_started_at,
    pickup_ended_at: nextStop.pickup_ended_at,
    completed_at: nextStop.completed_at,
    photo_path: nextStop.photo_path,
  };
  
  // Update current index
  session.totals.current = nextStop.sequence;
  
  // Save to storage
  await saveSessionToStorage();
  
  console.log('✅ Moved to next pickup:', nextStop.name);
  return { success: true, pickup: session.pickup };
};

// Mark current pickup as completed
export const markCurrentPickupCompleted = async (completionData = {}) => {
  if (!session.pickup) {
    return { success: false, error: 'No current pickup to complete' };
  }
  
  // Find the current stop in the stops array and update it
  const stopIndex = session.stops.findIndex(stop => stop.id === session.pickup.stop_id);
  if (stopIndex >= 0) {
    session.stops[stopIndex] = {
      ...session.stops[stopIndex],
      status: 'completed',
      completed_at: new Date().toISOString(),
      pickup_ended_at: new Date().toISOString(),
      weight: completionData.weight || session.stops[stopIndex].weight,
      photo_path: completionData.photo_path || session.stops[stopIndex].photo_path,
      ...completionData
    };
  }
  
  // Update assignment totals
  if (session.assignment) {
    session.assignment.completed_stops = (session.assignment.completed_stops || 0) + 1;
    session.assignment.in_progress_stops = Math.max(0, (session.assignment.in_progress_stops || 0) - 1);
  }
  
  // Save to storage
  await saveSessionToStorage();
  
  console.log('✅ Current pickup marked as completed');
  return { success: true };
};

export const getPickupProgress = async () => {
  const completed = session.assignment?.completed_stops || 0;
  const total = session.totals.total;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const remaining = Math.max(0, total - completed);
  
  return {
    current: session.totals.current,
    total: total,
    completed: completed,
    percentage: percentage,
    remaining: remaining,
    inProgress: session.assignment?.in_progress_stops || 0,
  };
};

export const startCurrentPickup = async () => {
  // Call the auto-start-trip API
  const result = await autoStartTripAPI();
  
  if (result.success) {
    session.started = true;
    // Update assignment status if provided
    if (session.assignment && result.data) {
      session.assignment.status = result.data.status;
      session.assignment.trip_started_at = result.data.trip_started_at;
      session.assignment.total_sequences = result.data.total_sequences;
    }
    await saveSessionToStorage();
    return { success: true, message: result.message || 'Pickup started successfully' };
  } else {
    return { success: false, error: result.error || 'Failed to start pickup' };
  }
};

// New API function to auto-start the trip
export const autoStartTripAPI = async () => {
  console.log('🚀 Starting auto-start-trip API call...');
  
  // Check if session is valid
  if (!ensureValidSession()) {
    console.log('⚠️ Cannot start trip: Session is invalid');
    return { success: false, error: 'Session is invalid' };
  }

  // Get session data
  const sessionData = getSessionData();
  if (!sessionData.assignment) {
    console.log('⚠️ No assignment data found');
    return { success: false, error: 'No assignment data found' };
  }

  const controller = new AbortController();
  const TIMEOUT_DURATION = 15000; // 15 seconds
  const API_URL = `${GLOBAL_BASE_URL}/multi-pickup/auto-start-trip`;
  
  console.log(`Making auto-start-trip request to: ${API_URL}`);
  
  const timeoutId = setTimeout(() => {
    console.log('Auto-start-trip request timeout reached, aborting...');
    controller.abort();
  }, TIMEOUT_DURATION);

  try {
    // Get authentication headers
    const authHeaders = getAuthHeaders();
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}), // Empty body as per specification
      signal: controller.signal,
    });
    
    console.log('Auto-start-trip response received, status:', response.status);
    clearTimeout(timeoutId);

    let data;
    let responseText = '';
    try {
      responseText = await response.text();
      console.log('=== AUTO-START-TRIP API RESPONSE DEBUG ===');
      console.log('Raw response text:', responseText);
      console.log('Response status:', response.status);
      console.log('Response statusText:', response.statusText);
      console.log('==========================================');
      
      if (!responseText || responseText.trim() === '') {
        console.error('Empty response from server');
        return { success: false, error: 'Empty response from server. Please try again.' };
      }
      
      data = JSON.parse(responseText);
      console.log('Parsed JSON data:', JSON.stringify(data, null, 2));
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      console.error('Response text that failed to parse:', responseText);
      return { 
        success: false, 
        error: 'Invalid response from server. Please check your internet connection and try again.' 
      };
    }

    // Check for successful response
    const isSuccess = response.ok && data.status === 'success';

    console.log('Auto-start-trip success condition check:', {
      responseOk: response.ok,
      dataStatus: data.status,
      finalIsSuccess: isSuccess
    });

    if (isSuccess) {
      console.log('✅ Auto-start-trip API successful');
      console.log('📊 Assignment ID:', data.data?.assignment_id);
      console.log('📊 Status:', data.data?.status);
      console.log('📊 Trip started at:', data.data?.trip_started_at);
      console.log('📊 Next action:', data.data?.next_action);
      
      return { 
        success: true, 
        message: data.message || 'Trip started successfully',
        data: data.data 
      };
    } else {
      console.log('❌ Auto-start-trip API failed');
      console.log('HTTP Status:', response.status);
      console.log('Error message from API:', data.message);
      
      let errorMessage = data.message || 'Failed to start trip';
      
      if (response.status === 400) {
        errorMessage = 'Bad request. Invalid assignment or trip already started.';
      } else if (response.status === 401) {
        errorMessage = 'Unauthorized. Please login again.';
      } else if (response.status === 404) {
        errorMessage = 'Assignment not found.';
      } else if (response.status >= 500) {
        errorMessage = 'Server error. Please try again later.';
      }
      
      return { success: false, error: errorMessage };
    }
  } catch (error) {
    clearTimeout(timeoutId);
    
    console.error('Auto-start-trip API Error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    if (error.name === 'AbortError') {
      console.log('Request was aborted due to timeout');
      return { success: false, error: 'Connection timeout. The server is not responding. Please check your internet connection.' };
    }
    
    if (error.message.includes('Network request failed')) {
      return { success: false, error: 'Cannot connect to server. Please check if the server is running and your internet connection.' };
    }
    
    if (error.message.includes('fetch')) {
      return { success: false, error: 'Network error occurred. Please check your internet connection and server availability.' };
    }
    
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Connection refused')) {
      return { success: false, error: 'Server is not available. Please check if the server is running on the correct address.' };
    }
    
    return { success: false, error: `Network error: ${error.message || 'Please check your connection and try again.'}` };
  }
};

// API function to get current pickup status
export const getCurrentPickupStatus = async () => {
  console.log('📊 Getting current pickup status...');
  
  // Check if session is valid
  if (!ensureValidSession()) {
    console.log('⚠️ Cannot get status: Session is invalid');
    return { success: false, error: 'Session is invalid' };
  }

  const controller = new AbortController();
  const TIMEOUT_DURATION = 15000; // 15 seconds
  const API_URL = `${GLOBAL_BASE_URL}/multi-pickup/current-status`;
  
  console.log(`Making current-status request to: ${API_URL}`);
  
  const timeoutId = setTimeout(() => {
    console.log('Current-status request timeout reached, aborting...');
    controller.abort();
  }, TIMEOUT_DURATION);

  try {
    // Get authentication headers
    const authHeaders = getAuthHeaders();
    
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        ...authHeaders,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    
    console.log('Current-status response received, status:', response.status);
    clearTimeout(timeoutId);

    let data;
    let responseText = '';
    try {
      responseText = await response.text();
      console.log('=== CURRENT-STATUS API RESPONSE DEBUG ===');
      console.log('Raw response text:', responseText);
      console.log('Response status:', response.status);
      console.log('Response statusText:', response.statusText);
      console.log('==========================================');
      
      if (!responseText || responseText.trim() === '') {
        console.error('Empty response from server');
        return { success: false, error: 'Empty response from server. Please try again.' };
      }
      
      data = JSON.parse(responseText);
      console.log('Parsed JSON data:', JSON.stringify(data, null, 2));
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      console.error('Response text that failed to parse:', responseText);
      return { 
        success: false, 
        error: 'Invalid response from server. Please check your internet connection and try again.' 
      };
    }

    // Check for successful response
    const isSuccess = response.ok && data.status === 'success';

    console.log('Current-status success condition check:', {
      responseOk: response.ok,
      dataStatus: data.status,
      finalIsSuccess: isSuccess
    });

    if (isSuccess) {
      console.log('✅ Current-status API successful');
      console.log('📊 Assignment ID:', data.data?.assignment_id);
      console.log('📊 Next sequence:', data.data?.next_sequence);
      console.log('📊 Next action:', data.data?.next_action);
      console.log('📊 Guidance:', data.data?.guidance);
      console.log('📊 Current location:', data.data?.current_location);
      
      return { 
        success: true, 
        message: data.message || 'Current pickup status retrieved',
        data: data.data 
      };
    } else {
      console.log('❌ Current-status API failed');
      console.log('HTTP Status:', response.status);
      console.log('Error message from API:', data.message);
      
      let errorMessage = data.message || 'Failed to get current status';
      
      if (response.status === 400) {
        errorMessage = 'Bad request. Invalid assignment.';
      } else if (response.status === 401) {
        errorMessage = 'Unauthorized. Please login again.';
      } else if (response.status === 404) {
        errorMessage = 'Assignment not found.';
      } else if (response.status >= 500) {
        errorMessage = 'Server error. Please try again later.';
      }
      
      return { success: false, error: errorMessage };
    }
  } catch (error) {
    clearTimeout(timeoutId);
    
    console.error('Current-status API Error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    if (error.name === 'AbortError') {
      console.log('Request was aborted due to timeout');
      return { success: false, error: 'Connection timeout. The server is not responding. Please check your internet connection.' };
    }
    
    if (error.message.includes('Network request failed')) {
      return { success: false, error: 'Cannot connect to server. Please check if the server is running and your internet connection.' };
    }
    
    if (error.message.includes('fetch')) {
      return { success: false, error: 'Network error occurred. Please check your internet connection and server availability.' };
    }
    
    if (error.message.includes('ECONNREFUSED') || error.message.includes('Connection refused')) {
      return { success: false, error: 'Server is not available. Please check if the server is running on the correct address.' };
    }
    
    return { success: false, error: `Network error: ${error.message || 'Please check your connection and try again.'}` };
  }
};

// Session token validation and management functions
// These functions handle session token validation, expiration checking, and authentication headers

export const isSessionTokenValid = () => {
  // Must have a token
  if (!session.sessionToken) {
    return false;
  }
  
  // If no explicit expiry was provided by backend, treat token as valid
  if (!session.tokenExpiresAt) {
    return true;
  }
  
  const now = new Date();
  // Add 5 minute buffer to prevent premature expiry detection (handles clock skew)
  const bufferTime = 5 * 60 * 1000; // 5 minutes
  const expiryWithBuffer = new Date(session.tokenExpiresAt.getTime() + bufferTime);
  const isExpired = now >= expiryWithBuffer;
  
  if (isExpired) {
    console.log('⚠️ Session token has expired');
    console.log('⏰ Expires at:', session.tokenExpiresAt.toISOString());
    console.log('⏰ Current time:', now.toISOString());
    // Clear session data when token expires
    session.isLoggedIn = false;
    session.sessionToken = null;
    session.tokenExpiresAt = null;
  }
  
  return !isExpired;
};

// Check if token needs refresh (within 2 hours of expiry - more aggressive)
export const shouldRefreshToken = () => {
  if (!session.tokenExpiresAt || !session.sessionToken) {
    return false;
  }
  
  const now = new Date();
  const timeUntilExpiry = session.tokenExpiresAt.getTime() - now.getTime();
  const twoHoursInMs = 2 * 60 * 60 * 1000; // 2 hours - refresh earlier
  
  // Refresh if less than 2 hours remaining (more aggressive to prevent expiry)
  return timeUntilExpiry > 0 && timeUntilExpiry < twoHoursInMs;
};

// Automatic token refresh check and refresh
export const checkAndRefreshTokenIfNeeded = async () => {
  try {
    if (!isSessionTokenValid()) {
      return { success: false, error: 'Token is invalid or expired' };
    }
    
    if (shouldRefreshToken()) {
      console.log('🔄 Token needs refresh, refreshing now...');
      const refreshResult = await refreshSessionToken();
      
      if (refreshResult.success) {
        console.log('✅ Token refreshed successfully');
        return { success: true, refreshed: true };
      } else {
        console.log('⚠️ Token refresh failed, but token is still valid');
        return { success: true, refreshed: false, error: refreshResult.error };
      }
    }
    
    return { success: true, refreshed: false };
  } catch (error) {
    console.error('❌ Error checking token refresh:', error);
    return { success: false, error: error.message };
  }
};

export const getSessionToken = () => {
  if (isSessionTokenValid()) {
    return session.sessionToken;
  }
  return null;
};

export const getTokenExpirationInfo = () => {
  if (!session.tokenExpiresAt) {
    return null;
  }
  
  const now = new Date();
  const timeRemaining = session.tokenExpiresAt.getTime() - now.getTime();
  
  return {
    expiresAt: session.tokenExpiresAt,
    timeRemainingMs: Math.max(0, timeRemaining),
    timeRemainingSeconds: Math.max(0, Math.floor(timeRemaining / 1000)),
    isExpired: timeRemaining <= 0,
  };
};

export const logout = async () => {
  session.isLoggedIn = false;
  session.assignment = null;
  session.pickup = null;
  session.stops = [];
  session.totals = { current: 1, total: 1 };
  session.started = false;
  session.completed = false;
  session.sessionToken = null;
  session.tokenExpiresAt = null;
  session.appState = {
    currentPage: null,
    navigationStarted: false,
    pickupFormData: {},
    completedSteps: [],
    lastActivity: null,
  };
  
  // Clear session from storage
  try {
    await AsyncStorage.removeItem('driver_session');
  } catch (error) {
    console.error('Failed to clear session from storage:', error);
  }
  
  console.log('🚪 User logged out, session cleared');
};

export const getSessionData = () => {
  return {
    assignment: session.assignment,
    pickup: session.pickup,
    stops: session.stops,
    totals: session.totals,
    isLoggedIn: session.isLoggedIn && isSessionTokenValid(),
    sessionToken: session.sessionToken,
    tokenExpirationInfo: getTokenExpirationInfo(),
    appState: getCurrentAppState(),
  };
};

// Utility function to ensure session is valid before making API calls
export const ensureValidSession = () => {
  if (!isSessionTokenValid()) {
    console.log('⚠️ Session is invalid or expired, user needs to login again');
    return false;
  }
  return true;
};

// Function to get session token for API headers
export const getAuthHeaders = () => {
  const token = getSessionToken();
  if (token) {
    // Do NOT set 'Content-Type' here. Callers must set it based on payload (e.g., JSON vs FormData)
    return {
      'Authorization': `Bearer ${token}`,
    };
  }
  // No auth header if no token; callers will set appropriate Content-Type themselves
  return {};
};

// App state management functions
export const updateAppState = async (appStateData) => {
  // API removed - returning mock success
  console.log('🔄 Mock app state update:', appStateData);
  
  // Update local session with provided app state data
        session.appState = {
          ...session.appState,
    ...appStateData,
          lastActivity: new Date().toISOString(),
        };
        
        // Save updated session to storage
        await saveSessionToStorage();
  
  console.log('✅ Mock app state updated successfully');
  return { success: true, appState: session.appState };
};

// Helper functions for app state management
export const setCurrentPage = async (pageName) => {
  session.appState.currentPage = pageName;
  session.appState.lastActivity = new Date().toISOString();
  
  // Save to storage
  await saveSessionToStorage();
};

export const setNavigationStarted = async (started) => {
  session.appState.navigationStarted = started;
  session.appState.lastActivity = new Date().toISOString();
  
  // Save to storage
  await saveSessionToStorage();
};

export const updatePickupFormData = async (formData) => {
  session.appState.pickupFormData = {
    ...session.appState.pickupFormData,
    ...formData,
  };
  session.appState.lastActivity = new Date().toISOString();
  
  // Save to storage
  await saveSessionToStorage();
};

export const addCompletedStep = async (step) => {
  if (!session.appState.completedSteps.includes(step)) {
    session.appState.completedSteps.push(step);
    session.appState.lastActivity = new Date().toISOString();
    
    // Save to storage
    await saveSessionToStorage();
  }
};

export const getCurrentAppState = () => {
  return {
    ...session.appState,
    lastActivity: session.appState.lastActivity || new Date().toISOString(),
  };
};

// Debug function to check session persistence
export const debugSessionPersistence = async () => {
  try {
    console.log('🔍 DEBUG: Checking session persistence...');
    
    // Check AsyncStorage
    const storedSession = await AsyncStorage.getItem('driver_session');
    console.log('📱 Stored session in AsyncStorage:', storedSession ? 'EXISTS' : 'NOT FOUND');
    
    if (storedSession) {
      const parsed = JSON.parse(storedSession);
      console.log('📱 Stored session data:', {
        hasToken: !!parsed.sessionToken,
        tokenExpiresAt: parsed.tokenExpiresAt,
        isLoggedIn: parsed.isLoggedIn,
        currentPage: parsed.appState?.currentPage
      });
    }
    
    // Check current session
    console.log('📱 Current session state:', {
      isLoggedIn: session.isLoggedIn,
      hasToken: !!session.sessionToken,
      tokenExpiresAt: session.tokenExpiresAt,
      currentPage: session.appState?.currentPage
    });
    
    return {
      hasStoredSession: !!storedSession,
      currentSession: {
        isLoggedIn: session.isLoggedIn,
        hasToken: !!session.sessionToken,
        currentPage: session.appState?.currentPage
      }
    };
  } catch (error) {
    console.error('❌ Debug error:', error);
    return { error: error.message };
  }
};

// Session persistence functions for app state restoration
export const saveSessionToStorage = async () => {
  try {
    const sessionData = {
      sessionToken: session.sessionToken,
      tokenExpiresAt: session.tokenExpiresAt?.toISOString(),
      isLoggedIn: session.isLoggedIn,
      assignment: session.assignment,
      pickup: session.pickup,
      stops: session.stops,
      totals: session.totals,
      appState: session.appState,
      lastSaved: new Date().toISOString(),
    };
    
    // Save to AsyncStorage for React Native
    await AsyncStorage.setItem('driver_session', JSON.stringify(sessionData));
    console.log('✅ Session saved to AsyncStorage');
  } catch (error) {
    console.error('Failed to save session:', error);
  }
};

export const loadSessionFromStorage = async () => {
  try {
    // Load from AsyncStorage for React Native
    const savedSession = await AsyncStorage.getItem('driver_session');
    if (savedSession) {
      const parsedSession = JSON.parse(savedSession);
      
      // Check if token is still valid (or no expiry provided)
      if (parsedSession.sessionToken) {
        const now = new Date();
        let canRestore = true;
        
        if (parsedSession.tokenExpiresAt) {
          const expiresAt = new Date(parsedSession.tokenExpiresAt);
          // Add 5 minute buffer to prevent premature expiry detection (handles clock skew)
          const bufferTime = 5 * 60 * 1000; // 5 minutes
          const expiryWithBuffer = new Date(expiresAt.getTime() + bufferTime);
          if (now < expiryWithBuffer) {
            session.tokenExpiresAt = expiresAt;
          } else {
            console.log('⚠️ Saved session expired, clearing storage');
            console.log('⏰ Expires at:', expiresAt.toISOString());
            console.log('⏰ Current time:', now.toISOString());
            await AsyncStorage.removeItem('driver_session');
            canRestore = false;
          }
        } else {
          // No expiry stored; treat as valid
          session.tokenExpiresAt = null;
        }
        
        if (canRestore) {
          // Restore session
          session.sessionToken = parsedSession.sessionToken;
          session.isLoggedIn = parsedSession.isLoggedIn;
          session.assignment = parsedSession.assignment;
          session.pickup = parsedSession.pickup;
          session.stops = parsedSession.stops || [];
          session.totals = parsedSession.totals || { current: 1, total: 1 };
          session.appState = parsedSession.appState || {
            currentPage: null,
            navigationStarted: false,
            pickupFormData: {},
            completedSteps: [],
            lastActivity: null,
          };
          
          console.log('✅ Session restored from AsyncStorage');
          console.log('📊 Restored stops:', session.stops.length);
          console.log('📊 Restored totals:', session.totals);
          return true;
        }
      }
    }
  } catch (error) {
    console.error('Failed to load session:', error);
  }
  return false;
};

// API functions for session validation and state restoration
export const validateSessionWithBackend = async (token) => {
  try {
    const controller = new AbortController();
    const TIMEOUT_DURATION = 10000; // 10 seconds
    const API_URL = `${GLOBAL_BASE_URL}/multi-pickup/session-status`;
    
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_DURATION);

    try {
      const response = await fetch(API_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          return { success: true, data: data.data };
        }
      }
      
      return { success: false, error: 'Session validation failed' };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        return { success: false, error: 'Request timeout' };
      }
      return { success: false, error: error.message || 'Network error' };
    }
  } catch (error) {
    return { success: false, error: error.message || 'Validation error' };
  }
};

export const getAppStateFromBackend = async (token) => {
  try {
    const validationResult = await validateSessionWithBackend(token);
    if (validationResult.success && validationResult.data) {
      // Update session with backend app state if available
      if (validationResult.data.app_state) {
        session.appState = {
          ...session.appState,
          ...validationResult.data.app_state,
        };
      }
      return { success: true, appState: session.appState };
    }
    return { success: false, error: 'Failed to get app state' };
  } catch (error) {
    return { success: false, error: error.message || 'App state retrieval error' };
  }
};

// Token refresh function
export const refreshSessionToken = async () => {
  try {
    const currentToken = getSessionToken();
    if (!currentToken) {
      return { success: false, error: 'No token to refresh' };
    }

    const controller = new AbortController();
    const TIMEOUT_DURATION = 10000; // 10 seconds
    const API_URL = `${GLOBAL_BASE_URL}/multi-pickup/refresh-token`;
    
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_DURATION);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && data.data) {
          // Update session with new token
          session.sessionToken = data.data.session_token;
          
          if (data.data.token_expires_in) {
            const expiresInSeconds = parseInt(data.data.token_expires_in);
            session.tokenExpiresAt = new Date(Date.now() + (expiresInSeconds * 1000));
          }
          
          // Save updated session
          await saveSessionToStorage();
          
          return { 
            success: true, 
            newToken: data.data.session_token,
            expiresIn: data.data.token_expires_in 
          };
        }
      }
      
      return { success: false, error: 'Token refresh failed' };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        return { success: false, error: 'Request timeout' };
      }
      return { success: false, error: error.message || 'Network error' };
    }
  } catch (error) {
    return { success: false, error: error.message || 'Refresh error' };
  }
};

// Main function to check and restore session on app startup
export const checkAndRestoreSession = async () => {
  try {
    console.log('🔄 Checking for existing session...');
    console.log('📱 Current session state:', {
      isLoggedIn: session.isLoggedIn,
      hasToken: !!session.sessionToken,
      tokenExpiresAt: session.tokenExpiresAt
    });
    
    // First try to load from local storage
    const hasLocalSession = await loadSessionFromStorage();
    console.log('📱 Local session loaded:', hasLocalSession);
    
    if (hasLocalSession && session.sessionToken) {
      console.log('📱 Found local session, validating with backend...');
      console.log('🔑 Session token:', session.sessionToken);
      
      // First check if local token is still valid (not expired)
      if (!isSessionTokenValid()) {
        console.log('❌ Local session token expired, clearing storage');
        await AsyncStorage.removeItem('driver_session');
        return { success: false, hasValidSession: false };
      }
      
      // Validate session with backend (but handle network errors gracefully)
      let validationResult;
      try {
        validationResult = await validateSessionWithBackend(session.sessionToken);
        console.log('🔍 Validation result:', validationResult);
      } catch (networkError) {
        // Network error - use local session if valid
        console.log('⚠️ Network error during validation, using local session:', networkError.message);
        if (isSessionTokenValid()) {
          console.log('✅ Local session is valid, continuing without backend validation');
          return { 
            success: true, 
            hasValidSession: true,
            currentPage: session.appState.currentPage || 'pickup_start',
            usingLocalSession: true
          };
        } else {
          console.log('❌ Local session expired');
          await AsyncStorage.removeItem('driver_session');
          return { success: false, hasValidSession: false };
        }
      }
      
      if (validationResult.success) {
        console.log('✅ Session is valid, checking if refresh is needed...');
        
        // Check and refresh token if needed (but don't fail if refresh fails)
        try {
          await checkAndRefreshTokenIfNeeded();
        } catch (refreshError) {
          console.log('⚠️ Token refresh failed, but session is valid:', refreshError.message);
          // Continue anyway - session is still valid
        }
        
        // Get current app state from backend (optional, don't fail if it fails)
        try {
          const appStateResult = await getAppStateFromBackend(session.sessionToken);
          console.log('📊 App state result:', appStateResult);
          
          if (appStateResult.success) {
            console.log('✅ App state restored successfully');
            console.log('📱 Current app state:', session.appState);
          } else {
            console.log('⚠️ Failed to get app state, but session is valid');
          }
        } catch (appStateError) {
          console.log('⚠️ Error getting app state, but session is valid:', appStateError.message);
        }
        
        return { 
          success: true, 
          hasValidSession: true,
          currentPage: session.appState.currentPage || 'pickup_start'
        };
      } else {
        // Validation failed - check if it's network error or truly invalid
        const errorMsg = validationResult.error || '';
        if (errorMsg.includes('timeout') || errorMsg.includes('Network') || errorMsg.includes('ECONNREFUSED')) {
          // Network error - use local session if valid
          console.log('⚠️ Network error during validation, checking local session validity');
          if (isSessionTokenValid()) {
            console.log('✅ Local session is valid, continuing without backend validation');
            return { 
              success: true, 
              hasValidSession: true,
              currentPage: session.appState.currentPage || 'pickup_start',
              usingLocalSession: true
            };
          }
        }
        
        // Truly invalid - clear storage
        console.log('❌ Session validation failed, clearing local storage');
        await AsyncStorage.removeItem('driver_session');
        return { success: false, hasValidSession: false };
      }
    } else {
      console.log('❌ No local session found');
      return { success: false, hasValidSession: false };
    }
  } catch (error) {
    console.error('❌ Error during session restoration:', error);
    // On error, try to use local session if valid
    if (isSessionTokenValid() && session.sessionToken) {
      console.log('✅ Using local session after error');
      return { 
        success: true, 
        hasValidSession: true,
        currentPage: session.appState.currentPage || 'pickup_start',
        usingLocalSession: true
      };
    }
    return { success: false, hasValidSession: false };
  }
};

// Function to handle app resume (foreground)
export const handleAppResume = async () => {
  try {
    console.log('📱 App resumed, checking session...');
    
    // CRITICAL: First try to restore from storage (app might have been killed)
    const hasStoredSession = await loadSessionFromStorage();
    console.log('📱 Session loaded from storage on resume:', hasStoredSession);
    
    // If no token in memory, try to restore from storage
    if (!session.sessionToken && hasStoredSession) {
      console.log('✅ Restored session from storage on resume');
    }
    
    // If still no token after loading from storage, session is lost
    if (!session.sessionToken) {
      console.log('⚠️ No session token found on resume (even after loading from storage)');
      return { success: false, needsLogin: true };
    }
    
    // Validate session with backend (but don't logout on network errors)
    let validationResult;
    try {
      validationResult = await validateSessionWithBackend(session.sessionToken);
    } catch (networkError) {
      // Network error - don't logout, just use local session
      console.log('⚠️ Network error during validation, using local session:', networkError.message);
      // Check if token is still valid locally (not expired)
      if (isSessionTokenValid()) {
        console.log('✅ Local session is valid, continuing without backend validation');
        // Update last activity and save
        session.appState.lastActivity = new Date().toISOString();
        await saveSessionToStorage();
        return { success: true, sessionValid: true, usingLocalSession: true };
      } else {
        console.log('❌ Local session expired');
        await logout();
        return { success: false, needsLogin: true };
      }
    }
    
    if (validationResult.success) {
      console.log('✅ Session validated with backend');
      
      // Check and refresh token if needed (but don't fail if refresh fails)
      try {
        await checkAndRefreshTokenIfNeeded();
      } catch (refreshError) {
        console.log('⚠️ Token refresh failed, but session is valid:', refreshError.message);
        // Continue anyway - session is still valid
      }
      
      // Update last activity
      session.appState.lastActivity = new Date().toISOString();
      await saveSessionToStorage();
      
      return { success: true, sessionValid: true };
    } else {
      // Validation failed - check if it's a network issue or truly invalid
      const errorMsg = validationResult.error || '';
      if (errorMsg.includes('timeout') || errorMsg.includes('Network') || errorMsg.includes('ECONNREFUSED')) {
        // Network error - use local session if valid
        console.log('⚠️ Network error during validation, checking local session validity');
        if (isSessionTokenValid()) {
          console.log('✅ Local session is valid, continuing without backend validation');
          session.appState.lastActivity = new Date().toISOString();
          await saveSessionToStorage();
          return { success: true, sessionValid: true, usingLocalSession: true };
        }
      }
      
      // Truly invalid session - logout
      console.log('❌ Session invalid on resume, clearing...');
      await logout();
      return { success: false, needsLogin: true };
    }
  } catch (error) {
    console.error('❌ Error handling app resume:', error);
    // On error, try to use local session if valid
    if (isSessionTokenValid()) {
      console.log('✅ Using local session after error');
      session.appState.lastActivity = new Date().toISOString();
      await saveSessionToStorage();
      return { success: true, sessionValid: true, usingLocalSession: true };
    }
    // Don't logout on error - let user continue if local session is valid
    return { success: false, error: error.message };
  }
};

// ===== LIVE TRACKING API FUNCTIONS =====

/**
 * Get live driver status for all drivers
 * @param {string} date - Date string in YYYY-MM-DD format (optional, defaults to today)
 * @returns {Promise<Object>} - Live driver status data
 */
export const getLiveDriverStatus = async (date = null) => {
  // API removed - returning mock live driver status
  const queryDate = date || new Date().toISOString().split('T')[0];
  console.log('🔄 Mock live driver status for date:', queryDate);
  
  const mockData = {
    summary: { total: 5, active: 3, idle: 2 },
    drivers: [
      { id: 1, name: 'Mock Driver 1', status: 'active', vehicle: 'V001' },
      { id: 2, name: 'Mock Driver 2', status: 'active', vehicle: 'V002' },
      { id: 3, name: 'Mock Driver 3', status: 'idle', vehicle: 'V003' }
    ]
  };
  
  console.log('✅ Mock live driver status retrieved');
  return { success: true, data: mockData, summary: mockData.summary, drivers: mockData.drivers };
};

/**
 * Get idle driver alerts
 * @param {number} threshold - Threshold in minutes for idle alerts (default 20)
 * @returns {Promise<Object>} - Idle driver alerts data
 */
export const getIdleAlerts = async (threshold = 20) => {
  // API removed - returning mock idle alerts
  console.log('🔄 Mock idle alerts with threshold:', threshold);
  
  const mockData = {
    summary: { total_alerts: 2, threshold_minutes: threshold },
    alerts: [
      { driver_id: 1, name: 'Mock Driver 1', idle_minutes: 25, vehicle: 'V001' },
      { driver_id: 3, name: 'Mock Driver 3', idle_minutes: 30, vehicle: 'V003' }
    ]
  };
  
  console.log('✅ Mock idle alerts retrieved');
  return { success: true, data: mockData, summary: mockData.summary, alerts: mockData.alerts };
};

/**
 * Get location history for a specific driver
 * @param {string} dlNumber - Driver's license number
 * @param {string} date - Date string in YYYY-MM-DD format (optional, defaults to today)
 * @param {number} limit - Maximum number of records to retrieve (optional, default 50)
 * @returns {Promise<Object>} - Location history data
 */
export const getLocationHistory = async (dlNumber, date = null, limit = 50) => {
  // API removed - returning mock location history
  const queryDate = date || new Date().toISOString().split('T')[0];
  console.log('🔄 Mock location history for:', { dlNumber, date: queryDate, limit });
  
  const mockData = {
    summary: { total_records: 10, date: queryDate, driver_license: dlNumber },
    history: [
      { timestamp: '10:00:00', latitude: 28.4595, longitude: 77.0266, accuracy: 5 },
      { timestamp: '10:30:00', latitude: 28.4600, longitude: 77.0270, accuracy: 8 },
      { timestamp: '11:00:00', latitude: 28.4605, longitude: 77.0275, accuracy: 6 }
    ]
  };
  
  console.log('✅ Mock location history retrieved');
  return { success: true, data: mockData, summary: mockData.summary, history: mockData.history };
};

// ==================== BARCODE SCANNER API FUNCTIONS ====================

/**
 * Scan and validate a barcode
 * @param {string} barcode_id - The barcode to scan
 * @returns {Promise<Object>} Barcode information if found and active
 */
export const scanBarcode = async (barcode_id) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const API_URL = `${GLOBAL_BASE_URL}/barcode/scan`;
    console.log('🔍 Scanning barcode:', { barcode_id, API_URL });
    const authHeaders = getAuthHeaders();
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ barcode_id }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const responseText = await response.text();
    let responseData = {};
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      console.error('❌ Failed to parse response:', parseError);
      responseData = { 
        message: responseText || `Server returned ${response.status} ${response.statusText}` 
      };
    }
    
    if (!response.ok) {
      return {
        success: false,
        error: responseData.message || `Failed to scan barcode (${response.status})`,
        status: response.status,
      };
    }
    
    return {
      success: true,
      data: responseData.data,
      message: responseData.message,
    };
  } catch (error) {
    console.error('❌ Error scanning barcode:', error);
    return {
      success: false,
      error: error.message || 'Network error occurred',
    };
  }
};

/**
 * Scan barcode and start pickup cycle in one call
 * @param {string} barcode_id - The barcode to scan
 * @param {string} branch_code - Branch code for the pickup
 * @param {number} pickup_weight - Weight of the pickup
 * @returns {Promise<Object>} Barcode info and cycle details
 */
export const scanAndStartCycle = async (barcode_id, branch_code, pickup_weight, route_id = null, additionalData = {}) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const API_URL = `${GLOBAL_BASE_URL}/barcode/cycle/scan-and-start`;
    const authHeaders = getAuthHeaders();
    
    // Get route_id from session if not provided
    if (!route_id) {
      const sessionData = getSessionData();
      route_id = sessionData?.assignment?.assignment_id || sessionData?.assignment?.route_id;
    }
    
    const payload = {
      barcode_id,
      branch_code,
      pickup_weight: parseFloat(pickup_weight),
    };
    
    // Add route_id if available
    if (route_id) {
      payload.route_id = route_id;
    }
    
    // Add any additional data (branch_name, address, contact, latitude, longitude)
    if (additionalData.branch_name) payload.branch_name = additionalData.branch_name;
    if (additionalData.address) payload.address = additionalData.address;
    if (additionalData.contact) payload.contact = additionalData.contact;
    if (additionalData.latitude) payload.latitude = additionalData.latitude;
    if (additionalData.longitude) payload.longitude = additionalData.longitude;
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const responseText = await response.text();
    let responseData = {};
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      console.error('❌ Failed to parse response:', parseError);
      responseData = { 
        message: responseText || `Server returned ${response.status} ${response.statusText}` 
      };
    }
    
    if (!response.ok) {
      return {
        success: false,
        error: responseData.message || `Failed to start pickup cycle (${response.status})`,
        status: response.status,
      };
    }
    
    return {
      success: true,
      data: responseData.data,
      message: responseData.message,
    };
  } catch (error) {
    console.error('❌ Error in scan and start cycle:', error);
    return {
      success: false,
      error: error.message || 'Network error occurred',
    };
  }
};

/**
 * Start a new pickup bag cycle
 * @param {string} barcode_id - The barcode ID
 * @param {string} branch_code - Branch code
 * @param {number} pickup_weight - Pickup weight
 * @param {string} cycle_id - Optional cycle ID (auto-generated if not provided)
 * @returns {Promise<Object>} Cycle details
 */
export const startPickupCycle = async (barcode_id, branch_code, pickup_weight, cycle_id = null) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const API_URL = `${GLOBAL_BASE_URL}/barcode/cycle/start`;
    const authHeaders = getAuthHeaders();
    
    const payload = {
      barcode_id,
      branch_code,
      pickup_weight: parseFloat(pickup_weight),
    };
    
    if (cycle_id) {
      payload.cycle_id = cycle_id;
    }
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const responseText = await response.text();
    let responseData = {};
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      console.error('❌ Failed to parse response:', parseError);
      responseData = { 
        message: responseText || `Server returned ${response.status} ${response.statusText}` 
      };
    }
    
    if (!response.ok) {
      return {
        success: false,
        error: responseData.message || `Failed to start pickup cycle (${response.status})`,
        status: response.status,
      };
    }
    
    return {
      success: true,
      data: responseData.data,
      message: responseData.message,
    };
  } catch (error) {
    console.error('❌ Error starting pickup cycle:', error);
    return {
      success: false,
      error: error.message || 'Network error occurred',
    };
  }
};

/**
 * Update cycle status
 * @param {number} cycle_id - Cycle database ID
 * @param {string} status - New status (inbound, sorting, completed)
 * @param {number} inbound_weight - Optional weight for inbound status
 * @returns {Promise<Object>} Updated cycle details
 */
export const updateCycleStatus = async (cycle_id, status, inbound_weight = null) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const API_URL = `${GLOBAL_BASE_URL}/barcode/cycle/${cycle_id}/update-status`;
    const authHeaders = getAuthHeaders();
    
    const payload = { status };
    if (inbound_weight !== null) {
      payload.inbound_weight = parseFloat(inbound_weight);
    }
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const responseText = await response.text();
    let responseData = {};
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      console.error('❌ Failed to parse response:', parseError);
      responseData = { 
        message: responseText || `Server returned ${response.status} ${response.statusText}` 
      };
    }
    
    if (!response.ok) {
      return {
        success: false,
        error: responseData.message || `Failed to update cycle status (${response.status})`,
        status: response.status,
      };
    }
    
    return {
      success: true,
      data: responseData.data,
      message: responseData.message,
    };
  } catch (error) {
    console.error('❌ Error updating cycle status:', error);
    return {
      success: false,
      error: error.message || 'Network error occurred',
    };
  }
};

/**
 * Get cycle details
 * @param {number} cycle_id - Cycle database ID
 * @returns {Promise<Object>} Cycle details
 */
export const getCycleDetails = async (cycle_id) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const API_URL = `${GLOBAL_BASE_URL}/barcode/cycle/${cycle_id}`;
    const authHeaders = getAuthHeaders();
    
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        ...authHeaders,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const responseText = await response.text();
    let responseData = {};
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      console.error('❌ Failed to parse response:', parseError);
      responseData = { 
        message: responseText || `Server returned ${response.status} ${response.statusText}` 
      };
    }
    
    if (!response.ok) {
      return {
        success: false,
        error: responseData.message || `Failed to get cycle details (${response.status})`,
        status: response.status,
      };
    }
    
    return {
      success: true,
      data: responseData.data,
    };
  } catch (error) {
    console.error('❌ Error getting cycle details:', error);
    return {
      success: false,
      error: error.message || 'Network error occurred',
    };
  }
};

/**
 * Get all cycles for a barcode
 * @param {string} barcode_id - Barcode ID
 * @returns {Promise<Object>} List of cycles
 */
export const getCyclesByBarcode = async (barcode_id) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const API_URL = `${GLOBAL_BASE_URL}/barcode/cycle/by-barcode/${barcode_id}`;
    const authHeaders = getAuthHeaders();
    
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        ...authHeaders,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const responseText = await response.text();
    let responseData = {};
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      console.error('❌ Failed to parse response:', parseError);
      responseData = { 
        message: responseText || `Server returned ${response.status} ${response.statusText}` 
      };
    }
    
    if (!response.ok) {
      return {
        success: false,
        error: responseData.message || `Failed to get cycles (${response.status})`,
        status: response.status,
      };
    }
    
    return {
      success: true,
      data: responseData.data || [],
      count: responseData.count || 0,
    };
  } catch (error) {
    console.error('❌ Error getting cycles by barcode:', error);
    return {
      success: false,
      error: error.message || 'Network error occurred',
    };
  }
};








