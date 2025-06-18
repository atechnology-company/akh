<script lang="ts">
  import { onMount } from 'svelte';
  import { calculateQiblaDirection } from '../modules/qibla';
  import { t } from '$lib/i18n';
  import { accentColor, gradientColor } from '$lib/stores/accentColor';
  import * as geomagnetism from 'geomagnetism';
  
  let leafletDeviceDirectionLine: any = null;
  
  let userLocation: { lat: number; lng: number } | null = null;
  let qiblaDirection: number = 0;
  let isLoading: boolean = true;
  let errorMessage: string = '';
  let watchId: number;
  
  let currentHeading: number = 0;
  let smoothedHeading: number = 0;
  let lastValidHeading: number = 0;
  let headingHistory: number[] = [];
  let magneticDeclination: number = 0;

  let leafletMap: any = null;
  
  let isStarted: boolean = true;
  let isHighAccuracyFailed: boolean = false;
  let locationAccuracy: number = 0;
  let accuracyText: string = "";
  
  // Variable to store accuracy circle for updates
  let accuracyCircle: any = null;
  
  // Add variables for compass accuracy tracking
  let isMobileDevice: boolean = false;
  
  // Импортируем модуль NativeScript geolocation если он доступен
  let nativescriptGeolocation: any;
  
  let isUsingNativeDirection = false;
  
  // Динамически импортируем NativeScript модули если они доступны
  try {
    // Проверяем доступность NativeScript модулей
    if (typeof global !== 'undefined' && typeof (global as any).__requireModule === 'function') {
      nativescriptGeolocation = (global as any).__requireModule('@nativescript/geolocation');
      isUsingNativeDirection = true;
      console.log('NativeScript geolocation module is available');
    }
  } catch (e) {
    console.log('NativeScript modules not available, using standard web APIs');
  }
  
  // Helper function to format accuracy for display
  function formatAccuracy(meters: number): string {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    } else {
      return `${Math.round(meters)} m`;
    }
  }

  // Smooth heading updates to reduce jitter
  function smoothHeading(newHeading: number): number {
    // Add to history
    headingHistory.push(newHeading);
    
    // Keep only last 5 readings for smoothing
    if (headingHistory.length > 5) {
      headingHistory.shift();
    }
    
    // Detect and handle sudden jumps (likely glitches)
    if (lastValidHeading !== 0) {
      let diff = Math.abs(newHeading - lastValidHeading);
      if (diff > 180) {
        diff = 360 - diff; // Handle circular nature
      }
      
      // If change is too dramatic (>90 degrees), ignore this reading
      if (diff > 90) {
        console.warn(`Ignoring erratic heading change: ${lastValidHeading} -> ${newHeading}`);
        return smoothedHeading; // Return previous smoothed value
      }
    }
    
    // Calculate moving average, handling circular values
    if (headingHistory.length === 1) {
      return newHeading;
    }
    
    // Convert to unit vectors for proper circular averaging
    let sumX = 0;
    let sumY = 0;
    
    for (const heading of headingHistory) {
      const radians = (heading * Math.PI) / 180;
      sumX += Math.cos(radians);
      sumY += Math.sin(radians);
    }
    
    const avgX = sumX / headingHistory.length;
    const avgY = sumY / headingHistory.length;
    
    let avgHeading = Math.atan2(avgY, avgX) * (180 / Math.PI);
    if (avgHeading < 0) {
      avgHeading += 360;
    }
    
    lastValidHeading = avgHeading;
    return avgHeading;
  }

  // Detect if device is mobile
  function detectMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (window.DeviceOrientationEvent !== undefined && typeof (window.DeviceOrientationEvent as any).requestPermission === 'function');
  }
  
  // Calculate magnetic declination for the user's location
  function calculateMagneticDeclination(latitude: number, longitude: number): number {
    try {
      const date = new Date();
      const magData = geomagnetism.model(date).point([latitude, longitude]);
      const declination = magData.decl; // Declination in degrees
      console.log(`Magnetic declination for location (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) on ${date.toDateString()}: ${declination.toFixed(2)}°`);
      return declination;
    } catch (error) {
      console.warn('Failed to calculate magnetic declination:', error);
      return 0;
    }
  }

  // Apply magnetic declination correction to compass heading
  function correctMagneticHeading(magneticHeading: number, declination: number): number {
    // Convert magnetic heading to true heading by adding declination
    // Positive declination = magnetic north is east of true north
    // Negative declination = magnetic north is west of true north
    let trueHeading = magneticHeading + declination;
    
    // Normalize to 0-360 range
    while (trueHeading < 0) trueHeading += 360;
    while (trueHeading >= 360) trueHeading -= 360;
    
    return trueHeading;
  }

  // Calculate qibla direction accuracy (0-1, where 1 is perfect alignment)
  function calculateQiblaAccuracy(): number {
    if (qiblaDirection === 0) return 0;
    
    const headingToUse = smoothedHeading || currentHeading;
    if (headingToUse === 0) return 0;
    
    let diff = Math.abs(headingToUse - qiblaDirection);
    // Handle circular nature of compass (0° = 360°)
    if (diff > 180) {
      diff = 360 - diff;
    }
    
    // Perfect accuracy within 5°, decreasing to 0 at 90°
    if (diff <= 5) return 1;
    if (diff >= 90) return 0;
    return 1 - ((diff - 5) / 85);
  }

  // Get color based on qibla accuracy (red when far, green when close)
  function getQiblaAccuracyColor(): string {
    const accuracy = calculateQiblaAccuracy();
    const red = Math.round(255 * (1 - accuracy));
    const green = Math.round(255 * accuracy);
    return `rgb(${red}, ${green}, 0)`;
  }
  
  onMount(() => {
    // Check if the component is actually visible in DOM
    const qiblaContainer = document.querySelector('.qibla-container');
    if (!qiblaContainer || !document.body.contains(qiblaContainer)) {
      console.log('Qibla component is not visible in DOM, skipping initialization');
      return;
    }
    
    // Detect mobile device
    isMobileDevice = detectMobileDevice();
    
    // Start qibla finder automatically with OpenStreetMap
    if (isStarted) {
      startQiblaFinder();
    }
    
    // Cleanup function
    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
      
      // Remove all orientation listeners
      window.removeEventListener('deviceorientationabsolute', 
        event => handleOrientation(event as unknown as DeviceOrientationEvent), 
        true);
      window.removeEventListener('deviceorientation', 
        event => handleOrientation(event as unknown as DeviceOrientationEvent), 
        true);
    };
  });
  
  function startQiblaFinder() {
    isStarted = true;
    
    // Check if geolocation is available
    if (!navigator.geolocation) {
      errorMessage = 'Geolocation not supported by browser';
      isLoading = false;
      return;
    }
    
    console.log("Starting qibla finder, checking for map container");
    
    // Ensure map container exists in DOM
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
      console.log("Map container not found, will create it manually");
      // Try to create it manually if not exists
      const mapElement = document.createElement('div');
      mapElement.id = 'map';
      mapElement.className = 'map';
      mapElement.style.position = 'absolute';
      mapElement.style.top = '0';
      mapElement.style.left = '0';
      mapElement.style.width = '100%';
      mapElement.style.height = '100%';
      document.querySelector('.qibla-container')?.appendChild(mapElement);
      console.log("Map container created:", mapElement);
    }
    
    // Add longer timeout to ensure DOM is fully rendered
    console.log("Scheduling initialization with delay");
    setTimeout(() => {
      initializeQiblaFinder();
    }, 1500); // Increased delay from 200ms to 1500ms
  }
  
  function initializeQiblaFinder() {
    console.log("Running initializeQiblaFinder");
    
    // First check if component is still mounted in DOM
    const qiblaContainer = document.querySelector('.qibla-container');
    if (!qiblaContainer) {
        console.log('Qibla container not found, component might be unmounted');
        // Component is not in DOM anymore, no need to show errors or continue
        return;
    }
    
    // Verify map container exists
    const mapElement = document.getElementById('map');
    if (!mapElement) {
        console.log('Map container not found in DOM, component might be unmounted');
        // If component is not visible/mounted, don't show errors
        if (!document.body.contains(qiblaContainer)) {
            return;
        }
        
        // Try to create element
        const container = document.createElement('div');
        container.id = 'map';
        container.className = 'map';
        container.style.position = 'absolute';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        qiblaContainer.appendChild(container);
        console.log("Created new map container:", container);
        
        // Retry with a longer delay
        setTimeout(initializeQiblaFinder, 1000);
        return;
    }

    // Ensure map container has dimensions and is visible
    const rect = mapElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        console.error('Map container has zero dimensions, retrying...');
        console.log('Current dimensions:', rect);
        
        // Force dimensions
        mapElement.style.position = 'absolute';
        mapElement.style.top = '0';
        mapElement.style.left = '0';
        mapElement.style.width = '100%';
        mapElement.style.height = '100%';
        mapElement.style.display = 'block';
        mapElement.style.visibility = 'visible';
        
        setTimeout(initializeQiblaFinder, 1000); // Increased delay
        return;
    }
    
    console.log("Map container found with dimensions:", rect.width, rect.height);

    // Use OpenStreetMap - prettier and no API key needed
    console.log('Using OpenStreetMap for qibla direction');
    loadLeaflet()
      .then(() => {
        initializeLeafletMap(mapElement);
        loadUserLocation();
      })
      .catch((error: Error) => {
        errorMessage = 'Failed to load map services. Please try again later.';
        isLoading = false;
      });
  }

  

  
  function loadUserLocation() {
    // Если доступен NativeScript geolocation, используем его
    if (isUsingNativeDirection && nativescriptGeolocation) {
      nativescriptGeolocation.enableLocationRequest()
        .then(() => {
          const options = {
            desiredAccuracy: 3, // high accuracy
            updateDistance: 1,
            maximumAge: 5000,
            timeout: 20000
          };
          
          // Получаем текущее местоположение
          nativescriptGeolocation.getCurrentLocation(options)
            .then((location: any) => {
              // Создаем совместимый с GeolocationPosition объект
              const geoPosition = {
                coords: {
                  latitude: location.latitude,
                  longitude: location.longitude,
                  accuracy: location.accuracy,
                  heading: location.direction, // Используем direction из NativeScript
                  // Добавляем отсутствующие свойства GeolocationCoordinates
                  altitude: null,
                  altitudeAccuracy: null,
                  speed: location.speed || null,
                  toJSON: function() { return JSON.stringify(this); }
                },
                timestamp: Date.now()
              } as GeolocationPosition;
              
              handlePositionSuccess(geoPosition);
            })
            .catch(handleLocationError);
          
          // Следим за изменениями местоположения
          nativescriptGeolocation.watchLocation(
            (location: any) => {
              // Обновляем положение
              userLocation = { lat: location.latitude, lng: location.longitude };
              
              // Обновляем точность
              locationAccuracy = location.accuracy;
              
              // Форматируем текст точности
              updateAccuracyText(location.accuracy);
              
              // Обновляем направление устройства если оно доступно
              if (location.direction && location.direction !== -1) {
                const rawHeading = location.direction;
                // Apply magnetic declination correction using geomagnetism library
                const correctedHeading = correctMagneticHeading(rawHeading, magneticDeclination);
                const newSmoothedHeading = smoothHeading(correctedHeading);
                
                // Only update if change is significant
                if (Math.abs(newSmoothedHeading - smoothedHeading) > 1) {
                  currentHeading = newSmoothedHeading;
                  smoothedHeading = newSmoothedHeading;
                  
                  console.log(`NativeScript Compass: Raw=${rawHeading.toFixed(1)}°, Corrected=${correctedHeading.toFixed(1)}°, Smoothed=${smoothedHeading.toFixed(1)}°, Declination=${magneticDeclination.toFixed(1)}°`);
                  
                  // Обновляем линию направления на карте
                  updateDeviceDirectionLine();
                }
              }
              
              // Пересчитываем направление на Киблу
              qiblaDirection = calculateQiblaDirection(location.latitude, location.longitude);
              
              // Recalculate magnetic declination if location changed significantly
              const newDeclination = calculateMagneticDeclination(location.latitude, location.longitude);
              if (Math.abs(newDeclination - magneticDeclination) > 0.5) {
                magneticDeclination = newDeclination;
                console.log(`Updated magnetic declination: ${magneticDeclination.toFixed(2)}°`);
              }
              
              // Обновляем карту
              updateMapWithLocation();
            },
            handleLocationError,
            options
          );
        })
        .catch(handleLocationError);
    } else {
      // Используем стандартный веб API геолокации как раньше
      navigator.geolocation.getCurrentPosition(
        handlePositionSuccess,
        handleLocationError,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
      
      // Следим за изменениями местоположения
      watchId = navigator.geolocation.watchPosition(
        position => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          
          userLocation = { lat, lng };
          
          // Обновляем точность
          if (position.coords.accuracy) {
            locationAccuracy = position.coords.accuracy;
            updateAccuracyText(position.coords.accuracy);
          }
          
          // Обновляем направление устройства если оно доступно через Web API
          if (position.coords.heading !== null && position.coords.heading !== undefined) {
            const rawHeading = position.coords.heading;
            // Apply magnetic declination correction using geomagnetism library
            const correctedHeading = correctMagneticHeading(rawHeading, magneticDeclination);
            const newSmoothedHeading = smoothHeading(correctedHeading);
            
            // Only update if change is significant
            if (Math.abs(newSmoothedHeading - smoothedHeading) > 1) {
              currentHeading = newSmoothedHeading;
              smoothedHeading = newSmoothedHeading;
              
              console.log(`Web API Compass: Raw=${rawHeading.toFixed(1)}°, Corrected=${correctedHeading.toFixed(1)}°, Smoothed=${smoothedHeading.toFixed(1)}°, Declination=${magneticDeclination.toFixed(1)}°`);
              
              // Обновляем линию направления на карте
              updateDeviceDirectionLine();
            }
          }
          
          // Пересчитываем направление на Киблу
          qiblaDirection = calculateQiblaDirection(lat, lng);
          
          // Recalculate magnetic declination if location changed significantly
          const newDeclination = calculateMagneticDeclination(lat, lng);
          if (Math.abs(newDeclination - magneticDeclination) > 0.5) {
            magneticDeclination = newDeclination;
            console.log(`Updated magnetic declination: ${magneticDeclination.toFixed(2)}°`);
          }
          
          // Обновляем карту
          updateMapWithLocation();
        },
        handleLocationError,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    }
  }
  
  function handlePositionSuccess(position: GeolocationPosition) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracy = position.coords.accuracy;
    
    console.log(`Position obtained with accuracy: ${accuracy} meters`);
    locationAccuracy = accuracy;
    
    // Обновляем текст точности
    updateAccuracyText(accuracy);
    
    userLocation = { lat, lng };
    
    // Calculate magnetic declination for this location
    magneticDeclination = calculateMagneticDeclination(lat, lng);
    
    // Проверяем, доступно ли направление устройства
    if (position.coords.heading !== null && position.coords.heading !== undefined) {
      const rawHeading = position.coords.heading;
      // Apply magnetic declination correction and smoothing
      const correctedHeading = correctMagneticHeading(rawHeading, magneticDeclination);
      currentHeading = smoothHeading(correctedHeading);
      smoothedHeading = currentHeading;
      console.log(`Device heading from geolocation: Raw=${rawHeading}°, Corrected=${correctedHeading}°, Smoothed=${currentHeading}°`);
    }
    
    // Рассчитываем направление на Киблу
    qiblaDirection = calculateQiblaDirection(lat, lng);
    
    // Calculate magnetic declination for this location
    magneticDeclination = calculateMagneticDeclination(lat, lng);
    
    // Обновляем карту с местоположением и линией Киблы
    // Pass true to automatically zoom to user location
    updateMapWithLocation(true);
    
    isLoading = false;
    
    // Если не используем NativeScript, настраиваем слушатели ориентации устройства
    if (!isUsingNativeDirection) {
      setupOrientationListeners();
    }
  }
  
  function updateAccuracyText(accuracy: number) {
    // Форматируем текст точности
    if (accuracy <= 50) {
      accuracyText = `High accuracy: ${formatAccuracy(accuracy)}`;
    } else if (accuracy <= 100) {
      accuracyText = `Medium accuracy: ${formatAccuracy(accuracy)}`;
    } else {
      accuracyText = `Low accuracy: ${formatAccuracy(accuracy)}`;
    }
  }
  
  function calibrateCompass() {
    // Если используем NativeScript, обновляем местоположение для получения свежего направления
    if (isUsingNativeDirection && nativescriptGeolocation) {
      nativescriptGeolocation.enableLocationRequest()
        .then(() => {
          nativescriptGeolocation.getCurrentLocation({
            desiredAccuracy: 3, // high accuracy
            maximumAge: 0,
            timeout: 10000
          }).catch(console.error);
        })
        .catch(console.error);
    } else {
      // На некоторых устройствах нужно запросить разрешение на использование датчиков
      try {
        if ('DeviceOrientationEvent' in window && 'requestPermission' in DeviceOrientationEvent) {
          (DeviceOrientationEvent as any).requestPermission()
            .then((response: string) => {
              if (response === 'granted') {
                console.log('Orientation permission granted');
                // Переподключаем слушатели событий
                setupOrientationListeners();
              } else {
                console.warn('Orientation permission not granted');
              }
            })
            .catch(console.error);
        }
      } catch (e) {
        console.log('Standard calibration mode');
      }
    }
    
    // Compass calibration complete - no UI feedback needed
  }
  
  function handleLocationError(error: GeolocationPositionError) {
    switch(error.code) {
      case error.PERMISSION_DENIED:
        errorMessage = 'User denied the request for geolocation';
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage = 'Location information is unavailable';
        break;
      case error.TIMEOUT:
        errorMessage = 'The request to get user location timed out';
        break;
      default:
        errorMessage = 'An unknown error occurred getting location';
        break;
    }
    
    isLoading = false;
  }
  
  function handleOrientation(event: DeviceOrientationEvent) {
    // Get compass heading from device
    if (event.alpha !== null) {
      let rawHeading = event.alpha;
      
      // Fix for different browser implementations
      // Some browsers report alpha as 0-360, others as -180 to 180
      if (rawHeading < 0) {
        rawHeading += 360;
      }
      
      // Apply compass heading correction for different platforms
      if (typeof window !== 'undefined') {
        // iOS Safari reports compass differently than Android
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isAndroid = /Android/.test(navigator.userAgent);
        
        if (isIOS) {
          // iOS: alpha is degrees from north, clockwise - use as is
          // Previous correction was causing east/west flip
          // rawHeading is already correct for iOS
        } else if (isAndroid) {
          // Android: alpha is typically correct as-is
          // No adjustment needed
        }
      }
      
      // Apply magnetic declination correction to get true heading
      const correctedHeading = correctMagneticHeading(rawHeading, magneticDeclination);
      
      // Apply smoothing to reduce jitter
      const newSmoothedHeading = smoothHeading(correctedHeading);
      
      // Only update if the change is significant (reduces unnecessary updates)
      if (Math.abs(newSmoothedHeading - smoothedHeading) > 1) {
        currentHeading = newSmoothedHeading;
        smoothedHeading = newSmoothedHeading;
        
        console.log(`Compass: Raw=${rawHeading.toFixed(1)}°, Corrected=${correctedHeading.toFixed(1)}°, Smoothed=${smoothedHeading.toFixed(1)}°, Declination=${magneticDeclination.toFixed(1)}°`);
        
        // Обновляем линию направления на карте если есть местоположение
        if (userLocation) {
          updateDeviceDirectionLine();
        }
      }
    }
  }
  
  function updateDeviceDirectionLine() {
    if (!userLocation) return;
    
    if (leafletMap) {
      updateLeafletDeviceDirectionLine();
    }
  }
  
  function updateLeafletDeviceDirectionLine() {
    if (!leafletMap || !userLocation || currentHeading === 0) return;
    
    // Use the smoothed heading for display
    const displayHeading = smoothedHeading || currentHeading;
    
    // Calculate endpoint for the direction line
    const headingRad = (displayHeading * Math.PI) / 180;
    
    // Clear previous line
    if (leafletDeviceDirectionLine) {
      leafletMap.removeLayer(leafletDeviceDirectionLine);
    }
    
    // Calculate the endpoint coordinates
    const R = 6378137; // Earth's radius in meters
    const distance = 2000; // 2km line for compass direction
    
    // Convert to numbers and radians
    const lat1 = Number(userLocation.lat) * Math.PI / 180;
    const lon1 = Number(userLocation.lng) * Math.PI / 180;
    
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance / R) +
                Math.cos(lat1) * Math.sin(distance / R) * Math.cos(headingRad));
                
    const lon2 = lon1 + Math.atan2(Math.sin(headingRad) * Math.sin(distance / R) * Math.cos(lat1),
                      Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2));
    
    // Convert back to degrees
    const endLat = lat2 * 180 / Math.PI;
    const endLng = lon2 * 180 / Math.PI;
    
    // Draw the line
    const userLatLng = [userLocation.lat, userLocation.lng] as any;
    const endLatLng = [endLat, endLng] as any;
    
    // Use qibla accuracy color (red when far, green when close)
    const compassColor = getQiblaAccuracyColor();
    
    // Draw compass direction line with accuracy-based color
    leafletDeviceDirectionLine = L.polyline([
      userLatLng,
      endLatLng
    ], {
      color: compassColor,
      weight: 4,
      opacity: 0.8,
      dashArray: '8, 4' // Dashed line to differentiate from qibla line
    }).addTo(leafletMap);
    
    // Add direction indicator at the end
    try {
      const directionMarker = L.circleMarker(endLatLng, {
        radius: 6,
        fillColor: compassColor,
        color: '#FFFFFF',
        weight: 2,
        opacity: 1,
        fillOpacity: 1
      }).addTo(leafletMap);
    } catch (e) {
      console.warn('Failed to add direction marker to Leaflet map', e);
    }
  }
  
  function setupOrientationListeners() {
    // Try different orientation event types for better compatibility
    if (typeof window.DeviceOrientationEvent !== 'undefined') {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        // For iOS 13+ we need to request permission
        try {
          (DeviceOrientationEvent as any).requestPermission()
            .then((response: string) => {
              if (response === 'granted') {
                window.addEventListener('deviceorientation', 
                  event => handleOrientation(event as unknown as DeviceOrientationEvent), 
                  true);
                window.addEventListener('deviceorientationabsolute', 
                  event => handleOrientation(event as unknown as DeviceOrientationEvent), 
                  true);
                console.log('iOS orientation permission granted');
              } else {
                console.warn('iOS orientation permission not granted');
              }
            })
            .catch(console.error);
        } catch (e) {
          // Regular browsers don't need permission
          window.addEventListener('deviceorientation', 
            event => handleOrientation(event as unknown as DeviceOrientationEvent), 
            true);
          window.addEventListener('deviceorientationabsolute', 
            event => handleOrientation(event as unknown as DeviceOrientationEvent), 
            true);
          console.log('Using deviceorientation events');
        }
      } else {
        // Regular browsers don't need permission
        window.addEventListener('deviceorientation', 
          event => handleOrientation(event as unknown as DeviceOrientationEvent), 
          true);
        window.addEventListener('deviceorientationabsolute', 
          event => handleOrientation(event as unknown as DeviceOrientationEvent), 
          true);
        console.log('Using deviceorientation events');
      }
    } else {
      console.warn('Device orientation not supported by this browser');
    }
  }
  
  // Track if this is the first location update for auto-zoom
  let firstLocationUpdate = true;
  
  function updateMapWithLocation(autoZoom = false) {
    if (!userLocation) return;
    
    // Always auto-zoom on first location detection
    if (firstLocationUpdate) {
      autoZoom = true;
      firstLocationUpdate = false;
    }
    
    if (leafletMap) {
      // OpenStreetMap/Leaflet implementation
      updateLeafletMap(autoZoom);
    }
    
    // Обновляем линию направления если есть значение для heading
    if (currentHeading !== 0) {
      updateDeviceDirectionLine();
    }
  }
  
  function updateLeafletMap(autoZoom = false) {
    if (!leafletMap || !userLocation) return;
    
    // Center map on user location with appropriate zoom level
    const zoomLevel = autoZoom ? 
                     (locationAccuracy > 1000 ? 15 : 
                      locationAccuracy > 500 ? 16 : 
                      locationAccuracy > 100 ? 17 : 18) : 17;
    
    leafletMap.setView([userLocation.lat, userLocation.lng], zoomLevel);
    
    // Clear existing markers and lines
    leafletMap.eachLayer((layer: any) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline || (layer as any).options && ((layer as any).options.radius !== undefined)) {
        leafletMap.removeLayer(layer);
      }
    });
    
    // Don't add user location marker - minimal UI
    const userLatLng = [userLocation.lat, userLocation.lng] as any;
    
    // Add accuracy circle if we have accuracy data (minimal)
    if (locationAccuracy > 0) {
      try {
        const circle = (L as any).circle(userLatLng, {
          radius: locationAccuracy,
          fillColor: '#4285F4',
          color: '#4285F4',
          weight: 1,
          opacity: 0.2,
          fillOpacity: 0.05
        }).addTo(leafletMap);
      } catch (e) {
        console.warn('Failed to add accuracy circle to Leaflet map', e);
      }
    }
    
    // Calculate qibla line coordinates
    const R = 6378137; // Earth's radius in meters
    const distance = 2000000; // 2000km line for qibla direction
    const qiblaRad = (qiblaDirection * Math.PI) / 180;
    
    const lat1 = Number(userLocation.lat) * Math.PI / 180;
    const lon1 = Number(userLocation.lng) * Math.PI / 180;
    
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance / R) +
                Math.cos(lat1) * Math.sin(distance / R) * Math.cos(qiblaRad));
    const lon2 = lon1 + Math.atan2(Math.sin(qiblaRad) * Math.sin(distance / R) * Math.cos(lat1),
                      Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2));
    
    const qiblaEndLat = lat2 * 180 / Math.PI;
    const qiblaEndLng = lon2 * 180 / Math.PI;
    
    // Draw main qibla line with dynamic accent color
    const qiblaPolyline = L.polyline([
      userLatLng,
      [qiblaEndLat, qiblaEndLng]
    ], {
      color: $accentColor, // Use dynamic accent color from store
      weight: 4,
      opacity: 1.0
    }).addTo(leafletMap);
    
    // Add 15-degree tolerance area (semi-transparent)
    const tolerance = 15; // degrees
    
    // Calculate left boundary (qibla - 15°)
    const leftAngleRad = ((qiblaDirection - tolerance) * Math.PI) / 180;
    const leftLat2 = Math.asin(Math.sin(lat1) * Math.cos(distance / R) +
                    Math.cos(lat1) * Math.sin(distance / R) * Math.cos(leftAngleRad));
    const leftLon2 = lon1 + Math.atan2(Math.sin(leftAngleRad) * Math.sin(distance / R) * Math.cos(lat1),
                        Math.cos(distance / R) - Math.sin(lat1) * Math.sin(leftLat2));
    
    // Calculate right boundary (qibla + 15°)
    const rightAngleRad = ((qiblaDirection + tolerance) * Math.PI) / 180;
    const rightLat2 = Math.asin(Math.sin(lat1) * Math.cos(distance / R) +
                     Math.cos(lat1) * Math.sin(distance / R) * Math.cos(rightAngleRad));
    const rightLon2 = lon1 + Math.atan2(Math.sin(rightAngleRad) * Math.sin(distance / R) * Math.cos(lat1),
                         Math.cos(distance / R) - Math.sin(lat1) * Math.sin(rightLat2));
    
    // Create tolerance area polygon with dynamic accent color
    const toleranceArea = (L as any).polygon([
      userLatLng,
      [leftLat2 * 180 / Math.PI, leftLon2 * 180 / Math.PI],
      [rightLat2 * 180 / Math.PI, rightLon2 * 180 / Math.PI]
    ], {
      color: $accentColor, // Use dynamic accent color from store
      weight: 2,
      opacity: 0.6,
      fillColor: $accentColor, // Use dynamic accent color from store
      fillOpacity: 0.15
    }).addTo(leafletMap);
  }
  
  // Function to add passive event listeners to the map container
  function setupPassiveEventListeners(mapElement: HTMLElement) {
    const options = { passive: true };
    
    // Add passive listeners for touch and wheel events
    const eventTypes = ['touchstart', 'touchmove', 'touchend', 'wheel'];
    
    eventTypes.forEach(type => {
      // Just add passive listeners - don't try to replace the elements
      // as that can cause issues with map initialization
      try {
        mapElement.addEventListener(type, () => {}, options);
      } catch (e) {
        console.warn('Failed to add passive event listener:', e);
      }
    });
  }
  
  async function loadLeaflet() {
    return new Promise((resolve, reject) => {
      // If Leaflet is already loaded
      if (window.L) {
        resolve(true);
        return;
      }
      
      // Load Leaflet CSS
      const leafletCSS = document.createElement('link');
      leafletCSS.rel = 'stylesheet';
      leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      leafletCSS.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      leafletCSS.crossOrigin = '';
      document.head.appendChild(leafletCSS);
      
      // Load Leaflet JS
      const leafletScript = document.createElement('script');
      leafletScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      leafletScript.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      leafletScript.crossOrigin = '';
      
      leafletScript.onload = () => resolve(true);
      leafletScript.onerror = () => reject(new Error('Failed to load Leaflet'));
      
      document.head.appendChild(leafletScript);
    });
  }
  
  function initializeLeafletMap(mapElement: HTMLElement) {
    try {
      // Create Leaflet map with disabled zoom controls
      leafletMap = L.map(mapElement, {
        zoomControl: false // Remove zoom buttons
      }).setView([21.4225, 39.8262], 3);
      
      // Add dark mode OpenStreetMap tile layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20,
        subdomains: 'abcd'
      }).addTo(leafletMap);
      
      // Verify map was initialized correctly
      if (!leafletMap) {
        throw new Error('Failed to initialize Leaflet map');
      }
      
      // Add passive event listeners to improve performance
      setupPassiveEventListeners(mapElement);
      
      // Make sure map re-renders correctly
      setTimeout(() => {
        if (leafletMap) {
          leafletMap.invalidateSize();
        }
      }, 100);
    } catch (e) {
      console.error('Error initializing Leaflet map:', e);
      errorMessage = 'Failed to initialize map. Please try again later.';
      isLoading = false;
    }
  }
