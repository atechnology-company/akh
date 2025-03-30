<script lang="ts">
  import { onMount } from 'svelte';
  import { calculateQiblaDirection, calculateDistanceToKaaba } from '../modules/qibla';
  import { t } from '$lib/i18n';
  
  let map: google.maps.Map;
  let qiblaLine: google.maps.Polyline;
  let deviceDirectionLine: any;
  let leafletDeviceDirectionLine: any = null;
  
  let userLocation: google.maps.LatLng | null = null;
  let qiblaDirection: number = 0;
  let distanceToKaaba: number = 0;
  let isLoading: boolean = true;
  let errorMessage: string = '';
  let watchId: number;
  
  let currentHeading: number = 0;
  let isCalibrating: boolean = false;

  let useOpenStreetMap = false;
  let leafletMap: any = null;
  
  let isStarted: boolean = true;
  let isHighAccuracyFailed: boolean = false;
  let locationAccuracy: number = 0;
  let accuracyText: string = "";
  
  // Variable to store accuracy circle for updates
  let accuracyCircle: any = null;
  
  // Импортируем модуль NativeScript geolocation если он доступен
  let nativescriptGeolocation: any;

  // Функция для проверки доступности расширенных маркеров Google Maps
  function hasGoogleMapsAdvancedMarkers(): boolean {
    return !!(
      window.google && 
      window.google.maps && 
      google.maps.marker && 
      google.maps.marker.AdvancedMarkerElement
    );
  }
  
  // Функция для перезагрузки Google Maps API если нет поддержки расширенных маркеров
  function reloadGoogleMapsIfNeeded() {
    if (window.google && window.google.maps && !hasGoogleMapsAdvancedMarkers()) {
      console.log('Google Maps API loaded without marker library, reloading...');
      // Удаляем все существующие скрипты Google Maps
      document.querySelectorAll('script').forEach(script => {
        if (script.src && script.src.includes('maps.googleapis.com')) {
          script.remove();
        }
      });
      // Очищаем API
      (window as any).google = undefined;
      // Перезагружаем API через основную функцию
      return loadGoogleMapsAPI();
    }
    return Promise.resolve(true);
  }
  
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
  
  onMount(() => {
    // Check if the component is actually visible in DOM
    const qiblaContainer = document.querySelector('.qibla-container');
    if (!qiblaContainer || !document.body.contains(qiblaContainer)) {
      console.log('Qibla component is not visible in DOM, skipping initialization');
      return;
    }
    
    // Start qibla finder automatically
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

    // Добавляем проверку на наличие библиотек Google Maps перед их использованием
    if (window.google && window.google.maps) {
      console.log('Google Maps already loaded, checking for marker library');
      // Проверяем и при необходимости перезагружаем API
      reloadGoogleMapsIfNeeded()
        .then(() => {
          // Инициализируем карту после проверки
          initializeMap(mapElement);
          loadUserLocation();
        })
        .catch((error) => {
          console.error('Failed to reload Google Maps API:', error);
          // Fall back to OpenStreetMap
          useOpenStreetMap = true;
          loadLeaflet()
            .then(() => {
              initializeLeafletMap(mapElement);
              loadUserLocation();
            })
            .catch(() => {
              errorMessage = 'Failed to load any map services. Please try again later.';
              isLoading = false;
            });
        });
      return;
    }

    // Try Google Maps first
    loadGoogleMapsAPI()
      .then(() => {
        // Add a small delay to ensure DOM is ready
        setTimeout(() => {
          initializeMap(mapElement);
          loadUserLocation();
        }, 100);
      })
      .catch((error: Error) => {
        console.error('Google Maps failed to load, trying OpenStreetMap instead', error);
        // Fall back to OpenStreetMap/Leaflet
        useOpenStreetMap = true;
        loadLeaflet()
          .then(() => {
            initializeLeafletMap(mapElement);
            loadUserLocation();
          })
          .catch((error: Error) => {
            errorMessage = 'Failed to load map services. Please try again later.';
            isLoading = false;
          });
      });
  }
  
  async function loadGoogleMapsAPI() {
    return new Promise((resolve, reject) => {
      // Check if Google Maps API is already loaded
      if (window.google && window.google.maps) {
        // Проверяем доступность библиотеки marker
        if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
          console.log('Google Maps API with marker library already loaded');
          resolve(true);
          return;
        } else {
          console.log('Google Maps API loaded but without marker library, reloading...');
          (window as any).google = undefined;
        }
      }
      
      // Create callback function for Google Maps API
      const callbackName = 'googleMapsInitialize_' + Math.random().toString(36).substr(2, 9);
      (window as any)[callbackName] = () => {
        resolve(true);
        delete (window as any)[callbackName];
      };
      
      // Create script element to load Google Maps API
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&libraries=geometry,places,marker&callback=${callbackName}&loading=async&v=beta`;
      script.async = true;
      script.defer = true;
      
      // Add error handler
      script.onerror = (error) => {
        // Check if this might be due to ad blocker
        if (navigator.onLine) {
          errorMessage = 'Google Maps API failed to load. This may be due to an ad blocker or content blocker.';
        } else {
          errorMessage = 'Google Maps API failed to load. Please check your internet connection.';
        }
        
        // Still update UI to show error
        isLoading = false;
        reject(new Error('Google Maps failed to load'));
      };
      
      // Set timeout in case callback never fires
      const timeoutId = setTimeout(() => {
        if ((window as any)[callbackName]) {
          delete (window as any)[callbackName];
          errorMessage = 'Google Maps API load timeout. Please check your connection or try disabling ad blockers.';
          isLoading = false;
          reject(new Error('Google Maps API load timeout'));
        }
      }, 10000);
      
      document.head.appendChild(script);
    });
  }
  
  function initializeMap(mapElement: HTMLElement) {
    try {
      console.log('Initializing Google Maps...');
      console.log('Map container dimensions:', mapElement.getBoundingClientRect());
      
      // Ensure map container is properly positioned
      mapElement.style.position = 'absolute';
      mapElement.style.top = '0';
      mapElement.style.left = '0';
      mapElement.style.width = '100%';
      mapElement.style.height = '100%';
      
      // Create map with appropriate styling that matches the app's theme
      const mapOptions = {
        zoom: 3,
        center: { lat: 21.4225, lng: 39.8262 }, // Default to Kaaba
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        disableDefaultUI: true,
        zoomControl: true,
        mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID", // Используем Map ID из переменных окружения или демо-идентификатор
        styles: [
          {
            "featureType": "administrative",
            "elementType": "all",
            "stylers": [{ "visibility": "on" }, { "lightness": 33 }]
          },
          {
            "featureType": "landscape",
            "elementType": "all",
            "stylers": [{ "color": "#f2e5d4" }]
          },
          {
            "featureType": "poi.park",
            "elementType": "geometry",
            "stylers": [{ "color": "#c5dac6" }]
          },
          {
            "featureType": "poi",
            "elementType": "labels",
            "stylers": [{ "visibility": "on" }]
          },
          {
            "featureType": "road",
            "elementType": "all",
            "stylers": [{ "lightness": 20 }]
          },
          {
            "featureType": "road.highway",
            "elementType": "geometry",
            "stylers": [{ "color": "#c5c6c6" }]
          },
          {
            "featureType": "road.arterial",
            "elementType": "geometry",
            "stylers": [{ "color": "#e4d7c6" }]
          },
          {
            "featureType": "road.local",
            "elementType": "geometry",
            "stylers": [{ "color": "#fbfaf7" }]
          },
          {
            "featureType": "water",
            "elementType": "all",
            "stylers": [{ "visibility": "on" }, { "color": "#acbcc9" }]
          }
        ],
        gestureHandling: 'greedy' // Improve mobile handling
      };
      
      // Verify Google Maps API is loaded
      if (!window.google || !window.google.maps) {
        throw new Error('Google Maps API not loaded');
      }
      
      // Create map
      map = new google.maps.Map(mapElement, mapOptions);
      
      // Verify map was created successfully
      if (!map) {
        throw new Error('Failed to initialize Google Maps');
      }
      
      console.log('Google Maps initialized successfully');
      
      // Add passive event listeners to improve performance
      setupPassiveEventListeners(mapElement);
      
      // Make sure map re-renders correctly
      if (google.maps && 'event' in google.maps) {
        (google.maps as any).event.addListenerOnce(map, 'idle', () => {
          console.log('Google Maps idle event fired');
          // Force a resize event to ensure proper rendering
          if (google.maps && 'event' in google.maps) {
            (google.maps as any).event.trigger(map, 'resize');
          }
        });
      }
    } catch (e) {
      console.error('Error initializing Google Maps:', e);
      errorMessage = 'Failed to initialize Google Maps. Trying alternative map source...';
      
      // Fall back to OpenStreetMap
      useOpenStreetMap = true;
      loadLeaflet()
        .then(() => {
          initializeLeafletMap(mapElement);
          loadUserLocation();
        })
        .catch((fallbackError: Error) => {
          errorMessage = 'Failed to load any map services. Please try again later.';
          isLoading = false;
        });
    }
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
              if (useOpenStreetMap) {
                userLocation = { lat: location.latitude, lng: location.longitude } as any;
              } else {
                userLocation = new google.maps.LatLng(location.latitude, location.longitude);
              }
              
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
              
              // Пересчитываем расстояние
              distanceToKaaba = calculateDistanceToKaaba(location.latitude, location.longitude);
              
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
          
          if (useOpenStreetMap) {
            userLocation = { lat, lng } as any;
          } else {
            userLocation = new google.maps.LatLng(lat, lng);
          }
          
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
          
          // Пересчитываем расстояние
          distanceToKaaba = calculateDistanceToKaaba(lat, lng);
          
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
    
    if (useOpenStreetMap) {
      userLocation = { lat, lng } as any;
    } else {
      userLocation = new google.maps.LatLng(lat, lng);
    }
    
    // Проверяем, доступно ли направление устройства
    if (position.coords.heading !== null && position.coords.heading !== undefined) {
      currentHeading = position.coords.heading;
      console.log(`Device heading from geolocation: ${currentHeading}`);
    }
    
    // Рассчитываем направление на Киблу
    qiblaDirection = calculateQiblaDirection(lat, lng);
    
    // Рассчитываем расстояние до Каабы
    distanceToKaaba = calculateDistanceToKaaba(lat, lng);
    
    // Обновляем карту с местоположением и линией Киблы
    updateMapWithLocation();
    
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
      
      // Обновляем линию направления на карте если есть местоположение
      if (userLocation) {
        updateDeviceDirectionLine();
      }
    }
  }
  
  function updateDeviceDirectionLine() {
    if (!userLocation) return;
    
    if (useOpenStreetMap && leafletMap) {
      updateLeafletDeviceDirectionLine();
    } else if (map) {
      updateGoogleDeviceDirectionLine();
    }
  }
  
  function updateLeafletDeviceDirectionLine() {
    if (!leafletMap || !userLocation) return;
    
    // Calculate endpoint for the direction line
    // Увеличиваем длину линии для лучшей видимости
    const headingRad = (currentHeading * Math.PI) / 180;
    
    // Clear previous line
    if (leafletDeviceDirectionLine) {
      leafletMap.removeLayer(leafletDeviceDirectionLine);
    }
    
    // Calculate the endpoint coordinates (simple approximation)
    const R = 6378137; // Earth's radius in meters
    const distance = 2000; // Увеличиваем длину линии до 2 км для лучшей видимости
    
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
    
    // Улучшаем стиль линии направления
    leafletDeviceDirectionLine = L.polyline([
      userLatLng,
      endLatLng
    ], {
      color: '#FF5722',
      weight: 5,       // Делаем линию толще
      opacity: 0.9,    // Повышаем непрозрачность
      dashArray: '10, 5' // Делаем пунктир более заметным
    }).addTo(leafletMap);
    
    // Добавляем маркер конечной точки для лучшей видимости направления
    // Используем обычный маркер вместо divIcon для совместимости
    try {
      const directionMarker = L.circleMarker(endLatLng, {
        radius: 8,
        fillColor: '#FF5722',
        color: '#FFFFFF',
        weight: 2,
        opacity: 1,
        fillOpacity: 1
      }).addTo(leafletMap);
    } catch (e) {
      console.warn('Failed to add direction marker to Leaflet map', e);
    }
  }
  
  function updateGoogleDeviceDirectionLine() {
    if (!map || !userLocation) return;
    
    // Calculate endpoint for the direction line
    // Увеличиваем длину линии для лучшей видимости
    const headingRad = (currentHeading * Math.PI) / 180;
    
    // Remove previous line if exists
    if (deviceDirectionLine) {
      deviceDirectionLine.setMap(null);
    }
    
    // Calculate the endpoint coordinates (simple approximation)
    const R = 6378137; // Earth's radius in meters
    const distance = 2000; // Увеличиваем длину линии до 2 км для лучшей видимости
    
    // Ensure we're working with numbers for calculation
    const lat1 = Number(userLocation.lat()) * Math.PI / 180;
    const lon1 = Number(userLocation.lng()) * Math.PI / 180;
    
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance / R) +
                Math.cos(lat1) * Math.sin(distance / R) * Math.cos(headingRad));
                
    const lon2 = lon1 + Math.atan2(Math.sin(headingRad) * Math.sin(distance / R) * Math.cos(lat1),
                      Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2));
    
    // Convert back to degrees
    const endLat = lat2 * 180 / Math.PI;
    const endLng = lon2 * 180 / Math.PI;
    
    // Create endpoint coordinates
    const endPoint = new google.maps.LatLng(endLat, endLng);
    
    // Create a better visible line
    deviceDirectionLine = new google.maps.Polyline({
      path: [userLocation, endPoint],
      geodesic: true,
      strokeColor: '#FF5722', // Оранжевый цвет для линии направления
      strokeOpacity: 0.9,     // Повышаем непрозрачность
      strokeWeight: 5         // Делаем линию толще
    });
    
    // Apply the line to the map
    deviceDirectionLine.setMap(map);
    
    // Добавляем маркер в конце линии для обозначения направления
    try {
      // Check if advanced markers are available
      const hasAdvancedMarkers = hasGoogleMapsAdvancedMarkers();
      
      if (hasAdvancedMarkers) {
        // Use the new AdvancedMarkerElement
        new google.maps.marker.AdvancedMarkerElement({
          position: endPoint,
          map: map,
          title: 'End of Direction',
          content: document.createElement('div')
        });
      } else {
        // Fall back to legacy Marker if needed
        new google.maps.Marker({
          position: endPoint,
          map: map,
          title: 'End of Direction',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#FF5722',
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: '#FFFFFF'
          }
        });
      }
    } catch (e) {
      console.warn('Failed to add direction marker to Google Maps', e);
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
  
  function updateMapWithLocation() {
    if (!userLocation) return;
    
    if (useOpenStreetMap && leafletMap) {
      // OpenStreetMap/Leaflet implementation
      updateLeafletMap();
    } else if (map) {
      // Google Maps implementation
      updateGoogleMap();
    }
    
    // Обновляем линию направления если есть значение для heading
    if (currentHeading !== 0) {
      updateDeviceDirectionLine();
    }
  }
  
  function updateLeafletMap() {
    if (!leafletMap || !userLocation) return;
    
    // Center map on user location
    leafletMap.setView([userLocation.lat, userLocation.lng], 5);
    
    // Clear existing markers and lines
    leafletMap.eachLayer((layer: any) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline || (layer as any).options && (layer as any).options.radius) {
        leafletMap.removeLayer(layer);
      }
    });
    
    // Create marker for user location
    const userLatLng = [userLocation.lat, userLocation.lng] as any;
    const userMarker = L.circleMarker(userLatLng, {
      radius: 8,
      fillColor: '#4285F4',
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 1
    }).addTo(leafletMap);
    
    // Add user location popup
    userMarker.bindPopup('Your Location').openPopup();
    
    // Add accuracy circle if we have accuracy data
    if (locationAccuracy > 0) {
      try {
        const circle = (L as any).circle(userLatLng, {
          radius: locationAccuracy,
          fillColor: '#4285F4',
          color: '#4285F4',
          weight: 1,
          opacity: 0.4,
          fillOpacity: 0.1
        }).addTo(leafletMap);
      } catch (e) {
        console.warn('Failed to add accuracy circle to Leaflet map', e);
      }
    }
    
    // Create marker for Kaaba
    const kaabaLatLng = [21.4225, 39.8262] as any;
    const kaabaMarker = L.circleMarker(kaabaLatLng, {
      radius: 8,
      fillColor: '#4CAF50',
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 1
    }).addTo(leafletMap);
    
    // Add Kaaba popup
    kaabaMarker.bindPopup('Kaaba, Mecca');
    
    // Draw line from user location to Kaaba
    const qiblaPolyline = L.polyline([
      userLatLng,
      kaabaLatLng
    ], {
      color: '#00796B',
      weight: 3,
      opacity: 0.8
    }).addTo(leafletMap);
  }
  
  function updateGoogleMap() {
    if (!map || !userLocation) return;
    
    // Убедимся, что API Google Maps полностью загружен с необходимыми библиотеками
    if (!window.google || !window.google.maps) {
      console.error('Google Maps API not loaded when trying to update map');
      return;
    }
    
    // Center map on user location
    map.setCenter(userLocation);
    map.setZoom(5);
    
    // Remove previous accuracy circle if exists
    if (accuracyCircle) {
      accuracyCircle.setMap(null);
    }
    
    try {
      // Create the markerElement for user location
      const userMarkerElement = document.createElement('div');
      userMarkerElement.className = 'user-marker';
      userMarkerElement.innerHTML = `
        <div style="
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background-color: #4285F4;
          border: 2px solid white;
        "></div>
      `;
      
      // Check if advanced markers are available
      const hasAdvancedMarkers = hasGoogleMapsAdvancedMarkers();
      
      if (hasAdvancedMarkers) {
        // Use the new AdvancedMarkerElement
        new google.maps.marker.AdvancedMarkerElement({
          position: userLocation,
          map: map,
          title: 'Your Location',
          content: userMarkerElement
        });
      } else {
        // Fall back to legacy Marker if needed
        new google.maps.Marker({
          position: userLocation,
          map: map,
          title: 'Your Location',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#4285F4',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
          }
        });
      }
      
      // Add accuracy circle if we have accuracy data
      if (locationAccuracy > 0) {
        accuracyCircle = new (google.maps as any).Circle({
          center: userLocation,
          radius: locationAccuracy,
          map: map,
          fillColor: '#4285F4',
          fillOpacity: 0.1,
          strokeColor: '#4285F4',
          strokeOpacity: 0.4,
          strokeWeight: 1
        });
      }
      
      // Create marker for Kaaba
      const kaabaLocation = new google.maps.LatLng(21.4225, 39.8262);
      
      // Create the marker element for Kaaba
      const kaabaMarkerElement = document.createElement('div');
      kaabaMarkerElement.className = 'kaaba-marker';
      kaabaMarkerElement.innerHTML = `
        <div style="
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background-color: #4CAF50;
          border: 2px solid white;
        "></div>
      `;
      
      if (hasAdvancedMarkers) {
        // Use the new AdvancedMarkerElement
        new google.maps.marker.AdvancedMarkerElement({
          position: kaabaLocation,
          map: map,
          title: 'Kaaba, Mecca',
          content: kaabaMarkerElement
        });
      } else {
        // Fall back to legacy Marker if needed
        new google.maps.Marker({
          position: kaabaLocation,
          map: map,
          title: 'Kaaba, Mecca',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#4CAF50',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
          }
        });
      }
      
      // Remove previous line if exists
      if (qiblaLine) {
        qiblaLine.setMap(null);
      }
      
      // Draw line from user location to Kaaba
      qiblaLine = new google.maps.Polyline({
        path: [userLocation, kaabaLocation],
        geodesic: true,
        strokeColor: '#00796B',
        strokeOpacity: 0.8,
        strokeWeight: 3
      });
      
      qiblaLine.setMap(map);
    } catch (error) {
      console.error('Error updating Google Maps:', error);
    }
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
      // Create Leaflet map
      leafletMap = L.map(mapElement).setView([21.4225, 39.8262], 3);
      
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
  {:else}
    
    <div class="qibla-info">
      <div class="qibla-card">
        <h2>{t('qibla_title')}</h2>
        <div class="direction-value">{qiblaDirection.toFixed(1)}° {t('qibla_degrees')}</div>
        <div class="distance-value">{(distanceToKaaba / 1000).toFixed(0)} km</div>
        
        <div class="accuracy-info" class:low-accuracy={locationAccuracy > 100} class:medium-accuracy={locationAccuracy > 50 && locationAccuracy <= 100}>
          <span class="accuracy-icon">
            {#if locationAccuracy <= 50}
              <i class="material-icons">gps_fixed</i>
            {:else if locationAccuracy <= 100}
              <i class="material-icons">gps_not_fixed</i>
            {:else}
              <i class="material-icons">gps_off</i>
            {/if}
          </span>
          <span>{accuracyText}</span>
          
          {#if locationAccuracy > 100}
            <div class="accuracy-warning">
              {t('qibla_accuracy')}
            </div>
          {/if}
        </div>
        
        <div class="device-heading-info">
          <span class="device-icon">
            <i class="material-icons">navigation</i>
          </span>
          <span>{t('qibla_north')}</span>
        </div>
        
        <button class="calibrate-button" on:click={calibrateCompass}>
          {t('retry')}
        </button>
      </div>
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
  
  .ui-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2;
    pointer-events: none; /* Позволит кликать через оверлей на карту */
  }
  
  /* Делаем все интерактивные элементы доступными для нажатия */
  .location-note, .start-screen, .loading, .error, .qibla-info, .calibration-overlay {
    pointer-events: auto;
  }
  
  /* Добавляем полупрозрачный фон для всех блоков информации */
  .qibla-card, .location-note, .start-screen, .error {
    background: rgba(255, 248, 231, 0.8);
    backdrop-filter: blur(5px); /* Добавляем blur эффект для современных браузеров */
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  }
  
  .loading {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
    background-color: #000000;
    color: #ffffff;
    border-radius: 8px;
  }
  
  .spinner {
    width: 50px;
    height: 50px;
    border: 5px solid rgba(0, 0, 0, 0.1);
    border-top-color: #00796B;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 20px;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .error {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
    padding: 20px;
    text-align: center;
  }
  
  .error button {
    margin-top: 20px;
    padding: 10px 20px;
    background-color: #00796B;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
  }
  
  .qibla-info {
    position: absolute;
    bottom: 20px;
    right: 20px;
    z-index: 100;
  }
  
  .qibla-card {
    padding: 16px;
    max-width: 300px;
    text-align: center;
  }
  
  .qibla-card h2 {
    margin-top: 0;
    color: #00796B;
    font-size: 20px;
  }
  
  .direction-value {
    font-size: 24px;
    font-weight: bold;
    margin: 8px 0;
  }
  
  .distance-value {
    font-size: 16px;
    margin-bottom: 16px;
    color: #555;
  }
  
  .accuracy-info {
    font-size: 14px;
    margin-bottom: 16px;
    padding: 8px;
    border-radius: 4px;
    background-color: rgba(255, 255, 255, 0.5);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
  }
  
  .accuracy-icon {
    margin-right: 8px;
    font-size: 16px;
  }
  
  .low-accuracy {
    background-color: rgba(255, 235, 235, 0.8);
    border-left: 3px solid #ff5252;
  }
  
  .medium-accuracy {
    background-color: rgba(255, 243, 224, 0.8);
    border-left: 3px solid #ff9800;
  }
  
  .accuracy-warning {
    width: 100%;
    margin-top: 4px;
    font-size: 12px;
    color: #d32f2f;
    font-weight: bold;
  }
  
  .device-heading-info {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    margin-bottom: 16px;
    background-color: rgba(255, 87, 34, 0.2);
    border-radius: 4px;
    border-left: 3px solid #FF5722;
    font-size: 14px;
  }
  
  .device-icon {
    margin-right: 8px;
  }
  
  .calibrate-button {
    background-color: #00796B;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 16px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.3s;
  }
  
  .calibrate-button:hover {
    background-color: #005b4f;
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
    background-color: white;
    padding: 20px;
    border-radius: 8px;
    text-align: center;
    max-width: 80%;
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
    border: 3px solid #00796B;
    box-sizing: border-box;
  }
  
  .figure-eight::before {
    left: 0;
  }
  
  .figure-eight::after {
    right: 0;
  }
  
  /* Responsive styling */
  @media (max-width: 768px) {
    .qibla-card {
      max-width: 250px;
    }
  }
  
  .start-screen {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
    text-align: center;
    padding: 20px;
  }
  
  .start-screen h1 {
    color: #00796B;
    margin-bottom: 16px;
  }
  
  .start-screen p {
    margin-bottom: 32px;
    color: #555;
    font-size: 18px;
  }
  
  .start-button {
    background-color: #00796B;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 12px 24px;
    font-size: 18px;
    cursor: pointer;
    transition: background-color 0.3s;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  }
  
  .start-button:hover {
    background-color: #005b4f;
  }
  
  .location-note {
    position: absolute;
    top: 20px;
    left: 20px;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 14px;
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .note-icon {
    font-size: 16px;
  }
  
  .note-text {
    color: #555;
  }
</style>