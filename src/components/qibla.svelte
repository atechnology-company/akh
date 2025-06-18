<script lang="ts">
  import { onMount } from 'svelte';
  import { calculateQiblaDirection } from '../modules/qibla';
  import { t } from '$lib/i18n';
  import { accentColor, gradientColor } from '$lib/stores/accentColor';
  import { browser } from '$app/environment';
  
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
  let geomagnetismLoaded: boolean = false;

  let leafletMap: any = null;
  
  let isStarted: boolean = true;
  let isHighAccuracyFailed: boolean = false;
  let locationAccuracy: number = 0;
  let accuracyText: string = "";
  
  // Variable to store accuracy circle for updates
  let accuracyCircle: any = null;
  
  // Add variables for compass accuracy tracking
  let isMobileDevice: boolean = false;
  
  // Geomagnetism module - loaded dynamically in browser only
  let geomagnetism: any = null;
  
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

  let jitterDetectionBuffer: number[] = [];
  let lastStableHeading: number = 0;
  let lastUpdateTime: number = 0;

  // Calculate variance of readings to detect instability
  function calculateVariance(readings: number[]): number {
    if (readings.length < 2) return 0;
    
    // Convert to unit vectors for circular variance
    let sumX = 0, sumY = 0;
    for (const heading of readings) {
      const radians = (heading * Math.PI) / 180;
      sumX += Math.cos(radians);
      sumY += Math.sin(radians);
    }
    
    const meanX = sumX / readings.length;
    const meanY = sumY / readings.length;
    const meanResultant = Math.sqrt(meanX * meanX + meanY * meanY);
    
    // Convert resultant to variance (1 = no variance, 0 = maximum variance)
    const circularVariance = (1 - meanResultant) * 180; // Scale to degrees
    return circularVariance;
  }

  let lastAcceptedHeading: number = 0;
  let smoothBuffer: number[] = [];
  let lastSmoothTime: number = 0;
  let bootstrapBuffer: number[] = [];
  let isBootstrapped: boolean = false;
  const SMOOTH_STEP = 3; // max step for smooth movement
  const JUMP_THRESHOLD = 8; // ignore jumps larger than this
  const SMOOTH_SEQUENCE = 3; // how many small steps to accept a new movement
  const BOOTSTRAP_SIZE = 6; // readings needed to find initial smooth movement

  // Smooth heading updates to reduce jitter
  function smoothHeading(newHeading: number): number {
    const now = Date.now();
    
    // Bootstrap phase: collect readings until we find first smooth movement
    if (!isBootstrapped) {
      bootstrapBuffer.push(newHeading);
      if (bootstrapBuffer.length > BOOTSTRAP_SIZE) {
        bootstrapBuffer.shift();
      }
      
      // Look for a smooth sequence in the bootstrap buffer
      if (bootstrapBuffer.length >= SMOOTH_SEQUENCE + 1) {
        let bestSequence: number[] = [];
        
        // Find the longest smooth sequence
        for (let start = 0; start <= bootstrapBuffer.length - SMOOTH_SEQUENCE; start++) {
          let sequence = [bootstrapBuffer[start]];
          
          for (let i = start + 1; i < bootstrapBuffer.length; i++) {
            let diff = Math.abs(bootstrapBuffer[i] - sequence[sequence.length - 1]);
            if (diff > 180) diff = 360 - diff;
            
            if (diff <= SMOOTH_STEP) {
              sequence.push(bootstrapBuffer[i]);
            } else {
              break;
            }
          }
          
          if (sequence.length >= SMOOTH_SEQUENCE && sequence.length > bestSequence.length) {
            bestSequence = sequence;
          }
        }
        
        // If we found a good smooth sequence, bootstrap with it
        if (bestSequence.length >= SMOOTH_SEQUENCE) {
          lastAcceptedHeading = bestSequence[bestSequence.length - 1];
          smoothBuffer = bestSequence.slice(-SMOOTH_SEQUENCE);
          isBootstrapped = true;
          lastSmoothTime = now;
          console.log(`Bootstrapped with smooth sequence: ${bestSequence.map(h => h.toFixed(1)).join(' → ')}°`);
          return lastAcceptedHeading;
        }
      }
      
      // Still bootstrapping, return the average of recent readings as a stable placeholder
      if (bootstrapBuffer.length > 0) {
        let sumX = 0, sumY = 0;
        for (const heading of bootstrapBuffer) {
          const radians = (heading * Math.PI) / 180;
          sumX += Math.cos(radians);
          sumY += Math.sin(radians);
        }
        let avgHeading = Math.atan2(sumY / bootstrapBuffer.length, sumX / bootstrapBuffer.length) * (180 / Math.PI);
        if (avgHeading < 0) avgHeading += 360;
        return avgHeading;
      }
      
      return newHeading;
    }

    // Normal operation: we have a bootstrapped smooth movement
    let diff = Math.abs(newHeading - lastAcceptedHeading);
    if (diff > 180) diff = 360 - diff;

    // If the new heading is a small step, accept it and add to buffer
    if (diff <= SMOOTH_STEP) {
      smoothBuffer.push(newHeading);
      if (smoothBuffer.length > SMOOTH_SEQUENCE) smoothBuffer.shift();
      lastAcceptedHeading = newHeading;
      lastSmoothTime = now;
      return newHeading;
    } else {
      // If it's a jump, check if we have a sequence of small steps leading to it
      let isSmoothSequence = true;
      for (let i = 1; i < smoothBuffer.length; i++) {
        let step = Math.abs(smoothBuffer[i] - smoothBuffer[i - 1]);
        if (step > 180) step = 360 - step;
        if (step > SMOOTH_STEP) {
          isSmoothSequence = false;
          break;
        }
      }
      
      if (isSmoothSequence && smoothBuffer.length >= SMOOTH_SEQUENCE) {
        // Accept the new heading as part of a smooth movement
        smoothBuffer.push(newHeading);
        if (smoothBuffer.length > SMOOTH_SEQUENCE) smoothBuffer.shift();
        lastAcceptedHeading = newHeading;
        lastSmoothTime = now;
        return newHeading;
      } else {
        // Ignore the jump, stay at last accepted smooth value
        return lastAcceptedHeading;
      }
    }
  }

  // Detect if device is mobile
  function detectMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (window.DeviceOrientationEvent !== undefined && typeof (window.DeviceOrientationEvent as any).requestPermission === 'function');
  }
  
  // Load geomagnetism library dynamically (browser-only)
  async function loadGeomagnetism() {
    if (browser && !geomagnetism) {
      try {
        const geomagnetismModule = await import('geomagnetism');
        geomagnetism = geomagnetismModule;
        geomagnetismLoaded = true;
        console.log('Geomagnetism library loaded successfully');
      } catch (error) {
        console.warn('Failed to load geomagnetism library, continuing without magnetic declination correction:', error);
        geomagnetismLoaded = false;
        geomagnetism = null;
        // Will use fallback magnetic declination calculation
      }
    } else if (!browser) {
      geomagnetismLoaded = false;
    }
  }

  // Calculate magnetic declination for the user's location
  function calculateMagneticDeclination(latitude: number, longitude: number): number {
    if (!browser || !geomagnetismLoaded || !geomagnetism) {
      console.warn('Geomagnetism library not available, using simplified fallback');
      // Simplified fallback magnetic declination calculation
      return getSimplifiedMagneticDeclination(latitude, longitude);
    }
    
    try {
      const date = new Date();
      const magData = geomagnetism.model(date).point([latitude, longitude]);
      const declination = magData.decl; // Declination in degrees
      console.log(`Magnetic declination for location (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) on ${date.toDateString()}: ${declination.toFixed(2)}°`);
      return declination;
    } catch (error) {
      console.warn('Failed to calculate magnetic declination, using fallback:', error);
      return getSimplifiedMagneticDeclination(latitude, longitude);
    }
  }

  // Simplified magnetic declination calculation for fallback
  function getSimplifiedMagneticDeclination(lat: number, lng: number): number {
    // This is a very rough approximation based on location
    // East is positive, West is negative
    let declination = 0;
    
    if (lat > 0) { // Northern hemisphere
      if (lng < -60) { // Americas
        declination = -15 + (lng + 120) * 0.1;
      } else if (lng < 60) { // Europe/Africa
        declination = 5 - lng * 0.1;
      } else { // Asia
        declination = -10 + (lng - 60) * 0.05;
      }
    } else { // Southern hemisphere
      if (lng < -60) { // South America
        declination = 10 + (lng + 120) * 0.05;
      } else if (lng < 60) { // Africa
        declination = 15 - lng * 0.1;
      } else { // Australia/Asia
        declination = 5 + (lng - 60) * 0.05;
      }
    }
    
    // Clamp to reasonable range
    const result = Math.max(-30, Math.min(30, declination));
    console.log(`Simplified magnetic declination for location (${lat.toFixed(4)}, ${lng.toFixed(4)}): ${result.toFixed(2)}°`);
    return result;
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
    
    // Initialize component asynchronously
    const initializeComponent = async () => {
      try {
        // Load geomagnetism library dynamically in browser only
        if (browser) {
          await loadGeomagnetism();
        }
        
        // Detect mobile device
        isMobileDevice = detectMobileDevice();
        
        // Start qibla finder automatically with OpenStreetMap
        if (isStarted) {
          startQiblaFinder();
        }
      } catch (error) {
        console.error('Error during qibla component initialization:', error);
        // Continue without geomagnetism if there's an error
        geomagnetismLoaded = false;
        isMobileDevice = detectMobileDevice();
        if (isStarted) {
          // Add timeout fallback in case everything fails
          setTimeout(() => {
            if (isLoading) {
              console.warn('Initialization appears stuck, forcing loading to false');
              isLoading = false;
              errorMessage = 'Failed to initialize qibla finder. Please refresh the page.';
            }
          }, 30000); // 30 second ultimate fallback
          startQiblaFinder();
        }
      }
    };
    
    // Start initialization
    initializeComponent();
    
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
    console.log('startQiblaFinder called');
    isStarted = true;
    
    // Check if geolocation is available
    if (!navigator.geolocation) {
      console.log('Geolocation not supported');
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
    
    // Add a timeout to prevent getting stuck loading
    const loadingTimeout = setTimeout(() => {
      console.warn('Map loading timeout, continuing without map');
      isLoading = false;
      errorMessage = 'Map loading timed out. Location services may still work.';
    }, 15000); // 15 second timeout
    
    console.log('About to call loadLeaflet()');
    loadLeaflet()
      .then(() => {
        console.log('Leaflet loaded successfully, initializing map');
        clearTimeout(loadingTimeout);
        initializeLeafletMap(mapElement);
        console.log('About to call loadUserLocation()');
        loadUserLocation();
      })
      .catch((error: Error) => {
        console.log('Leaflet loading failed:', error);
        clearTimeout(loadingTimeout);
        console.error('Failed to load Leaflet map:', error);
        errorMessage = 'Failed to load map services. Trying location services only.';
        // Try to continue with location services even without map
        console.log('Trying loadUserLocation() without map');
        loadUserLocation();
      });
  }

  

  
  function loadUserLocation() {
    console.log('Starting location services...');
    
    // Add a timeout for location services
    const locationTimeout = setTimeout(() => {
      console.warn('Location service timeout, stopping loading');
      isLoading = false;
      errorMessage = 'Location service timed out. Please check your GPS and permissions.';
    }, 20000); // 20 second timeout for location
    
    // Если доступен NativeScript geolocation, используем его
    if (isUsingNativeDirection && nativescriptGeolocation) {
      nativescriptGeolocation.enableLocationRequest()
        .then(() => {
          const options = {
            desiredAccuracy: 3, // high accuracy
            updateDistance: 1,
            maximumAge: 5000,
            timeout: 15000 // Reduced timeout
          };
          
          // Получаем текущее местоположение
          nativescriptGeolocation.getCurrentLocation(options)
            .then((location: any) => {
              clearTimeout(locationTimeout);
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
            .catch((error: any) => {
              clearTimeout(locationTimeout);
              handleLocationError(error);
            });
          
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
        .catch((error: any) => {
          clearTimeout(locationTimeout);
          handleLocationError(error);
        });
    } else {
      // Используем стандартный веб API геолокации как раньше
      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(locationTimeout);
          handlePositionSuccess(position);
        },
        (error) => {
          clearTimeout(locationTimeout);
          handleLocationError(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000, // Increased timeout to 15 seconds
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
          // iOS: alpha is degrees from north, clockwise
          // Need to flip east/west: reverse the direction
          rawHeading = 360 - rawHeading;
          if (rawHeading >= 360) rawHeading -= 360;
        } else if (isAndroid) {
          // Android: alpha is typically correct, but may need east/west flip
          // Flip east/west by reversing the direction
          rawHeading = 360 - rawHeading;
          if (rawHeading >= 360) rawHeading -= 360;
        } else {
          // Desktop browsers - flip east/west
          rawHeading = 360 - rawHeading;
          if (rawHeading >= 360) rawHeading -= 360;
        }
      }
      
      // Apply magnetic declination correction to get true heading
      const correctedHeading = correctMagneticHeading(rawHeading, magneticDeclination);
      
      // Apply smoothing to reduce jitter
      const newSmoothedHeading = smoothHeading(correctedHeading);
      
      // Only update if the change is significant (reduces unnecessary updates)
      if (Math.abs(newSmoothedHeading - smoothedHeading) > 0.05) { // Very low threshold for high update rate
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

<div class="qibla-container relative w-full h-screen font-['Onest'] bg-gray-900 text-white overflow-hidden max-w-none">
  <div id="map" class="absolute inset-0 z-[1]"></div>
  
  <!-- Qibla accuracy indicator removed per user request -->
  <!-- {#if userLocation && !isLoading && qiblaDirection > 0}
    <div class="absolute top-4 right-4 z-[100]">
      <div 
        class="w-4 h-4 rounded-full border-2 border-white/50 shadow-lg"
        style="background-color: {getQiblaAccuracyColor()};"
        title="Qibla Direction Accuracy{magneticDeclination !== 0 ? `\nMagnetic Declination: ${magneticDeclination > 0 ? '+' : ''}${magneticDeclination.toFixed(1)}°` : ''}"
      ></div>
    </div>
  {/if} -->
  
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

