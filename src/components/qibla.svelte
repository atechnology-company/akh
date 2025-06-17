<script lang="ts">
  import { onMount } from 'svelte';
  import { calculateQiblaDirection } from '../modules/qibla';
  import { t } from '$lib/i18n';
  import { accentColor, gradientColor } from '$lib/stores/accentColor';
  
  let leafletDeviceDirectionLine: any = null;
  
  let userLocation: { lat: number; lng: number } | null = null;
  let qiblaDirection: number = 0;
  let isLoading: boolean = true;
  let errorMessage: string = '';
  let watchId: number;
  
  let currentHeading: number = 0;
  let isCalibrating: boolean = false;

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
  
  // Helper function to format accuracy for display
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
    
    let diff = Math.abs(currentHeading - qiblaDirection);
    // Handle circular nature of compass (0° = 360°)
    if (diff > 180) {
      diff = 360 - diff;
    }
    
    // Perfect accuracy within 5°, decreasing to 0 at 90°
    if (diff <= 5) return 1;
    if (diff >= 90) return 0;
    return 1 - ((diff - 5) / 85);
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
    
    // Показываем инструкции по калибровке
    setTimeout(() => {
      isCalibrating = false;
    }, 10000); // Даем 10 секунд на калибровку
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
      // Alpha is the compass direction the device is facing in degrees
      currentHeading = event.alpha;
      
      // Calculate compass accuracy for UI feedback
      compassAccuracy = calculateCompassAccuracy();
      
      // Обновляем линию направления на карте если есть местоположение
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
    
    // Calculate endpoint for the direction line
    const headingRad = (currentHeading * Math.PI) / 180;
    
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
    
    // Draw main qibla line with accent color
    const qiblaPolyline = L.polyline([
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
      leafletMap = L.map(mapElement, {
        zoomControl: false // Remove zoom buttons
      }).setView([21.4225, 39.8262], 3);
      
      // Add OpenStreetMap tile layer with a warm-colored style that fits the app's theme
      L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
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

<div class="qibla-container">
  <div id="map"></div>
  
  {#if isLoading}
    <div class="loading">
      <div class="spinner"></div>
      <p>{t('qibla_finding')}</p>
    </div>
  {:else if errorMessage}
    <div class="error">
      <p>{errorMessage}</p>
      <button on:click={startQiblaFinder}>
        {t('retry')}
      </button>
    </div>
  {/if}
  
  {#if isCalibrating}
    <div class="calibration-overlay">
      <div class="calibration-content">
        <h3>{t('qibla_permission')}</h3>
        <div class="figure-eight"></div>
        <p>{t('qibla_north')}</p>
        <button on:click={() => isCalibrating = false}>OK</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .qibla-container {
    position: relative;
    width: 100%;
    height: 100vh;
    font-family: 'Onest', sans-serif;
    background: #fff8e7;
    color: #000;
    overflow: hidden;
    max-width: none;
  }
  
  #map {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
  }
  
  .loading {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.95), rgba(0, 0, 0, 0.9));
    backdrop-filter: blur(10px);
    color: #ffffff;
    z-index: 1000;
  }
  
  .spinner {
    width: 50px;
    height: 50px;
    border: 5px solid rgba(255, 255, 255, 0.2);
    border-top-color: var(--accent-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 20px;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .error {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: linear-gradient(135deg, rgba(255, 248, 231, 0.95), rgba(255, 248, 231, 0.9));
    backdrop-filter: blur(10px);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 24px;
    text-align: center;
    z-index: 1000;
    max-width: 320px;
  }
  
  .error button {
    margin-top: 20px;
    padding: 12px 24px;
    background: var(--gradient-color, linear-gradient(135deg, var(--accent-color), var(--accent-color)));
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 600;
    transition: all 0.3s ease;
    box-shadow: 0 4px 16px rgba(var(--accent-color-rgb, 0, 114, 255), 0.3);
    background-size: 200% 100%;
    background-position: 0% center;
  }
  
  .error button:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(var(--accent-color-rgb, 0, 114, 255), 0.4);
  }
  
  .calibration-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.8);
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  
  .calibration-content {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.9));
    backdrop-filter: blur(10px);
    padding: 24px;
    border-radius: 16px;
    text-align: center;
    max-width: 80%;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }
  
  .figure-eight {
    width: 100px;
    height: 50px;
    margin: 20px auto;
    position: relative;
  }
  
  .figure-eight::before,
  .figure-eight::after {
    content: '';
    position: absolute;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    border: 3px solid var(--accent-color);
    box-sizing: border-box;
  }
  
  .figure-eight::before {
    left: 0;
  }
  
  .figure-eight::after {
    right: 0;
  }
  
  /* Ensure accent color variables are available */
  :global(:root) {
    --accent-color-rgb: 0, 114, 255;
  }
</style>