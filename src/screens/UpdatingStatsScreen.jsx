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
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
  ScrollView,
  BackHandler,
  Animated,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { launchCamera } from 'react-native-image-picker';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { completeCurrentPickup, getSessionData, ensureValidSession, getAuthHeaders, setCurrentPage, updatePickupFormData, updateAppState, moveToNextPickup, scanBarcode, scanAndStartCycle, getCurrentPickupDetails } from '../frontendStore';

// Import vision camera - handle gracefully if not available
let Camera, useCameraDevice, useCodeScanner;
let cameraModuleAvailable = false;

try {
  const VisionCamera = require('react-native-vision-camera');
  if (VisionCamera && VisionCamera.Camera && VisionCamera.useCameraDevice && VisionCamera.useCodeScanner) {
    Camera = VisionCamera.Camera;
    useCameraDevice = VisionCamera.useCameraDevice;
    useCodeScanner = VisionCamera.useCodeScanner;
    // Verify all components are functions/components
    if (Camera && typeof useCameraDevice === 'function' && typeof useCodeScanner === 'function') {
      cameraModuleAvailable = true;
    }
  }
} catch (error) {
  // Silently handle - module may not be linked yet
  cameraModuleAvailable = false;
}
// Geofence service removed
import { checkLocationServicesReady, showLocationErrorAlert } from '../services/locationService';
import { APP_CONFIG, GLOBAL_BASE_URL } from '../utils/config'; // API config imports removed
import { t, subscribeToLanguageChanges } from '../utils/translations';
import { useLanguage } from '../contexts/LanguageContext';

const { width, height } = Dimensions.get('window');

