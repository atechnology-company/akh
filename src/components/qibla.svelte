<script lang="ts">
  // i bet you dont have a schizo multilingual copilot
  import { onMount } from 'svelte';
  import { calculateQiblaDirection } from '../modules/qibla';
  import { t } from '$lib/i18n';
  import { accentColor, gradientColor } from '$lib/stores/accentColor';
  import * as geomagnetism from 'geomagnetism';
  
  // Get Leaflet instance
  const L = () => (window as any).L;
  
  let leafletDeviceDirectionLine: any = null;
  
  let userLocation: { lat: number; lng: number } | null = null;
  let qiblaDirection: number = 0;
  let isLoading: boolean = true;
  let errorMessage: string = '';
  let watchId: number;
  
  let currentHeading: number = 0;
  let isCalibrating: boolean = false;
  
  // Smoothing variables for compass
  let smoothedHeading: number = 0;
  let headingHistory: number[] = [];
  const SMOOTHING_FACTOR = 0.7; // Higher = more smoothing (0-1)
  const HISTORY_SIZE = 5;
  
  // Throttling variables
  let lastOrientationUpdate = 0;
  const ORIENTATION_THROTTLE = 100; // ms between updates

  let leafletMap: any = null;
  
  let isStarted: boolean = true;
  let isHighAccuracyFailed: boolean = false;
  let locationAccuracy: number = 0;
  let accuracyText: string = "";
  
  // Variable to store accuracy circle for updates
  let accuracyCircle: any = null;
  
  // Add variables for compass accuracy tracking
  let compassAccuracy: number = 0; // 0-1 scale where 1 is perfect accuracy
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
  
  // Helper function to smooth compass readings
  function smoothHeading(newHeading: number): number {
    // Handle the circular nature of compass readings (0° = 360°)
    if (headingHistory.length > 0) {
      const lastHeading = headingHistory[headingHistory.length - 1];
      let diff = newHeading - lastHeading;
      
      // Adjust for circular nature (crossing 0°/360°)
      if (diff > 180) {
        newHeading -= 360;
      } else if (diff < -180) {
        newHeading += 360;
      }
    }
    
    // Add to history
    headingHistory.push(newHeading);
    if (headingHistory.length > HISTORY_SIZE) {
      headingHistory.shift();
    }
    
    // Calculate smoothed value using exponential moving average
    if (smoothedHeading === 0) {
      smoothedHeading = newHeading;
    } else {
      smoothedHeading = SMOOTHING_FACTOR * smoothedHeading + (1 - SMOOTHING_FACTOR) * newHeading;
    }
    
    // Normalize back to 0-360 range
    smoothedHeading = (smoothedHeading + 360) % 360;
    
    return smoothedHeading;
  }
  
  // Helper function to get magnetic declination using geomagnetism package
  function getMagneticDeclination(lat: number, lng: number): number {
    try {
      // Use the geomagnetism package for accurate magnetic declination
      const model = geomagnetism.model();
      const info = model.point([lat, lng]);
      
      // Return the declination in degrees
      return info.decl;
    } catch (error) {
      console.warn('Failed to calculate magnetic declination:', error);
      
      // Fallback to simplified calculation if geomagnetism fails
      if (lat > 60) return -15; // Northern regions
      if (lat < -60) return 15; // Southern regions
      if (lng > 100 && lng < 140 && lat > 20 && lat < 50) return -7; // East Asia
      if (lng > -130 && lng < -60 && lat > 25 && lat < 50) return -15; // North America
      if (lng > -10 && lng < 40 && lat > 35 && lat < 70) return 2; // Europe
      
      return 0; // Default to no declination
    }
  }

  // Helper function to format distance for display
  function formatAccuracy(meters: number): string {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    } else {
      return `${Math.round(meters)} m`;
    }
  }
  
  // Detect if device is mobile
  function detectMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (window.DeviceOrientationEvent !== undefined && typeof (window.DeviceOrientationEvent as any).requestPermission === 'function');
  }
  
  // Calculate compass accuracy based on heading difference from qibla
  function calculateCompassAccuracy(): number {
    if (qiblaDirection === 0 || currentHeading === 0) return 0;
    
    // Use smoothed heading for accuracy calculation
    const heading = smoothedHeading || currentHeading;
    let diff = Math.abs(heading - qiblaDirection);
    
    // Handle circular nature of compass (0° = 360°)
    if (diff > 180) {
      diff = 360 - diff;
    }
    
    // Perfect accuracy within 5°, decreasing to 0 at 90°
    if (diff <= 5) return 1;
    if (diff >= 90) return 0;
    return 1 - ((diff - 5) / 85);
  }
  
  // Function to validate compass reading against known good reference
  function validateCompassReading(): { isValid: boolean; message: string } {
    if (!userLocation || qiblaDirection === 0) {
      return { isValid: false, message: "Location or qibla direction not available" };
    }
    
    const heading = smoothedHeading || currentHeading;
    if (heading === 0) {
      return { isValid: false, message: "No compass reading available" };
    }
    
    // Check if compass is within reasonable range of qibla direction
    let diff = Math.abs(heading - qiblaDirection);
    if (diff > 180) {
      diff = 360 - diff;
    }
    
    if (diff <= 15) {
      return { isValid: true, message: "Compass aligned with qibla" };
    } else if (diff <= 45) {
      return { isValid: true, message: "Compass roughly aligned" };
    } else if (diff >= 150) {
      return { isValid: false, message: "Compass showing opposite direction - may need calibration" };
    } else {
      return { isValid: false, message: "Compass may need calibration" };
    }
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
        
      // Clear compass readings
      currentHeading = 0;
      smoothedHeading = 0;
      headingHistory = [];
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
                currentHeading = location.direction;
                // Обновляем линию направления на карте
                updateDeviceDirectionLine();
              }
              
              // Пересчитываем направление на Киблу
              qiblaDirection = calculateQiblaDirection(location.latitude, location.longitude);
              
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
            currentHeading = position.coords.heading;
            // Обновляем линию направления на карте
            updateDeviceDirectionLine();
          }
          
          // Пересчитываем направление на Киблу
          qiblaDirection = calculateQiblaDirection(lat, lng);
          
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
    
    // Проверяем, доступно ли направление устройства
    if (position.coords.heading !== null && position.coords.heading !== undefined) {
      currentHeading = position.coords.heading;
      console.log(`Device heading from geolocation: ${currentHeading}`);
    }
    
    // Рассчитываем направление на Киблу
    qiblaDirection = calculateQiblaDirection(lat, lng);
    
    // Calculate compass accuracy for UI feedback
    compassAccuracy = calculateCompassAccuracy();
    
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
    isCalibrating = true;
    
    // Reset smoothing variables for fresh calibration
    smoothedHeading = 0;
    headingHistory = [];
    
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
                console.log('Orientation permission granted for calibration');
                // Переподключаем слушатели событий с новой настройкой
                setupOrientationListeners();
              } else {
                console.warn('Orientation permission not granted for calibration');
              }
            })
            .catch(console.error);
        }
      } catch (e) {
        console.log('Standard calibration mode');
      }
    }
    
    // Показываем инструкции по калибровке
    setTimeout(() => {
      isCalibrating = false;
    }, 15000); // Даем 15 секунд на калибровку
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
    // Throttle orientation updates for better performance
    const now = Date.now();
    if (now - lastOrientationUpdate < ORIENTATION_THROTTLE) {
      return;
    }
    lastOrientationUpdate = now;
    
    // Get compass heading from device
    if (event.alpha !== null) {
      let rawHeading = event.alpha;
      
      // Apply magnetic declination correction if we have user location
      if (userLocation) {
        const magneticDeclination = getMagneticDeclination(userLocation.lat, userLocation.lng);
        rawHeading = (rawHeading + magneticDeclination + 360) % 360;
      }
      
      // For iOS and some Android devices, we need to reverse the direction
      // because they report the direction the device is pointing, not the magnetic north
      if (window.DeviceOrientationEvent && typeof (window.DeviceOrientationEvent as any).webkitCompassHeading !== 'undefined') {
        // iOS devices
        rawHeading = (360 - rawHeading) % 360;
      } else if (navigator.userAgent.includes('Chrome') && navigator.userAgent.includes('Mobile')) {
        // Android Chrome might need correction depending on device
        // For most Android devices, the alpha value is already correct
        // but some might need reversal - this is device-specific
      }
      
      // Apply smoothing to reduce erratic movement
      currentHeading = smoothHeading(rawHeading);
      
      // Debug logging (remove in production)
      if (userLocation) {
        console.log(`Raw: ${rawHeading.toFixed(1)}°, Smoothed: ${currentHeading.toFixed(1)}°, Qibla: ${qiblaDirection.toFixed(1)}°, Diff: ${Math.abs(currentHeading - qiblaDirection).toFixed(1)}°`);
      }
      
      // Calculate compass accuracy for UI feedback
      compassAccuracy = calculateCompassAccuracy();
      
      // Update device direction line on map if we have location
      if (userLocation) {
        updateDeviceDirectionLine();
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
    
    // Use smoothed heading for display
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
    
    // Color based on compass accuracy: red (poor) to green (perfect)
    const red = Math.floor(255 * (1 - compassAccuracy));
    const green = Math.floor(255 * compassAccuracy);
    const compassColor = `rgb(${red}, ${green}, 0)`;
    
    // Draw compass direction line with accuracy-based color
    leafletDeviceDirectionLine = L().polyline([
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
      const directionMarker = L().circleMarker(endLatLng, {
        radius: 6,
        fillColor: compassColor,
        color: '#FFFFFF',
        weight: 2,
        opacity: 1,
        fillOpacity: 1
      }).addTo(leafletMap);
      
      // Add compass heading text for debugging
      const headingText = L().tooltip({
        permanent: true,
        direction: 'top',
        className: 'compass-tooltip'
      }).setContent(`${Math.round(displayHeading)}°`);
      
      directionMarker.bindTooltip(headingText);
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
                // Use deviceorientationabsolute for iOS when available (more accurate)
                if ('ondeviceorientationabsolute' in window) {
                  (window as any).addEventListener('deviceorientationabsolute', 
                    (event: DeviceOrientationEvent) => handleOrientation(event), 
                    true);
                  console.log('iOS using deviceorientationabsolute events');
                } else {
                  (window as any).addEventListener('deviceorientation', 
                    (event: DeviceOrientationEvent) => handleOrientation(event), 
                    true);
                  console.log('iOS using deviceorientation events');
                }
              } else {
                console.warn('iOS orientation permission not granted');
              }
            })
            .catch(console.error);
        } catch (e) {
          // Regular browsers don't need permission
          setupStandardOrientationListeners();
        }
      } else {
        // Regular browsers don't need permission
        setupStandardOrientationListeners();
      }
    } else {
      console.warn('Device orientation not supported by this browser');
    }
  }
  
  function setupStandardOrientationListeners() {
    // Prefer absolute orientation when available (more accurate for compass)
    if ('ondeviceorientationabsolute' in window) {
      (window as any).addEventListener('deviceorientationabsolute', 
        (event: DeviceOrientationEvent) => handleOrientation(event), 
        true);
      console.log('Using deviceorientationabsolute events');
    } else {
      (window as any).addEventListener('deviceorientation', 
        (event: DeviceOrientationEvent) => handleOrientation(event), 
        true);
      console.log('Using deviceorientation events');
    }
    
    // Also listen for regular deviceorientation as fallback
    (window as any).addEventListener('deviceorientation', 
      (event: DeviceOrientationEvent) => handleOrientation(event), 
      true);
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
      if (layer instanceof L().Marker || layer instanceof L().Polyline || (layer as any).options && ((layer as any).options.radius !== undefined)) {
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
    
    // Draw main qibla line with accent color
    const qiblaPolyline = L().polyline([
      userLatLng,
      [qiblaEndLat, qiblaEndLng]
    ], {
      color: 'var(--accent-color)',
      weight: 3,
      opacity: 0.9
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
    
    // Create tolerance area polygon
    const toleranceArea = (L as any).polygon([
      userLatLng,
      [leftLat2 * 180 / Math.PI, leftLon2 * 180 / Math.PI],
      [rightLat2 * 180 / Math.PI, rightLon2 * 180 / Math.PI]
    ], {
      color: 'var(--accent-color)',
      weight: 1,
      opacity: 0.3,
      fillColor: 'var(--accent-color)',
      fillOpacity: 0.1
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
      leafletMap = L().map(mapElement, {
        zoomControl: false // Remove zoom buttons
      }).setView([21.4225, 39.8262], 3);
      
      // Add OpenStreetMap tile layer with a warm-colored style that fits the app's theme
      L().tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
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

<div class="relative w-full h-screen font-['Onest'] bg-[#fff8e7] text-black overflow-hidden max-w-none">
  <div id="map" class="absolute inset-0 w-full h-full z-[1]"></div>
  
  <!-- Compass accuracy and controls overlay -->
  {#if userLocation && !isLoading && !errorMessage}
    <div class="absolute top-5 right-5 bg-white/95 backdrop-blur-[10px] rounded-xl p-3 shadow-[0_4px_16px_rgba(0,0,0,0.1)] border border-white/20 z-[100] text-xs max-w-[200px]">
      <div class="mb-2">
        <div class="mb-1 whitespace-nowrap">📍 {accuracyText}</div>
        <div class="mb-1 whitespace-nowrap">
          🧭 Compass: 
          <span class="font-bold" class:text-green-500={compassAccuracy > 0.7} class:text-amber-500={compassAccuracy > 0.3 && compassAccuracy <= 0.7} class:text-red-500={compassAccuracy <= 0.3}>
            {Math.round(compassAccuracy * 100)}%
          </span>
        </div>
        <div class="mb-1 whitespace-nowrap">Heading: {Math.round(smoothedHeading || currentHeading)}°</div>
        <div class="mb-1 whitespace-nowrap">Qibla: {Math.round(qiblaDirection)}°</div>
        {#if currentHeading > 0}
          {@const validation = validateCompassReading()}
          <div class="text-xs font-semibold px-2 py-1 rounded mt-1" 
               class:bg-green-100={validation.isValid} 
               class:text-green-600={validation.isValid} 
               class:border={validation.isValid} 
               class:border-green-200={validation.isValid} 
               class:bg-red-100={!validation.isValid} 
               class:text-red-600={!validation.isValid} 
               class:border-red-200={!validation.isValid}>
            {validation.message}
          </div>
        {/if}
      </div>
      <button 
        class="w-full px-3 py-2 bg-gradient-to-br from-[var(--accent-color)] to-[var(--accent-color)] text-white border-none rounded-md cursor-pointer text-xs font-semibold transition-all duration-300 shadow-[0_2px_8px_rgba(var(--accent-color-rgb,0,114,255),0.3)] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(var(--accent-color-rgb,0,114,255),0.4)]"
        on:click={calibrateCompass}
      >
        Calibrate Compass
      </button>
    </div>
  {/if}
  
  {#if isLoading}
    <div class="absolute inset-0 w-full h-full flex flex-col justify-center items-center bg-gradient-to-br from-black/95 to-black/90 backdrop-blur-[10px] text-white z-[1000]">
      <div class="w-[50px] h-[50px] border-[5px] border-white/20 border-t-[var(--accent-color)] rounded-full animate-spin mb-5"></div>
      <p>{t('qibla_finding')}</p>
    </div>
  {:else if errorMessage}
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-br from-[#fff8e7]/95 to-[#fff8e7]/90 backdrop-blur-[10px] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] border border-white/20 p-6 text-center z-[1000] max-w-[320px]">
      <p>{errorMessage}</p>
      <button 
        class="mt-5 px-6 py-3 bg-gradient-to-br from-[var(--accent-color)] to-[var(--accent-color)] text-white border-none rounded-lg cursor-pointer text-base font-semibold transition-all duration-300 shadow-[0_4px_16px_rgba(var(--accent-color-rgb,0,114,255),0.3)] bg-[length:200%_100%] bg-[position:0%_center] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(var(--accent-color-rgb,0,114,255),0.4)]"
        on:click={startQiblaFinder}
      >
        {t('retry')}
      </button>
    </div>
  {/if}
  
  {#if isCalibrating}
    <div class="fixed inset-0 bg-black/80 z-[1000] flex justify-center items-center">
      <div class="bg-gradient-to-br from-white/95 to-white/90 backdrop-blur-[10px] p-6 rounded-2xl text-center max-w-[90%] max-h-[80vh] overflow-y-auto border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
        <h3 class="mb-4 text-[var(--accent-color)]">📱 Calibrate Your Compass</h3>
        <div class="w-[100px] h-[50px] mx-auto my-5 relative before:content-[''] before:absolute before:w-[50px] before:h-[50px] before:rounded-full before:border-[3px] before:border-[var(--accent-color)] before:box-border before:left-0 after:content-[''] after:absolute after:w-[50px] after:h-[50px] after:rounded-full after:border-[3px] after:border-[var(--accent-color)] after:box-border after:right-0"></div>
        <p><strong>To improve accuracy:</strong></p>
        <ol class="text-left my-4 pl-5">
          <li class="mb-2 leading-[1.4]">Hold your device flat (parallel to ground)</li>
          <li class="mb-2 leading-[1.4]">Move in a figure-8 pattern 3-4 times</li>
          <li class="mb-2 leading-[1.4]">Rotate slowly 360° horizontally</li>
          <li class="mb-2 leading-[1.4]">Keep away from metal objects</li>
        </ol>
        <p><em>This helps calibrate the magnetic sensor for better qibla direction.</em></p>
        <button 
          class="mt-5 px-6 py-3 bg-gradient-to-br from-[var(--accent-color)] to-[var(--accent-color)] text-white border-none rounded-lg cursor-pointer text-base font-semibold transition-all duration-300 shadow-[0_4px_16px_rgba(var(--accent-color-rgb,0,114,255),0.3)]"
          on:click={() => isCalibrating = false}
        >
          Done
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(:root) {
    --accent-color-rgb: 0, 114, 255;
  }
  
  /* Compass tooltip styling */
  :global(.compass-tooltip) {
    background: rgba(0, 0, 0, 0.8) !important;
    border: none !important;
    border-radius: 4px !important;
    color: white !important;
    font-size: 12px !important;
    font-weight: bold !important;
    padding: 4px 8px !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
  }
  
  :global(.compass-tooltip::before) {
    border-top-color: rgba(0, 0, 0, 0.8) !important;
  }
</style>