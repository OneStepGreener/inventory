import React, { useState } from 'react';
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
} from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import { t, subscribeToLanguageChanges } from '../utils/translations';
import { useLanguage } from '../contexts/LanguageContext';
import { stopPeriodicLocationTracking, sendLocationUpdate } from '../services/locationService';
import { getSessionData } from '../frontendStore';

const { width, height } = Dimensions.get('window');

const FinalPickupScreen = ({ navigation, route }) => {
  const [weight, setWeight] = useState('');
  const [uploadedImage, setUploadedImage] = useState(null);
  const { currentLanguage, forceUpdate, updateTrigger } = useLanguage();
  const [refreshKey, setRefreshKey] = useState(0);

  // Get current pickup number from route params
  const currentPickup = route.params?.currentPickup || 10;

  // Subscribe to language changes
  React.useEffect(() => {
    const unsubscribe = subscribeToLanguageChanges((newLang) => {
      console.log('🔄 FinalPickupScreen: Language changed to:', newLang);
      setRefreshKey(prev => prev + 1);
    });
    return unsubscribe;
  }, []);

  const requestCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'This app needs camera access to take photos.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return false;
      }
    } else {
      return true; // iOS handles permissions differently
    }
  };

  const handleUploadImage = async () => {
    try {
      const hasPermission = await requestCameraPermission();
      
      if (!hasPermission) {
        Alert.alert('Permission Denied', 'Camera permission is required to take photos.');
        return;
      }

      // Launch camera with specific options
      const result = await launchCamera({
        mediaType: 'photo',
        includeBase64: false,
        maxHeight: 2000,
        maxWidth: 2000,
        quality: 0.8,
        saveToPhotos: false,
      });

      if (result.assets && result.assets.length > 0) {
        const photo = result.assets[0];
        console.log('Photo captured:', photo);
        setUploadedImage(photo);
        Alert.alert('Success', 'Photo captured successfully!');
      } else if (result.didCancel) {
        console.log('User cancelled camera');
      } else if (result.errorCode) {
        Alert.alert('Error', `Camera error: ${result.errorMessage}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open camera or photo was cancelled.');
    }
  };

  const handleSubmit = () => {
    if (!uploadedImage) {
      Alert.alert('Error', 'Please upload an image first.');
      return;
    }

    if (!weight || weight.trim() === '') {
      Alert.alert('Error', 'Please enter the weight.');
      return;
    }

    // Validate weight is a number
    if (isNaN(weight) || parseFloat(weight) <= 0) {
      Alert.alert('Error', 'Please enter a valid weight.');
      return;
    }

    Alert.alert('Success', 'Data submitted successfully!');
    // Navigate to next pickup or reset form
  };

  const handleEndPickup = async () => {
    // Validation: Check if image is uploaded and weight is entered
    if (!uploadedImage) {
      Alert.alert('Error', 'Please upload an image before ending pickup.');
      return;
    }

    if (!weight || weight.trim() === '') {
      Alert.alert('Error', 'Please enter the weight before ending pickup.');
      return;
    }

    // Validate weight is a number
    if (isNaN(weight) || parseFloat(weight) <= 0) {
      Alert.alert('Error', 'Please enter a valid weight before ending pickup.');
      return;
    }

    // Send pickup complete event and stop location tracking
    const sessionData = getSessionData();
    if (sessionData && sessionData.assignment) {
      const driverData = {
        dl_number: sessionData.assignment.dl_no,
        vehicle_no: sessionData.assignment.vehicle_no,
      };
      
      console.log('🏁 Sending pickup complete event...');
      await sendLocationUpdate(driverData, 'pickup_complete');
      
      console.log('🛑 Stopping periodic location tracking...');
      stopPeriodicLocationTracking();
    }

    // Show completion alert
    Alert.alert(
      'Pickup Complete!',
      'All 10 pickups have been completed successfully!',
      [
        {
          text: 'Logout',
          onPress: () => {
            // Navigate back to DriverLoginScreen to logout
            navigation.reset({
              index: 0,
              routes: [{ name: 'DriverLogin' }],
            });
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      
      {/* Main white card */}
      <View style={styles.mainCard}>
        {/* Final Pickup Progress */}
        <View style={styles.pickupProgress}>
          <Text style={styles.pickupText}>{t('finalPickup')} - {currentPickup} of 10</Text>
        </View>

        {/* Image placeholder */}
        <View style={styles.imagePlaceholder}>
          {uploadedImage ? (
            <View style={styles.imageContainer}>
              <Image 
                source={{ uri: uploadedImage.uri }}
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

        {/* Upload Image button */}
        <TouchableOpacity style={styles.uploadButton} onPress={handleUploadImage}>
          <Text style={styles.uploadText}>{t('takePhoto')}</Text>
        </TouchableOpacity>

        {/* Photo Captured text - only show when photo is captured */}
        {uploadedImage && (
          <View style={styles.photoCapturedContainer}>
            <Text style={styles.imageText}>{t('photoCaptured')}</Text>
          </View>
        )}

        {/* Weight input and Submit */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.weightInput}
            placeholder="Weight in kg"
            placeholderTextColor="#999"
            value={weight}
            onChangeText={(text) => {
              // Only allow numbers and decimal point
              const numericText = text.replace(/[^0-9.]/g, '');
              setWeight(numericText);
            }}
            keyboardType="numeric"
          />
          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitText}>{t('submit')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* End Pickup button */}
      <TouchableOpacity style={styles.nextPickupButton} onPress={handleEndPickup}>
        <Text style={styles.nextPickupText}>{t('endPickup')}</Text>
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
    paddingTop: 60,
  },
  mainCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    height: height * 0.6, // Decrease card size to 60% of screen height
    width: '90%', // Decrease card width to 90%
    alignSelf: 'center', // Center the card
  },
  pickupProgress: {
    marginBottom: 20,
    alignItems: 'center',
  },
  pickupText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 15,
    justifyContent: 'center',
    alignItems: 'center',
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
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  imageContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageText: {
    fontSize: 16,
    color: '#1a4d2e',
    fontWeight: 'bold',
    marginTop: 15, // Move text down
  },
  uploadButton: {
    backgroundColor: '#1a4d2e',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 15,
    marginBottom: 15,
  },
  uploadText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  photoCapturedContainer: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 15,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 15,
  },
  weightInput: {
    flex: 1,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: '#000', // Changed to black
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  nextPickupButton: {
    backgroundColor: '#ff0000',
    borderRadius: 8,
    paddingVertical: 6, // Decreased padding
    paddingHorizontal: 12, // Decreased horizontal padding
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 40,
    alignSelf: 'center', // Center the button
    width: '90%', // Match card width
  },
  nextPickupText: {
    color: 'white',
    fontSize: 14, // Decreased font size
    fontWeight: 'bold',
  },
  arrowIcon: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default FinalPickupScreen; 