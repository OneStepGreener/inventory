import React, { useState, useCallback, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  SafeAreaView,
  Dimensions,
  Platform,
  Image,
} from 'react-native';

const { width, height } = Dimensions.get('window');

// Responsive calculations
const isSmallScreen = height < 700;
const isLargeScreen = height > 800;
const responsiveModalWidth = isSmallScreen ? width * 0.9 : width * 0.85;
const responsiveModalHeight = isSmallScreen ? '85%' : '90%';

const languages = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'hi', name: 'Hindi', native: 'हिंदी' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
];

// Memoized language item component for better performance
const LanguageItem = memo(({ item, isSelected, onPress }) => (
  <TouchableOpacity
    style={[styles.languageItem, isSelected && styles.selectedLanguageItem]}
    onPress={onPress}
    activeOpacity={0.6}
  >
    <Text style={[styles.languageName, isSelected && styles.selectedLanguageText]}>
      {item.name}
    </Text>
    <Text style={[styles.languageNative, isSelected && styles.selectedLanguageText]}>
      {item.native}
    </Text>
  </TouchableOpacity>
));

const LanguageSelector = ({ currentLanguage, onLanguageChange }) => {
  const [modalVisible, setModalVisible] = useState(false);

  const selectedLanguage = languages.find(lang => lang.code === currentLanguage);

  const handleLanguageSelect = useCallback((languageCode) => {
    onLanguageChange(languageCode);
    setModalVisible(false);
  }, [onLanguageChange]);

  const renderLanguageItem = useCallback(({ item }) => (
    <LanguageItem
      item={item}
      isSelected={item.code === currentLanguage}
      onPress={() => handleLanguageSelect(item.code)}
    />
  ), [currentLanguage, handleLanguageSelect]);

  return (
    <>
      <TouchableOpacity
        style={styles.languageButton}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.6}
      >
        <Image
          source={require('../assets/image/languages.png')}
          style={styles.languageIcon}
          resizeMode="contain"
          tintColor="#007AFF"
        />
      </TouchableOpacity>

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
        statusBarTranslucent
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setModalVisible(false)}
        >
          <TouchableOpacity 
            style={styles.modalContent} 
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <SafeAreaView style={styles.modalSafeArea}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Language</Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setModalVisible(false)}
                  activeOpacity={0.6}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
              
              <FlatList
                data={languages}
                renderItem={renderLanguageItem}
                keyExtractor={(item) => item.code}
                style={styles.languageList}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={false}
                maxToRenderPerBatch={10}
                initialNumToRender={10}
                windowSize={10}
                getItemLayout={(data, index) => ({
                  length: 55,
                  offset: 55 * index,
                  index,
                })}
              />
            </SafeAreaView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  languageButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? (isSmallScreen ? 50 : 60) : (isSmallScreen ? 15 : 20),
    left: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    width: isSmallScreen ? 40 : 44,
    height: isSmallScreen ? 40 : 44,
    borderRadius: isSmallScreen ? 20 : 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 1000,
  },
  languageIcon: {
    width: isSmallScreen ? 20 : 24,
    height: isSmallScreen ? 20 : 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    width: responsiveModalWidth,
    maxHeight: responsiveModalHeight,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  modalSafeArea: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
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
  languageList: {
    flex: 1,
  },
  languageItem: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    minHeight: 55,
  },
  selectedLanguageItem: {
    backgroundColor: '#1a4d2e',
  },
  languageName: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  languageNative: {
    color: '#ccc',
    fontSize: 14,
    marginTop: 2,
  },
  selectedLanguageText: {
    color: 'white',
  },
});

export default memo(LanguageSelector);