const UpdatingStatsScreen = ({ navigation, route }) => {
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedReceiptImage, setUploadedReceiptImage] = useState(null);
  const [receiptUrl, setReceiptUrl] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [weight, setWeight] = useState('');
  const [isWeightSubmitted, setIsWeightSubmitted] = useState(false);
  const [isDataSubmitted, setIsDataSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const { currentLanguage, forceUpdate, updateTrigger } = useLanguage();
  const [refreshKey, setRefreshKey] = useState(0);

  // Animation values
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const camera = useRef(null);
  const isMounted = useRef(true);

  // Camera hooks - Only use if module is properly available to prevent getConstants error
  // We check module availability before calling hooks to avoid native bridge errors
  let device = null;
  if (cameraModuleAvailable && useCameraDevice && typeof useCameraDevice === 'function') {
    try {
      device = useCameraDevice('back');
      // If device is null, module might not be linked
      if (!device) {
        cameraModuleAvailable = false;
      }
    } catch (error) {
      // Silently handle - don't show error, just disable camera
      device = null;
      cameraModuleAvailable = false;
    }
  }

  // Get current pickup number from route params
  const currentPickup = route.params?.currentPickup || 1;

  // Allow back navigation - removed restrictions

  // Subscribe to language changes
  useEffect(() => {
    const unsubscribe = subscribeToLanguageChanges((newLang) => {
      console.log('🔄 UpdatingStatsScreen: Language changed to:', newLang);
      setRefreshKey(prev => prev + 1);
    });
    return unsubscribe;
  }, []);

  // Hydrate any server-provided media URLs from persisted app state
  useEffect(() => {
    try {
      const persisted = getSessionData()?.appState?.pickup_form_data;
      if (persisted?.receipt_url && typeof persisted.receipt_url === 'string') {
        setReceiptUrl(persisted.receipt_url);
      }
      if (persisted?.photo_path && typeof persisted.photo_path === 'string') {
        setPhotoUrl(persisted.photo_path);
      }
    } catch (e) {
      console.warn('Failed to hydrate media URLs from session:', e?.message || e);
    }
  }, []);

  // Set current page when component mounts and update app state
  useEffect(() => {
    isMounted.current = true;
    
    const initializeScreen = async () => {
      try {
        // Set current page
        await setCurrentPage('pickup_form');
        if (!isMounted.current) return;
        console.log('✅ Current page set to pickup_form');
        
        // Update app state on backend
        const sessionData = getSessionData();
        if (sessionData && sessionData.isLoggedIn && isMounted.current) {
          const appStateData = {
            current_page: 'pickup_form',
            navigation_started: true,
            pickup_form_data: {},
            completed_steps: ['navigation'],
            last_activity: new Date().toISOString(),
          };
          
          await updateAppState(appStateData);
          if (isMounted.current) {
            console.log('✅ App state updated on backend: pickup_form');
          }
        }
      } catch (error) {
        if (isMounted.current) {
          console.warn('⚠️ Failed to initialize screen state:', error);
        }
      }
    };
    
    initializeScreen();
    
    return () => {
      isMounted.current = false;
    };
  }, []);


  const requestCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        // Check current camera permission status
        const hasCameraPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
        console.log('Current camera permission status:', hasCameraPermission);

        // If already granted, return true
        if (hasCameraPermission) {
          console.log('Camera permission already granted');
          return true;
        }

        // Request camera permission
        console.log('Requesting camera permission...');
        const cameraPermission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'This app needs camera access to take photos.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );

        console.log('Camera permission result:', cameraPermission);
        
        const isGranted = cameraPermission === PermissionsAndroid.RESULTS.GRANTED;
        console.log('Is camera permission granted?', isGranted);
        
        return isGranted;
      } catch (err) {
        console.warn('Permission error:', err);
        return false;
      }
    } else {
      return true; // iOS handles permissions differently
    }
  };

  const handleUploadImage = async () => {
    try {
      console.log('Camera button pressed');
      
      const hasPermission = await requestCameraPermission();
      console.log('Camera permission granted:', hasPermission);
      
      if (!hasPermission) {
        Alert.alert('Permission Denied', 'Camera permission is required to take photos.');
        return;
      }

      console.log('Launching camera...');
      
      // Launch camera with specific options
      const result = await launchCamera({
        mediaType: 'photo',
        includeBase64: false,
        maxHeight: 2000,
        maxWidth: 2000,
        quality: 0.8,
        saveToPhotos: false,
        cameraType: 'back',
        presentationStyle: 'fullScreen',
      });

      console.log('Camera result:', result);

      if (result && result.assets && result.assets.length > 0) {
        const photo = result.assets[0];
        console.log('Photo captured successfully:', photo);
        setUploadedImage(photo);
        Alert.alert('Success', 'Photo captured successfully!');
      } else if (result && result.didCancel) {
        console.log('User cancelled camera');
        // Don't show alert for user cancellation
      } else if (result && result.errorCode) {
        Alert.alert('Camera Error', `Error: ${result.errorMessage || 'Unknown camera error'}`);
      } else {
        console.log('Unknown camera result:', result);
        Alert.alert('Error', 'Unknown error occurred while capturing photo.');
      }
    } catch (error) {
      Alert.alert('Error', `Failed to open camera: ${error.message || 'Unknown error'}`);
    }
  };

  const handleUploadReceiptImage = async () => {
    try {
      console.log('Receipt camera button pressed');
      
      const hasPermission = await requestCameraPermission();
      console.log('Camera permission granted:', hasPermission);
      
      if (!hasPermission) {
        Alert.alert('Permission Denied', 'Camera permission is required to take photos.');
        return;
      }

      console.log('Launching camera for receipt...');
      
      // Launch camera with specific options for receipt
      const result = await launchCamera({
        mediaType: 'photo',
        includeBase64: false,
        maxHeight: 2000,
        maxWidth: 2000,
        quality: 0.8,
        saveToPhotos: false,
        cameraType: 'back',
        presentationStyle: 'fullScreen',
      });

      console.log('Receipt camera result:', result);

      if (result && result.assets && result.assets.length > 0) {
        const photo = result.assets[0];
        console.log('Receipt photo captured successfully:', photo);
        setUploadedReceiptImage(photo);
        Alert.alert('Success', 'Receipt photo captured successfully!');
        
      } else if (result && result.didCancel) {
        console.log('User cancelled receipt camera');
        // Don't show alert for user cancellation
      } else if (result && result.errorCode) {
        Alert.alert('Camera Error', `Error: ${result.errorMessage || 'Unknown camera error'}`);
      } else {
        console.log('Unknown receipt camera result:', result);
        Alert.alert('Error', 'Unknown error occurred while capturing receipt photo.');
      }
    } catch (error) {
      Alert.alert('Error', `Failed to open camera: ${error.message || 'Unknown error'}`);
    }
  };


  const handleWeightChange = (text) => {
    const cleanText = text.replace(/[^0-9.]/g, '');
    setWeight(cleanText);
    
    // Update form data in app state
    if (cleanText) {
      updatePickupFormData({
        total_waste: cleanText
      }).catch((error) => {
        console.warn('Failed to update pickup form data:', error);
      });
    }
  };

  // Initialize code scanner - Only use if module and device are available
  let codeScanner = null;
  if (cameraModuleAvailable && useCodeScanner && typeof useCodeScanner === 'function' && device) {
    try {
      codeScanner = useCodeScanner({
        codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128', 'code-39', 'qr'],
        onCodeScanned: (codes) => {
          if (codes && codes.length > 0 && cameraActive && !scannedBarcode) {
            const scannedCode = codes[0].value;
            if (scannedCode) {
              setCameraActive(false);
              handleBarcodeScanned(scannedCode);
            }
          }
        },
      });
    } catch (error) {
      // Silently handle - don't show error, just disable camera
      codeScanner = null;
      cameraModuleAvailable = false;
    }
  }

  // Request camera permission
  useEffect(() => {
    requestBarcodeCameraPermission();
  }, []);

  // Enable camera when permission is granted
  useEffect(() => {
    if (hasCameraPermission === true && cameraModuleAvailable && device && !showCamera) {
      setShowCamera(true);
      setCameraActive(true);
    }
  }, [hasCameraPermission, device]);

  // Start scan line animation
  useEffect(() => {
    if (showCamera) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    }
  }, [showCamera]);

  const requestBarcodeCameraPermission = async () => {
    try {
      const permission = Platform.OS === 'ios' 
        ? PERMISSIONS.IOS.CAMERA 
        : PERMISSIONS.ANDROID.CAMERA;
      
      const result = await request(permission);
      const granted = result === RESULTS.GRANTED;
      setHasCameraPermission(granted);
    } catch (error) {
      setHasCameraPermission(false);
      setCameraError('Failed to request camera permission');
    }
  };

  const handleBarcodeScanned = async (code) => {
    Keyboard.dismiss();
    setScannedBarcode(code);
    setBarcodeInput(code);
    setCameraActive(false);
    
    try {
      // Get current pickup details to get branch_code
      const sessionData = getSessionData();
      const currentPickupDetails = await getCurrentPickupDetails();
      
      // Get branch_code from current pickup/stop
      let branch_code = null;
      
      // First try to get from current pickup details
      if (currentPickupDetails && currentPickupDetails.branch_code) {
        branch_code = currentPickupDetails.branch_code;
      }
      
      // If not found, try to get from session stops
      if (!branch_code && sessionData && sessionData.stops && sessionData.stops.length > 0) {
        // Find current stop (in_progress or first pending)
        const currentStop = sessionData.stops.find(
          stop => stop.status === 'in_progress'
        ) || sessionData.stops.find(
          stop => stop.status === 'pending'
        ) || sessionData.stops[0];
        
        branch_code = currentStop?.branch_code || currentStop?.branchCode;
      }
      
      // If still not found, try from session.pickup
      if (!branch_code && sessionData && sessionData.pickup) {
        branch_code = sessionData.pickup.branch_code || sessionData.pickup.branchCode;
      }
      
      console.log('🔍 Barcode scan - branch_code:', branch_code);
      console.log('🔍 Barcode scan - weight:', weight);
      
      // Validate barcode with backend
      const scanResult = await scanBarcode(code);
      
      if (scanResult.success) {
        const barcodeInfo = scanResult.data;
        
        // Check if weight is entered
        const pickupWeight = weight && parseFloat(weight) > 0 ? parseFloat(weight) : null;
        
        console.log('📦 Barcode scan result:', {
          barcode: code,
          bagtype: barcodeInfo.bagtype,
          branch_code: branch_code,
          weight: pickupWeight,
          canStartCycle: !!(branch_code && pickupWeight)
        });
        
        // If branch_code and weight are available, automatically start pickup cycle
        if (branch_code && pickupWeight) {
          try {
            // Get additional data for route_stops
            const additionalData = {};
            if (currentPickupDetails) {
              if (currentPickupDetails.customerName) additionalData.branch_name = currentPickupDetails.customerName;
              if (currentPickupDetails.address) additionalData.address = currentPickupDetails.address;
              if (currentPickupDetails.contact) additionalData.contact = currentPickupDetails.contact;
              if (currentPickupDetails.latitude) additionalData.latitude = currentPickupDetails.latitude;
              if (currentPickupDetails.longitude) additionalData.longitude = currentPickupDetails.longitude;
            }
            
            // Get route_id from session
            const sessionData = getSessionData();
            const route_id = sessionData?.assignment?.assignment_id || sessionData?.assignment?.route_id;
            
            console.log('🚀 Starting pickup cycle...', {
              barcode_id: code,
              branch_code: branch_code,
              pickup_weight: pickupWeight,
              route_id: route_id,
              additionalData: additionalData
            });
            const cycleResult = await scanAndStartCycle(code, branch_code, pickupWeight, route_id, additionalData);
            console.log('✅ Cycle result:', cycleResult);
            
            if (cycleResult.success) {
              Alert.alert(
                '✅ Barcode Scanned & Cycle Started',
                `Barcode: ${code}\nBag Type: ${barcodeInfo.bagtype || 'N/A'}\nBranch: ${branch_code}\nWeight: ${pickupWeight} kg\nStatus: Picked`,
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      // Reactivate camera after 2 seconds
                      setTimeout(() => {
                        setCameraActive(true);
                      }, 2000);
                    },
                  },
                ]
              );
            } else {
              // Barcode valid but cycle creation failed
              Alert.alert(
                '⚠️ Barcode Validated',
                `Barcode: ${code}\nBag Type: ${barcodeInfo.bagtype || 'N/A'}\n\nCycle creation failed: ${cycleResult.error || 'Unknown error'}`,
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      setTimeout(() => {
                        setCameraActive(true);
                      }, 2000);
                    },
                  },
                ]
              );
            }
          } catch (cycleError) {
            console.error('Error starting cycle:', cycleError);
            // Show barcode validated but cycle failed
            Alert.alert(
              '✅ Barcode Validated',
              `Barcode: ${code}\nBag Type: ${barcodeInfo.bagtype || 'N/A'}\n\nNote: Cycle creation failed. Please try again.`,
              [
                {
                  text: 'OK',
                  onPress: () => {
                    setTimeout(() => {
                      setCameraActive(true);
                    }, 2000);
                  },
                },
              ]
            );
          }
        } else {
          // Barcode valid but missing branch_code or weight
          let missingInfo = [];
          if (!branch_code) missingInfo.push('branch code');
          if (!pickupWeight) missingInfo.push('weight');
          
          Alert.alert(
            '✅ Barcode Validated',
            `Barcode: ${code}\nBag Type: ${barcodeInfo.bagtype || 'N/A'}\n\n⚠️ Cannot start cycle: Missing ${missingInfo.join(' and ')}`,
            [
              {
                text: 'OK',
                onPress: () => {
                  setTimeout(() => {
                    setCameraActive(true);
                  }, 2000);
                },
              },
            ]
          );
        }
      } else {
        Alert.alert(
          '❌ Barcode Error',
          scanResult.error || 'Barcode not found or inactive',
          [
            {
              text: 'OK',
              onPress: () => {
                // Clear barcode and reactivate camera
                setScannedBarcode('');
                setBarcodeInput('');
                setTimeout(() => {
                  setCameraActive(true);
                }, 2000);
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error validating barcode:', error);
      Alert.alert(
        'Error',
        'Failed to validate barcode. Please try again.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Reactivate camera after 2 seconds
              setTimeout(() => {
                setCameraActive(true);
              }, 2000);
            },
          },
        ]
      );
    }
  };

  const handleBarcodeInput = (text) => {
    setBarcodeInput(text);
    setScannedBarcode(text);
  };

  const toggleCamera = () => {
    if (!cameraModuleAvailable || !device) {
      setCameraError('Camera not available. Please rebuild the app.');
      return;
    }
    if (hasCameraPermission && device) {
      setShowCamera(!showCamera);
      setCameraActive(!showCamera);
    } else {
      requestBarcodeCameraPermission();
    }
  };

  const clearBarcode = () => {
    setScannedBarcode('');
    setBarcodeInput('');
  };

  // Scanning area dimensions (rectangle instead of square)
  const scanAreaWidth = width * 0.85;
  const scanAreaHeight = 150; // Rectangle height

  const scanLineTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, scanAreaHeight - 4],
  });

  // Helper to build a proper file part for FormData with correct mime/extension
  const buildFilePart = (asset, prefix) => {
    if (!asset) return null;
    const mimeType = asset.type || 'image/jpeg';
    let ext = 'jpg';
    const mimeMatch = mimeType.match(/image\/([a-zA-Z0-9+.-]+)/);
    if (mimeMatch && mimeMatch[1]) {
      ext = mimeMatch[1] === 'jpeg' ? 'jpg' : mimeMatch[1];
    } else if (asset.fileName) {
      const nameMatch = asset.fileName.match(/\.([a-zA-Z0-9]+)$/);
      if (nameMatch && nameMatch[1]) {
        ext = nameMatch[1];
      }
    }
    const name = `${prefix}_${Date.now()}.${ext}`;
    return {
      uri: asset.uri,
      type: mimeType,
      name,
    };
  };

  const handleDataSubmit = async () => {
    // Validate required data (excluding image)
    if (!weight || parseFloat(weight) <= 0) {
      Alert.alert('Error', 'Please enter a valid weight.');
      return;
    }

    // Check if session is still valid
    if (!ensureValidSession()) {
      Alert.alert('Session Expired', 'Your session has expired. Please login again.');
      navigation.navigate('DriverLogin');
      return;
    }

    // Geofence validation removed - proceed without location check

    try {
      setIsSubmitting(true);
      
      // Create AbortController for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 30000); // 30 second timeout

      // Pre-check: ensure current sequence is started if required
      try {
        const statusController = new AbortController();
        const statusTimeoutId = setTimeout(() => statusController.abort(), 15000);
        const authHeadersPre = getAuthHeaders();
        const primaryBasePre = GLOBAL_BASE_URL;
        const fallbackBasePre = 'http://localhost:5000';
        const statusPath = '/multi-pickup/current-status';
        let statusResp; let statusErr;
        for (const base of [primaryBasePre, fallbackBasePre]) {
          const url = `${base}${statusPath}`;
          try {
            statusResp = await fetch(url, { method: 'GET', headers: { ...authHeadersPre, 'Accept': 'application/json' }, signal: statusController.signal });
            break;
          } catch (er) {
            statusErr = er; continue;
          }
        }
        clearTimeout(statusTimeoutId);
        if (statusResp) {
          const statusText = await statusResp.text();
          if (statusText && statusText.trim() !== '') {
            let statusData; try { statusData = JSON.parse(statusText); } catch {}
            const nextAction = statusData?.data?.next_action;
            if (nextAction && String(nextAction).toLowerCase().includes('start')) {
              const nextController = new AbortController();
              const nextTimeoutId = setTimeout(() => nextController.abort(), 15000);
              const primaryBaseNext = GLOBAL_BASE_URL; const fallbackBaseNext = 'http://localhost:5000'; const nextPath = '/multi-pickup/auto-start-next';
              let nextResponse; let nextErr;
              for (const base of [primaryBaseNext, fallbackBaseNext]) {
                const nextApiUrl = `${base}${nextPath}`;
                try {
                  nextResponse = await fetch(nextApiUrl, { method: 'POST', headers: { ...authHeadersPre, 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({}), signal: nextController.signal });
                  break;
                } catch (er) { nextErr = er; continue; }
              }
              clearTimeout(nextTimeoutId);
              if (!nextResponse) {
                console.warn('⚠️ Could not auto-start sequence before completion. Proceeding anyway.');
              } else {
                const nt = await nextResponse.text();
                let nd; try { nd = nt ? JSON.parse(nt) : null; } catch {}
                const ok = nextResponse.ok && nd?.status === 'success';
              }
            }
          }
        }
      } catch (preErr) {
        console.warn('⚠️ Pre-start check failed (continuing):', preErr?.message || preErr);
      }

      console.log('Submitting pickup completion data (total_waste, images)...');
      
      // Get session data to access dl_no and vehicle_no
      const sessionData = getSessionData();
      if (!sessionData) {
        Alert.alert('Error', 'Session data not found. Please login again.');
        navigation.navigate('DriverLogin');
        return;
      }
      
      // API does not require driving license or vehicle number for this endpoint
      
      // Validate required images
      if (!uploadedImage) {
        Alert.alert('Error', 'Please upload waste image before submitting.');
        return;
      }

      if (!uploadedReceiptImage) {
        Alert.alert('Error', 'Please upload receipt image before submitting.');
        return;
      }

      // Additional validation

      if (!weight || parseFloat(weight) <= 0) {
        Alert.alert('Error', 'Invalid weight value.');
        return;
      }
      
      // API call to auto-complete current pickup
      // Create FormData for multipart/form-data request
      const formData = new FormData();
      
      // Add text fields
      formData.append('weight', parseFloat(weight).toString());
      // dl_no and vehicle_no are not required for this API
      
      // Add waste image (photo field)
      const wasteImagePart = buildFilePart(uploadedImage, 'photo');
      if (wasteImagePart) {
        formData.append('photo', wasteImagePart);
      }
      
      // Add receipt image
      const receiptImagePart = buildFilePart(uploadedReceiptImage, 'receipt_image');
      if (receiptImagePart) {
        formData.append('receipt_image', receiptImagePart);
      }

      // Get authentication headers
      const authHeaders = getAuthHeaders();
      
      // API endpoint with fallback handling
      const primaryBase = GLOBAL_BASE_URL;
      const fallbackBase = 'http://localhost:5000';
      const endpointPath = '/multi-pickup/auto-complete-current';

      let response;
      let lastError;
      for (const base of [primaryBase, fallbackBase]) {
        const API_URL = `${base}${endpointPath}`;
        console.log(`Making request to: ${API_URL}`);
        try {
          response = await fetch(API_URL, {
            method: 'POST',
            headers: {
              ...authHeaders,
              // Do NOT set Content-Type header - let React Native set it automatically with boundary
            },
            body: formData,
            signal: controller.signal,
          });
          // If we got a response, break out (even if non-200; we'll handle below)
          break;
        } catch (err) {
          lastError = err;
          // Try next base URL only if network error
          continue;
        }
      }
      if (!response) {
        throw lastError || new Error('Network error');
      }
      
      console.log('Response received, status:', response.status);
      clearTimeout(timeoutId);

      // Parse response
      let responseData;
      let responseText = '';
      try {
        responseText = await response.text();
        if (!responseText || responseText.trim() === '') {
          throw new Error('Empty response from server. Please try again.');
        }
        
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error('Invalid response from server. Please check your internet connection and try again.');
      }

      // If API says sequence not started yet (400), auto-start then retry completion once
      if (!response.ok && response.status === 400 && typeof responseData?.message === 'string' && responseData.message.toLowerCase().includes('not started')) {
        console.log('ℹ️ Server indicates sequence not started. Auto-starting and retrying completion once...');
        try {
          const authHeadersNext = getAuthHeaders();
          const primaryBaseNext = GLOBAL_BASE_URL; const fallbackBaseNext = 'http://localhost:5000'; const nextPath = '/multi-pickup/auto-start-next';
          let nextResponse; let nextErr;
          for (const base of [primaryBaseNext, fallbackBaseNext]) {
            const nextApiUrl = `${base}${nextPath}`;
            console.log(`Making request to: ${nextApiUrl}`);
            try {
              nextResponse = await fetch(nextApiUrl, { method: 'POST', headers: { ...authHeadersNext, 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({}), signal: controller.signal });
              break;
            } catch (er) { nextErr = er; continue; }
          }
          if (!nextResponse) throw nextErr || new Error('Network error while starting sequence');
          const nextText = await nextResponse.text();
          let nextData; try { nextData = nextText ? JSON.parse(nextText) : null; } catch {}
          const nextOk = nextResponse.ok && nextData?.status === 'success';
          if (nextOk) {
            // Retry completion once
            let retryResp; let retryErr;
            const primaryBaseR = GLOBAL_BASE_URL; const fallbackBaseR = 'http://localhost:5000'; const endpointPathR = '/multi-pickup/auto-complete-current';
            for (const base of [primaryBaseR, fallbackBaseR]) {
              const API_URL_R = `${base}${endpointPathR}`;
              try {
                retryResp = await fetch(API_URL_R, { method: 'POST', headers: { ...authHeaders }, body: formData, signal: controller.signal });
                break;
              } catch (er) { retryErr = er; continue; }
            }
            if (!retryResp) throw retryErr || new Error('Network error');
            const retryText = await retryResp.text();
            response = retryResp; responseData = retryText ? JSON.parse(retryText) : {};
          } else {
            console.warn('⚠️ Auto-start-next failed, not retrying completion.');
          }
        } catch (startErr) {
          console.warn('⚠️ Failed to auto-start and retry:', startErr?.message || startErr);
        }
      }

      // Check for successful response
      const isSuccess = response.ok && responseData.status === 'success';

      if (isSuccess) {
        
        // Mark all data as submitted
        setIsWeightSubmitted(true);
        setIsDataSubmitted(true);
        // Store receipt_url from server if provided
        try {
          const serverReceiptUrl = responseData?.data?.receipt_url;
          if (serverReceiptUrl && typeof serverReceiptUrl === 'string') {
            setReceiptUrl(serverReceiptUrl);
          }
          const serverPhotoUrl = responseData?.data?.photo_path;
          if (serverPhotoUrl && typeof serverPhotoUrl === 'string') {
            setPhotoUrl(serverPhotoUrl);
          }
        } catch {}
        
        // Update app state with completed form data
        const sessionData = getSessionData();
        const appStateData = {
          current_page: 'pickup_form',
          navigation_started: true,
          pickup_form_data: {
            total_waste: parseFloat(weight),
            waste_image_uploaded: !!uploadedImage || !!(responseData?.data?.photo_path),
            receipt_image_uploaded: !!uploadedReceiptImage || !!(responseData?.data?.receipt_url),
            receipt_url: responseData?.data?.receipt_url || null,
            photo_path: responseData?.data?.photo_path || null,
          },
          completed_steps: ['navigation', 'form_submission'],
          last_activity: new Date().toISOString(),
        };
        
        try {
          console.log('📤 Updating app state on backend...');
          console.log('App state data:', JSON.stringify(appStateData, null, 2));
          
          const updateResult = await updateAppState(appStateData);
          
          if (updateResult && updateResult.success) {
          } else {
            console.warn('⚠️ App state update returned:', updateResult);
          }
        } catch (error) {
          // Don't block success flow if app state update fails
        }
        
        // Note: Even if it's the last sequence, user must complete POC details first
        // Trip completion will happen after DetailsScreen

        // Auto-start next sequence after successful completion
        try {
          const nextController = new AbortController();
          const nextTimeoutId = setTimeout(() => nextController.abort(), 15000);
          const authHeadersNext = getAuthHeaders();

          // Primary + fallback base URLs
          const primaryBaseNext = GLOBAL_BASE_URL;
          const fallbackBaseNext = 'http://localhost:5000';
          const nextPath = '/multi-pickup/auto-start-next';

          let nextResponse;
          let nextErr;
          for (const base of [primaryBaseNext, fallbackBaseNext]) {
            const nextApiUrl = `${base}${nextPath}`;
            console.log(`Making request to: ${nextApiUrl}`);
            try {
              nextResponse = await fetch(nextApiUrl, {
                method: 'POST',
                headers: {
                  ...authHeadersNext,
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
                signal: nextController.signal,
              });
              break;
            } catch (er) {
              nextErr = er;
              continue;
            }
          }
          if (!nextResponse) throw nextErr || new Error('Network error');
          clearTimeout(nextTimeoutId);

          let nextData;
          let nextText = '';
          try {
            nextText = await nextResponse.text();
            console.log('=== AUTO-START-NEXT API RESPONSE DEBUG ===');
            console.log('Raw response text:', nextText);
            console.log('Response status:', nextResponse.status);
            console.log('Response statusText:', nextResponse.statusText);
            console.log('==========================================');
            if (!nextText || nextText.trim() === '') {
              throw new Error('Empty response from server');
            }
            nextData = JSON.parse(nextText);
          } catch (parseErr) {
            throw new Error('Invalid response from server for starting next sequence.');
          }

          const nextOk = nextResponse.ok && nextData.status === 'success';
          console.log('Auto-start-next success check:', { responseOk: nextResponse.ok, dataStatus: nextData.status, finalIsSuccess: nextOk });

          if (nextOk) {
            try {
              const moveResult = await moveToNextPickup();
              if (!moveResult?.success) {
                console.warn('⚠️ Failed to move to next pickup in local session:', moveResult?.error);
              }
            } catch (moveErr) {
              console.warn('⚠️ moveToNextPickup error:', moveErr);
            }
            try {
              // Get next pickup number for DetailsScreen
              const sessionData = getSessionData();
              const nextPickup = sessionData?.totals?.current ? sessionData.totals.current + 1 : currentPickup + 1;
              // Navigate to DetailsScreen instead of PickupStart
              navigation.navigate('Details', { nextPickup: nextPickup });
            } catch (navErr) {
              console.warn('⚠️ Navigation to Details failed:', navErr);
            }
            // Don't show alert here - DetailsScreen will handle the flow
          } else {
            let errMsg = nextData?.message || 'Failed to start next sequence';
            if (nextResponse.status === 401) errMsg = 'Unauthorized. Please login again.';
            else if (nextResponse.status >= 500) errMsg = 'Server error. Please try again later.';
            console.warn('❌ Auto-start-next failed:', errMsg);
            Alert.alert('Warning', errMsg);
          }
        } catch (nextErr) {
          console.error('❌ Auto-start-next error:', nextErr?.message || nextErr);
          // Still navigate to DetailsScreen even if auto-start-next fails
          try {
            const sessionData = getSessionData();
            const nextPickup = sessionData?.totals?.current ? sessionData.totals.current + 1 : currentPickup + 1;
            navigation.navigate('Details', { nextPickup: nextPickup });
          } catch (navErr) {
            console.warn('⚠️ Navigation to Details failed:', navErr);
          }
        }
        
        // Don't show alert - DetailsScreen will handle the flow
      } else {
        console.log('HTTP Status:', response.status);
        console.log('Status Text:', response.statusText);
        console.log('Error details:', responseData);
        
        let errorMsg = 'Failed to save pickup data';
        
        // Handle specific HTTP status codes
        if (response.status === 500) {
          errorMsg = 'Server error occurred. Please try again or contact support.';
          if (responseData?.message) {
            errorMsg += ` Details: ${responseData.message}`;
          }
        } else if (response.status === 400) {
          errorMsg = 'Invalid data sent to server.';
          if (responseData?.message) {
            errorMsg = responseData.message;
          }
        } else if (response.status === 404) {
          errorMsg = 'API endpoint not found. Please contact support.';
        } else if (response.status === 422) {
          errorMsg = 'Data validation failed on server.';
          if (responseData?.message) {
            errorMsg = responseData.message;
          }
        } else if (response.status === 0) {
          errorMsg = 'Network error. Please check your internet connection and server availability.';
        } else {
          // Generic error handling
          if (responseData?.message) {
            errorMsg = responseData.message;
          } else if (responseData?.error) {
            errorMsg = responseData.error;
          } else if (responseData?.details) {
            errorMsg = responseData.details;
          }
        }
        
        throw new Error(`${errorMsg} (Status: ${response.status})`);
      }

    } catch (error) {
      console.error('=== PICKUP COMPLETION ERROR ===');
      console.error('Error name:', error?.name || 'Unknown');
      console.error('Error message:', error?.message || 'Unknown error');
      console.error('================================');
      
      let errorMessage = 'Failed to submit pickup data. Please try again.';
      
      if (error?.name === 'AbortError') {
        errorMessage = 'Request timed out. Please check your connection and try again.';
      } else if (error?.message?.includes('Network request failed') || 
                 error?.message?.includes('Network error') ||
                 error?.message?.includes('fetch') ||
                 error?.message?.includes('Network')) {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (error?.message?.includes('Failed to save pickup data')) {
        errorMessage = error.message;
      } else if (error?.message?.includes('Invalid response') || 
                 error?.message?.includes('JSON')) {
        errorMessage = 'Server error. Please try again.';
      } else if (error?.message?.includes('Session Expired')) {
        errorMessage = 'Session expired. Please login again.';
        setTimeout(() => navigation.navigate('DriverLogin'), 2000);
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Pickup Data Submission Failed', errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEndTrip = async () => {
    // Check if all required data has been submitted first
    if (!isWeightSubmitted) {
      Alert.alert('Error', 'Please submit weight data first.');
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      // Build URL with primary + fallback
      const primaryBase = GLOBAL_BASE_URL;
      const fallbackBase = 'http://localhost:5000';
      const endpointPath = '/multi-pickup/auto-complete-trip';

      const authHeaders = getAuthHeaders();
      let response;
      let lastError;
      for (const base of [primaryBase, fallbackBase]) {
        const API_URL = `${base}${endpointPath}`;
        console.log(`Making request to: ${API_URL}`);
        try {
          response = await fetch(API_URL, {
            method: 'POST',
            headers: {
              ...authHeaders,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
            signal: controller.signal,
          });
          break;
        } catch (err) {
          lastError = err;
          continue;
        }
      }
      clearTimeout(timeoutId);
      if (!response) throw lastError || new Error('Network error');

      // Parse response
      let responseData;
      let responseText = '';
      try {
        responseText = await response.text();
        console.log('=== AUTO-COMPLETE-TRIP API RESPONSE DEBUG ===');
        console.log('Raw response text:', responseText);
        console.log('Response status:', response.status);
        console.log('Response statusText:', response.statusText);
        console.log('============================================');
        if (!responseText || responseText.trim() === '') {
          throw new Error('Empty response from server');
        }
        responseData = JSON.parse(responseText);
        } catch (parseError) {
          throw new Error('Invalid response from server.');
        }

      // Success check
      const isSuccess = response.ok && responseData.status === 'success';
      console.log('Auto-complete-trip success check:', { responseOk: response.ok, dataStatus: responseData.status, finalIsSuccess: isSuccess });

      if (isSuccess) {

        // Update app state to reflect trip completion
        try {
          const appStateData = {
            current_page: 'pickup_form',
            navigation_started: false,
            pickup_form_data: {
              ...getSessionData()?.appState?.pickup_form_data,
            },
            completed_steps: ['navigation', 'form_submission', 'trip_completed'],
            last_activity: new Date().toISOString(),
          };
          await updateAppState(appStateData);
        } catch (stateErr) {
          console.warn('⚠️ Failed to update app state after trip completion:', stateErr);
        }

        // Immediately navigate to Base and reset stack
        navigation.reset({ index: 0, routes: [{ name: 'Base' }] });
      } else {
        let errMsg = responseData?.message || 'Failed to complete trip';
        if (response.status === 401) errMsg = 'Unauthorized. Please login again.';
        else if (response.status >= 500) errMsg = 'Server error. Please try again later.';
        Alert.alert('Error', errMsg);
      }
    } catch (error) {
      Alert.alert('Error', `Failed to process trip completion: ${error.message || 'Unknown error'}`);
    }
  };



  const handleBackPress = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      
      {/* Fixed Header with Back Button and Title */}
      <View style={styles.headerContainer}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={handleBackPress}
          activeOpacity={0.7}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        
        <Text style={styles.screenTitle}>{t('pickupDataSubmission')}</Text>
      </View>
      
      {/* Main content container */}
      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.mainContainer}>
        
        {/* Image placeholder */}
        <View style={styles.imagePlaceholder}>
          {uploadedImage || photoUrl ? (
            <View style={styles.imageContainer}>
              <Image 
                source={{ uri: (uploadedImage && uploadedImage.uri) || photoUrl }}
                style={styles.capturedImage}
                resizeMode="cover"
              />
            </View>
          ) : (
            <View style={styles.cameraIconContainer}>
              <View style={styles.cameraIconWrapper}>
                <View style={styles.cameraBody}>
                  <View style={styles.cameraLens} />
                  <View style={styles.cameraButton} />
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Upload Waste Image button */}
        <TouchableOpacity style={styles.uploadButton} onPress={handleUploadImage}>
          <Text style={styles.uploadText}>{t('uploadWasteImage')}</Text>
        </TouchableOpacity>

        {/* Receipt Image Card */}
        <View style={styles.receiptCard}>
          <View style={styles.receiptImagePlaceholder}>
            {uploadedReceiptImage || receiptUrl ? (
              <View style={styles.imageContainer}>
                <Image 
                source={{ uri: receiptUrl || uploadedReceiptImage.uri }}
                  style={styles.capturedImage}
                  resizeMode="cover"
                />
              </View>
            ) : (
              <View style={styles.cameraIconContainer}>
                <View style={styles.cameraIconWrapper}>
                  <View style={styles.cameraBody}>
                    <View style={styles.cameraLens} />
                    <View style={styles.cameraButton} />
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Upload Receipt Image button */}
          <TouchableOpacity 
            style={styles.uploadReceiptButton} 
            onPress={handleUploadReceiptImage}
          >
            <Text style={styles.uploadReceiptText}>{t('uploadReceiptImage')}</Text>
          </TouchableOpacity>
        </View>

        {/* Weight input section */}
        <View style={styles.weightSection}>
          <TextInput
            style={styles.weightInput}
            placeholder={t('weightInKg')}
            placeholderTextColor="#999"
            value={weight}
            keyboardType="numeric"
            onChangeText={handleWeightChange}
          />
        </View>

        {/* Barcode Scanner Section */}
        <View style={styles.barcodeSection}>
          <Text style={styles.barcodeLabel}>Barcode Scanner</Text>
          
          {/* Camera View - Rectangle Scanner */}
          {cameraModuleAvailable && hasCameraPermission && device && showCamera && Camera && codeScanner ? (
            <View style={styles.cameraContainer}>
              <Camera
                ref={camera}
                style={styles.cameraView}
                device={device}
                isActive={cameraActive}
                codeScanner={codeScanner}
              />
              
              {/* Rectangle Scanning frame overlay */}
              <View style={styles.scanFrameOverlay}>
                <View style={[styles.scanFrame, { width: scanAreaWidth, height: scanAreaHeight }]}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                  
                  {/* Animated scan line */}
                  <Animated.View
                    style={[
                      styles.scanLine,
                      {
                        transform: [{ translateY: scanLineTranslateY }],
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.placeholderContainer}>
              <View style={[styles.scanFrame, { width: scanAreaWidth, height: scanAreaHeight }]}>
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
                <View style={styles.placeholderContent}>
                  <Text style={styles.placeholderIcon}>📷</Text>
                  <Text style={styles.placeholderText}>
                    {!cameraModuleAvailable 
                      ? 'Camera not available. Use manual input below.' 
                      : !hasCameraPermission 
                        ? 'Camera permission required' 
                        : !device 
                          ? 'Camera device not available' 
                          : 'Tap to enable camera'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Manual Input Section */}
          <View style={styles.inputSection}>
            <View style={styles.inputHeader}>
              <Text style={styles.inputLabel}>Enter Barcode</Text>
              {cameraModuleAvailable && (
                <TouchableOpacity onPress={toggleCamera} style={styles.cameraToggle}>
                  <Text style={styles.cameraToggleText}>
                    {showCamera ? '📷 Hide Camera' : '📷 Show Camera'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={[
                styles.barcodeInput,
                isFocused && styles.inputFocused,
              ]}
              value={barcodeInput}
              onChangeText={handleBarcodeInput}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Type barcode here"
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              keyboardType="default"
            />
            {barcodeInput ? (
              <TouchableOpacity style={styles.clearBarcodeButton} onPress={clearBarcode}>
                <Text style={styles.clearBarcodeText}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Submit button at the end of card */}
        <TouchableOpacity 
          style={[
            styles.submitDataButton,
            (weight && parseFloat(weight) > 0 && !isSubmitting) && styles.submitDataButtonActive,
            isSubmitting && styles.buttonDisabled
          ]} 
          onPress={handleDataSubmit}
          disabled={!weight || parseFloat(weight) <= 0 || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={[
              styles.submitDataText,
              (weight && parseFloat(weight) > 0) && styles.submitDataTextActive
            ]}>
              {t('submit')}
            </Text>
          )}
        </TouchableOpacity>
        </View>
      </ScrollView>

      {/* End Trip button removed as per requirement */}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    position: 'sticky',
    top: 0,
    zIndex: 1000,
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffffff',
    marginRight: 12,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scrollContainer: {
    flex: 1,
  },
  mainContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 20,
  },
  screenTitle: {
    fontSize: width < 400 ? 18 : 20,
    fontWeight: 'bold',
    color: '#ffffff',
    flex: 1,
    textAlign: 'left',
  },
  imagePlaceholder: {
    width: '100%',
    height: width < 400 ? 100 : 120,
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 12,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cameraIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIconWrapper: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBody: {
    width: 50,
    height: 35,
    backgroundColor: '#333',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  cameraLens: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#666',
    borderWidth: 2,
    borderColor: '#999',
  },
  cameraButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#666',
  },
  capturedImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  imageContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadButton: {
    backgroundColor: '#1a4d2e',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#1a4d2e',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  uploadText: {
    color: 'white',
    fontSize: width < 400 ? 14 : 16,
    fontWeight: 'bold',
  },
  receiptCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#ddd',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  receiptImagePlaceholder: {
    width: '100%',
    height: width < 400 ? 80 : 100,
    backgroundColor: '#f8f9fa',
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadReceiptButton: {
    backgroundColor: '#007bff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#007bff',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  uploadReceiptText: {
    color: 'white',
    fontSize: width < 400 ? 12 : 14,
    fontWeight: 'bold',
  },
  weightSection: {
    marginBottom: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#ddd',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  weightInput: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#000000',
  },
  barcodeSection: {
    marginBottom: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#ddd',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  barcodeLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 12,
  },
  cameraContainer: {
    width: '100%',
    height: 200,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  cameraView: {
    width: '100%',
    height: '100%',
  },
  scanFrameOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  placeholderContainer: {
    width: '100%',
    height: 200,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    overflow: 'hidden',
  },
  scanFrame: {
    borderWidth: 2,
    borderColor: '#2196F3',
    borderRadius: 12,
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: 'visible',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#2196F3',
    borderWidth: 3,
  },
  topLeft: {
    top: -3,
    left: -3,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
  },
  topRight: {
    top: -3,
    right: -3,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 12,
  },
  bottomLeft: {
    bottom: -3,
    left: -3,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
  },
  bottomRight: {
    bottom: -3,
    right: -3,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 12,
  },
  scanLine: {
    position: 'absolute',
    width: '90%',
    height: 2,
    backgroundColor: '#2196F3',
    shadowColor: '#2196F3',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 5,
  },
  placeholderContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  placeholderText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  inputSection: {
    marginTop: 10,
  },
  inputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  cameraToggle: {
    padding: 5,
  },
  cameraToggleText: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '600',
  },
  barcodeInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    color: '#333',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    marginBottom: 10,
  },
  inputFocused: {
    borderColor: '#2196F3',
    backgroundColor: '#FFFFFF',
  },
  clearBarcodeButton: {
    backgroundColor: '#ff6b6b',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  clearBarcodeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  submitDataButton: {
    backgroundColor: '#9e9e9e',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 20,
    marginHorizontal: 0,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  submitDataButtonActive: {
    backgroundColor: '#4caf50', // Green color when active
    shadowColor: '#4caf50',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  submitDataText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  submitDataTextActive: {
    color: 'white',
  },
  buttonDisabled: {
    backgroundColor: '#9e9e9e',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonWrapper: {
    paddingBottom: 20,
    paddingHorizontal: 0,
    marginTop: 10,
  },
  endTripButton: {
    backgroundColor: '#d32f2f',
    borderRadius: 12,
    paddingVertical: width < 400 ? 14 : 16,
    paddingHorizontal: width < 400 ? 20 : 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    shadowColor: '#d32f2f',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  endTripText: {
    color: 'white',
    fontSize: width < 400 ? 16 : 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  arrowIcon: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export default UpdatingStatsScreen;