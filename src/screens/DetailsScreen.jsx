import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Alert,
  ScrollView,
  PanResponder,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_CONFIG, GLOBAL_BASE_URL } from '../utils/config';
import { t } from '../utils/translations';
import { getSessionData, getAuthHeaders } from '../frontendStore';

// Helper function to convert signature paths to SVG and then base64
const convertSignatureToBase64 = (signaturePaths, currentPath, containerWidth = 400, containerHeight = 200) => {
  try {
    // Combine all paths
    const allPaths = [...signaturePaths];
    if (currentPath && currentPath.length > 0) {
      allPaths.push(currentPath);
    }
    
    if (allPaths.length === 0) return null;
    
    // Create SVG string
    let svgPaths = '';
    const strokeWidth = 2.5;
    
    allPaths.forEach((path) => {
      if (path.length < 2) return;
      
      // Create smooth path using quadratic bezier curves
      let pathData = `M ${path[0].x} ${path[0].y}`;
      
      for (let i = 1; i < path.length; i++) {
        const point = path[i];
        const prevPoint = path[i - 1];
        const nextPoint = path[i + 1];
        
        if (nextPoint) {
          // Use quadratic bezier for smooth curves
          const controlX = point.x;
          const controlY = point.y;
          const endX = (point.x + nextPoint.x) / 2;
          const endY = (point.y + nextPoint.y) / 2;
          pathData += ` Q ${controlX} ${controlY} ${endX} ${endY}`;
        } else {
          // Last point - line to it
          pathData += ` L ${point.x} ${point.y}`;
        }
      }
      
      svgPaths += `<path d="${pathData}" fill="none" stroke="black" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
    });
    
    // Create complete SVG
    const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${containerWidth}" height="${containerHeight}" xmlns="http://www.w3.org/2000/svg">
  ${svgPaths}
</svg>`;
    
    // Convert SVG string to base64 - React Native compatible
    let base64;
    if (typeof btoa !== 'undefined') {
      // Use btoa if available
      base64 = btoa(unescape(encodeURIComponent(svgString)));
    } else if (typeof Buffer !== 'undefined') {
      // Fallback to Buffer (Node.js/React Native)
      base64 = Buffer.from(svgString, 'utf-8').toString('base64');
    } else {
      // Manual base64 encoding fallback
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      let i = 0;
      const utf8String = unescape(encodeURIComponent(svgString));
      while (i < utf8String.length) {
        const a = utf8String.charCodeAt(i++);
        const b = i < utf8String.length ? utf8String.charCodeAt(i++) : 0;
        const c = i < utf8String.length ? utf8String.charCodeAt(i++) : 0;
        const bitmap = (a << 16) | (b << 8) | c;
        result += chars.charAt((bitmap >> 18) & 63);
        result += chars.charAt((bitmap >> 12) & 63);
        result += i - 2 < utf8String.length ? chars.charAt((bitmap >> 6) & 63) : '=';
        result += i - 1 < utf8String.length ? chars.charAt(bitmap & 63) : '=';
      }
      base64 = result;
    }
    
    return `data:image/svg+xml;base64,${base64}`;
  } catch (error) {
    console.error('Error converting signature to base64:', error);
    return null;
  }
};

const { width, height } = Dimensions.get('window');

const DetailsScreen = ({ navigation, route }) => {
  const [pocName, setPocName] = useState('');
  const [pocDesignation, setPocDesignation] = useState('');
  const [signaturePaths, setSignaturePaths] = useState([]);
  const [currentPath, setCurrentPath] = useState([]);
  const signatureViewRef = useRef(null);
  const currentPathRef = useRef([]);
  const animationFrameRef = useRef(null);
  const pendingUpdateRef = useRef(false);

  // Cleanup animation frame on unmount
  React.useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Prevent back navigation - user must complete the details
  React.useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert(
        'Cannot Go Back',
        'Please complete all POC details before proceeding.',
        [{ text: 'OK' }]
      );
      return true; // Prevent default back behavior
    });

    return () => backHandler.remove();
  }, []);

  // Prevent swipe back gesture on iOS
  React.useEffect(() => {
    navigation.setOptions({
      gestureEnabled: false,
      headerLeft: () => null, // Remove back button from header
    });
  }, [navigation]);

  // Block stack back actions
  React.useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (e.data.action?.type === 'GO_BACK') {
        e.preventDefault();
        Alert.alert(
          'Cannot Go Back',
          'Please complete all POC details before proceeding.',
          [{ text: 'OK' }]
        );
      }
    });
    return unsubscribe;
  }, [navigation]);

  // PanResponder for signature drawing
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const newPath = [{ x: locationX, y: locationY }];
        currentPathRef.current = newPath;
        setCurrentPath([...newPath]);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const lastPoint = currentPathRef.current[currentPathRef.current.length - 1];
        
        // Calculate distance from last point
        if (lastPoint) {
          const dx = locationX - lastPoint.x;
          const dy = locationY - lastPoint.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Sample points every 1 pixel for smooth but performant drawing
          if (distance >= 1) {
            // Always update the ref immediately for accurate path data
            currentPathRef.current = [...currentPathRef.current, { x: locationX, y: locationY }];
            
            // Throttle state updates using requestAnimationFrame for smooth rendering
            if (!pendingUpdateRef.current) {
              pendingUpdateRef.current = true;
              animationFrameRef.current = requestAnimationFrame(() => {
                setCurrentPath([...currentPathRef.current]);
                pendingUpdateRef.current = false;
              });
            }
          }
        } else {
          const updatedPath = [{ x: locationX, y: locationY }];
          currentPathRef.current = updatedPath;
          setCurrentPath([...updatedPath]);
        }
      },
      onPanResponderRelease: () => {
        // Cancel any pending animation frame
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        pendingUpdateRef.current = false;
        
        if (currentPathRef.current.length > 0) {
          const pathToSave = [...currentPathRef.current];
          setSignaturePaths((prev) => [...prev, pathToSave]);
        }
        currentPathRef.current = [];
        setCurrentPath([]);
      },
    })
  ).current;

  const clearSignature = () => {
    setSignaturePaths([]);
    setCurrentPath([]);
    currentPathRef.current = [];
  };

  const handleProceed = async () => {
    // Validation
    if (!pocName || pocName.trim() === '') {
      Alert.alert('Validation Error', 'Please enter POC Name.');
      return;
    }

    if (!pocDesignation || pocDesignation.trim() === '') {
      Alert.alert('Validation Error', 'Please enter POC Designation.');
      return;
    }

    if (signaturePaths.length === 0 && currentPath.length === 0) {
      Alert.alert('Validation Error', 'Please provide POC Signature.');
      return;
    }

    // All validations passed - first complete current stop with POC data
    try {
      console.log('📤 Submitting POC data and completing current stop...');
      
      // Convert signature to base64 image
      const allSignaturePaths = [...signaturePaths];
      if (currentPath.length > 0) {
        allSignaturePaths.push([...currentPath]);
      }
      const signatureBase64 = convertSignatureToBase64(
        signaturePaths,
        currentPathRef.current.length > 0 ? currentPathRef.current : currentPath,
        400, // container width
        200  // container height
      );
      
      if (!signatureBase64) {
        Alert.alert('Error', 'Failed to process signature. Please try again.');
        return;
      }

      // Get session data
      const sessionData = getSessionData();
      const authHeaders = getAuthHeaders();
      const primaryBase = GLOBAL_BASE_URL;
      const fallbackBase = 'http://localhost:5000';
      
      // Prepare POC data
      const pocData = {
        poc_name: pocName.trim(),
        poc_designation: pocDesignation.trim(),
        poc_signature: signatureBase64,
      };
      
      console.log('📤 Sending POC data:', {
        poc_name: pocData.poc_name,
        poc_designation: pocData.poc_designation,
        signature_length: signatureBase64 ? signatureBase64.length : 0,
      });

      // Complete current stop with POC data
      const completePath = '/multi-pickup/auto-complete-current';
      let completeResp;
      let completeErr;
      
      for (const base of [primaryBase, fallbackBase]) {
        const url = `${base}${completePath}`;
        console.log(`Making request to: ${url}`);
        try {
          completeResp = await fetch(url, {
            method: 'POST',
            headers: {
              ...authHeaders,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(pocData),
          });
          break;
        } catch (er) {
          completeErr = er;
          console.warn(`Complete stop request failed:`, er?.message || er);
          continue;
        }
      }

      if (!completeResp) {
        throw completeErr || new Error('Network error');
      }

      const completeText = await completeResp.text();
      const completeData = completeText ? JSON.parse(completeText) : {};

      if (completeResp.ok && completeData.status === 'success') {
        console.log('✅ Current stop completed with POC data');
        console.log('📊 Response:', completeData);
        
        // Check if this is the last sequence
        const totals = sessionData?.totals;
        const nextPickup = route.params?.nextPickup || null;
        const isLastSequence = totals && totals.current >= totals.total;

        // If it's the last sequence, complete the trip
        if (isLastSequence || !nextPickup) {
          try {
            console.log('🏁 All sequences completed. Completing trip...');
            const tripController = new AbortController();
            const tripTimeoutId = setTimeout(() => tripController.abort(), 15000);
            const tripPath = '/multi-pickup/auto-complete-trip';
            let tripResp;
            let tripErr;
            for (const base of [primaryBase, fallbackBase]) {
              const url = `${base}${tripPath}`;
              try {
                tripResp = await fetch(url, {
                  method: 'POST',
                  headers: {
                    ...authHeaders,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({}),
                  signal: tripController.signal,
                });
                break;
              } catch (er) {
                tripErr = er;
                console.warn(`Trip complete request failed:`, er?.message || er);
                continue;
              }
            }
            clearTimeout(tripTimeoutId);
            if (tripResp) {
              const tripText = await tripResp.text();
              const tripData = tripText ? JSON.parse(tripText) : {};
              if (tripResp.ok && tripData.status === 'success') {
                console.log('✅ Trip completed via auto-complete-trip');
              }
            }
            // Navigate to Base and reset stack
            navigation.reset({ index: 0, routes: [{ name: 'Base' }] });
            return;
          } catch (tripErr) {
            console.warn('⚠️ Trip completion error (non-blocking):', tripErr?.message || tripErr);
            navigation.reset({ index: 0, routes: [{ name: 'Base' }] });
            return;
          }
        }

        // If there's a next pickup, navigate to PickupStart
        if (nextPickup) {
          navigation.navigate('PickupStart', { currentPickup: nextPickup });
        } else {
          // Fallback to Base screen
          navigation.navigate('Base');
        }
      } else {
        const errorMsg = completeData.message || 'Failed to complete stop with POC data';
        console.error('❌ Error completing stop:', errorMsg);
        Alert.alert('Error', errorMsg);
      }
    } catch (error) {
      console.error('❌ Error submitting POC data:', error);
      Alert.alert('Error', `Failed to submit POC data: ${error.message || error}`);
    }
  };

  // Render signature paths with smooth, optimized lines
  const renderSignature = () => {
    const allPaths = [...signaturePaths];
    // Use ref for current path to avoid delays
    const currentPathData = currentPathRef.current.length > 0 ? currentPathRef.current : currentPath;
    if (currentPathData.length > 0) {
      allPaths.push(currentPathData);
    }
    
    return allPaths
      .filter((path) => path && path.length > 0)
      .map((path, pathIndex) => {
        const uniqueKey = `path-${pathIndex}-${path.length}`;
        const strokeWidth = 2.5; // Line thickness - thinner for elegant signature that fits in box
        const circleRadius = strokeWidth / 2; // Circles at each point for smooth connections
        
        return (
          <View
            key={uniqueKey}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            collapsable={false}
          >
            {/* Draw smooth lines with simple interpolation for better performance */}
            {path.map((point, index) => {
              if (index === 0) return null; // Skip first point
              
              const prevPoint = path[index - 1];
              const dx = point.x - prevPoint.x;
              const dy = point.y - prevPoint.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              
              // Skip if points are too close together
              if (distance < 0.5) return null;
              
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
              
              // For smooth curves, use the next point if available for better direction
              let controlX = (prevPoint.x + point.x) / 2;
              let controlY = (prevPoint.y + point.y) / 2;
              
              if (index < path.length - 1) {
                const nextPoint = path[index + 1];
                // Use next point to anticipate curve direction for smoother appearance
                const nextDx = nextPoint.x - point.x;
                const nextDy = nextPoint.y - point.y;
                controlX = point.x - nextDx * 0.2;
                controlY = point.y - nextDy * 0.2;
              } else if (index > 1) {
                // Use previous direction for end of path
                const prevPrevPoint = path[index - 2];
                const prevDx = prevPoint.x - prevPrevPoint.x;
                const prevDy = prevPoint.y - prevPrevPoint.y;
                controlX = point.x - prevDx * 0.3;
                controlY = point.y - prevDy * 0.3;
              }
              
              // Create 2-3 segments for smooth curve without performance hit
              const numSegments = Math.min(3, Math.max(2, Math.ceil(distance / 8)));
              const segments = [];
              
              for (let i = 0; i <= numSegments; i++) {
                const t = i / numSegments;
                const mt = 1 - t;
                // Simplified quadratic bezier
                const x = mt * mt * prevPoint.x + 2 * mt * t * controlX + t * t * point.x;
                const y = mt * mt * prevPoint.y + 2 * mt * t * controlY + t * t * point.y;
                segments.push({ x, y });
              }
              
              // Draw smooth curve segments
              return segments.slice(0, -1).map((segment, segIndex) => {
                const nextSegment = segments[segIndex + 1];
                const segDx = nextSegment.x - segment.x;
                const segDy = nextSegment.y - segment.y;
                const segDistance = Math.sqrt(segDx * segDx + segDy * segDy);
                
                if (segDistance < 0.1) return null;
                
                const segAngle = Math.atan2(segDy, segDx) * (180 / Math.PI);
                const segCenterX = (segment.x + nextSegment.x) / 2;
                const segCenterY = (segment.y + nextSegment.y) / 2;
                const extendedSegDistance = segDistance + strokeWidth * 0.5;
                
                return (
                  <View
                    key={`curve-${pathIndex}-${index}-${segIndex}`}
                    style={{
                      position: 'absolute',
                      left: segCenterX - extendedSegDistance / 2,
                      top: segCenterY - strokeWidth / 2,
                      width: extendedSegDistance,
                      height: strokeWidth,
                      backgroundColor: '#000000',
                      transform: [{ rotate: `${segAngle}deg` }],
                    }}
                    collapsable={false}
                  />
                );
              });
            }).flat().filter(Boolean)}
            {/* Add circles at connection points for smooth appearance */}
            {path.map((point, index) => {
              // Only draw circles at major points to reduce components
              if (index > 0 && index < path.length - 1 && index % 3 !== 0) return null;
              
              return (
                <View
                  key={`point-${pathIndex}-${index}`}
                  style={{
                    position: 'absolute',
                    left: point.x - circleRadius,
                    top: point.y - circleRadius,
                    width: circleRadius * 2,
                    height: circleRadius * 2,
                    backgroundColor: '#000000',
                    borderRadius: circleRadius,
                  }}
                  collapsable={false}
                />
              );
            }).filter(Boolean)}
          </View>
        );
      });
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      
      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.mainContainer}>
          {/* Screen Title */}
          <Text style={styles.screenTitle}>POC Details</Text>

          {/* POC Name Input */}
          <View style={styles.inputSection}>
            <Text style={styles.label}>POC Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter POC Name"
              placeholderTextColor="#999"
              value={pocName}
              onChangeText={setPocName}
            />
          </View>

          {/* POC Designation Input */}
          <View style={styles.inputSection}>
            <Text style={styles.label}>POC Designation *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter POC Designation"
              placeholderTextColor="#999"
              value={pocDesignation}
              onChangeText={setPocDesignation}
            />
          </View>

          {/* POC Signature Section */}
          <View style={styles.signatureSection}>
            <View style={styles.signatureHeader}>
              <Text style={styles.label}>POC Signature *</Text>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={clearSignature}
              >
                <Text style={styles.clearButtonText}>Clear Signature</Text>
              </TouchableOpacity>
            </View>
            <View
              style={styles.signatureContainer}
              ref={signatureViewRef}
              {...panResponder.panHandlers}
              collapsable={false}
            >
              {renderSignature()}
              {signaturePaths.length === 0 && currentPath.length === 0 && (
                <Text style={styles.signaturePlaceholder}>
                  Sign here with your finger
                </Text>
              )}
            </View>
          </View>

          {/* Proceed Button */}
          <TouchableOpacity
            style={[
              styles.proceedButton,
              (pocName.trim() &&
                pocDesignation.trim() &&
                (signaturePaths.length > 0 || currentPath.length > 0)) &&
                styles.proceedButtonActive,
            ]}
            onPress={handleProceed}
            disabled={
              !pocName.trim() ||
              !pocDesignation.trim() ||
              (signaturePaths.length === 0 && currentPath.length === 0)
            }
          >
            <Text
              style={[
                styles.proceedButtonText,
                (pocName.trim() &&
                  pocDesignation.trim() &&
                  (signaturePaths.length > 0 || currentPath.length > 0)) &&
                  styles.proceedButtonTextActive,
              ]}
            >
              Proceed to Next Pickup
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#000000',
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
    fontSize: width < 400 ? 20 : 24,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputSection: {
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
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#000000',
  },
  signatureSection: {
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
  signatureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  signatureContainer: {
    width: '100%',
    height: 200,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 12,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signaturePlaceholder: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
  },
  clearButton: {
    backgroundColor: '#ff6b6b',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  proceedButton: {
    backgroundColor: '#9e9e9e',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  proceedButtonActive: {
    backgroundColor: '#4caf50',
    shadowColor: '#4caf50',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  proceedButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  proceedButtonTextActive: {
    color: 'white',
  },
});

export default DetailsScreen;

