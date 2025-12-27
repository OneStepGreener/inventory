import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import { launchCamera } from 'react-native-image-picker';

export const openCamera = () => {
  return new Promise((resolve, reject) => {
    const options = {
      mediaType: 'photo',
      includeBase64: false,
      maxHeight: 2000,
      maxWidth: 2000,
      quality: 0.8,
      saveToPhotos: false,
    };

    launchCamera(options, (response) => {
      if (response.didCancel) {
        reject(new Error('Camera access cancelled'));
      } else if (response.error) {
        reject(new Error(response.error));
      } else if (response.assets && response.assets[0]) {
        resolve(response.assets[0]);
      } else {
        reject(new Error('No image captured'));
      }
    });
  });
};

export const requestCameraPermission = () => {
  return new Promise(async (resolve) => {
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
        resolve(granted === PermissionsAndroid.RESULTS.GRANTED);
      } catch (err) {
        console.warn(err);
        resolve(false);
      }
    } else {
      // For iOS, permissions are handled by the image picker
      resolve(true);
    }
  });
}; 