</script>

<style>
  /* Ensure accent color variables are available */
  :global(:root) {
    --accent-color-rgb: 0, 114, 255;
  }
</style>

<div class="relative w-full h-screen font-['Onest'] bg-gray-900 text-white overflow-hidden max-w-none">
  <div id="map" class="absolute inset-0 z-[1]"></div>
  
  <!-- Qibla accuracy indicator -->
  {#if userLocation && !isLoading && qiblaDirection > 0}
    <div class="absolute top-4 right-4 z-[100]">
      <div 
        class="w-4 h-4 rounded-full border-2 border-white/50 shadow-lg"
        style="background-color: {getQiblaAccuracyColor()};"
        title="Qibla Direction Accuracy{magneticDeclination !== 0 ? `\nMagnetic Declination: ${magneticDeclination > 0 ? '+' : ''}${magneticDeclination.toFixed(1)}°` : ''}"
      ></div>
    </div>
  {/if}
  
  {#if isLoading}
    <div class="absolute inset-0 flex flex-col justify-center items-center bg-gradient-to-br from-black/95 to-black/90 backdrop-blur-[10px] text-white z-[1000]">
      <div class="w-12 h-12 border-4 border-white/20 border-t-[var(--accent-color)] rounded-full animate-spin mb-5"></div>
      <p class="text-lg">{t('qibla_finding')}</p>
    </div>
  {:else if errorMessage}
    <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gradient-to-br from-yellow-50/95 to-yellow-50/90 backdrop-blur-[10px] rounded-2xl shadow-2xl border border-white/20 p-6 text-center z-[1000] max-w-80">
      <p class="text-gray-800 mb-5">{errorMessage}</p>
      <button 
        on:click={startQiblaFinder}
        class="px-6 py-3 bg-gradient-to-r from-[var(--accent-color)] to-[var(--accent-color)] text-white border-0 rounded-lg cursor-pointer text-base font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-0.5 bg-[length:200%_100%] bg-[position:0%_center]"
        style="box-shadow: 0 4px 16px rgba(var(--accent-color-rgb, 0, 114, 255), 0.3);"
      >
        {t('retry')}
      </button>
    </div>
  {/if}
</div>

