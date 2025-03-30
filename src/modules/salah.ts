/**
 * Module for managing Salah (prayer) times and related functionality.
 */

import { browser } from '$app/environment';
import { writable, get } from 'svelte/store';
import { calculatePrayerTimes, getHijriDateSync, determineCalculationMethod, CALCULATION_METHODS, ASR_METHODS } from './prayerCalculation';

// Simple toast interface for notifications
interface ToastOptions {
  theme?: Record<string, string>;
  [key: string]: any;
}

interface ToastInterface {
  push(message: string, options?: ToastOptions): void;
}

// Default toast implementation (console fallback)
const defaultToast: ToastInterface = {
  push: (message: string) => {
    console.log('[Toast]', message);
  }
};

// Create a store for the toast functionality
const toastStore = writable<ToastInterface>(defaultToast);

// Initialize toast in browser environment
if (browser) {
  // This is a side effect, not a module import
  const script = document.createElement('script');
  script.onload = () => {
    // Once loaded, update the toast store
    if (window && (window as any).toast) {
      toastStore.set((window as any).toast);
    }
  };
  script.src = '/toast-shim.js'; // A small shim that would expose the toast API
  document.head.appendChild(script);
}

// Helper function to use toast
function showToast(message: string, options?: ToastOptions): void {
  get(toastStore).push(message, options);
}

// Stores for reactive state
export const prayerTimesStore = writable<PrayerTimes | null>(null);
export const hijriDateStore = writable<string | null>(null);
export const locationStore = writable<Location | null>(null);

// Set default prayer settings
export const defaultPrayerSettings = {
  method: 'MOONSIGHTING_COMMITTEE',
  asrMethod: ASR_METHODS.STANDARD,
  useAutoDetect: true,
  adjustments: {
    fajr: 0,
    dhuhr: 0,
    asr: 0,
    maghrib: 0,
    isha: 0
  }
};

// Store for prayer settings
export const prayerSettingsStore = writable(defaultPrayerSettings);

// Types
export type PrayerTimes = {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  midnight: string;
};

export type Location = {
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
  timezone?: number;
};

export type PrayerSettings = {
  method: string;
  asrMethod: string;
  useAutoDetect: boolean;
  adjustments: {
    fajr: number;
    dhuhr: number;
    asr: number;
    maghrib: number;
    isha: number;
  };
};

// Load saved settings
export function loadSavedSettings(): PrayerSettings {
  if (!browser) return defaultPrayerSettings;
  
  try {
    const savedSettings = localStorage.getItem('prayerSettings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      prayerSettingsStore.set(settings);
      return settings;
    }
  } catch (error) {
    console.error('Error loading prayer settings:', error);
  }
  
  return defaultPrayerSettings;
}

// Save settings
export function savePrayerSettings(settings: PrayerSettings) {
  if (!browser) return;
  
  try {
    localStorage.setItem('prayerSettings', JSON.stringify(settings));
    prayerSettingsStore.set(settings);
    
    // Refresh prayer times with new settings
    const location = get(locationStore);
    if (location) {
      calculatePrayerTimesWithSettings(location.latitude, location.longitude, settings);
    }
    
    showToast('Prayer settings saved', {
      theme: {
        '--toastBackground': '#48BB78',
        '--toastBarBackground': '#2F855A'
      }
    });
  } catch (error) {
    console.error('Error saving prayer settings:', error);
    showToast('Failed to save settings', {
      theme: {
        '--toastBackground': '#F56565',
        '--toastBarBackground': '#C53030'
      }
    });
  }
}

// Get current location
export async function getCurrentLocation(): Promise<Location | null> {
  return new Promise((resolve) => {
    if (!browser || !navigator.geolocation) {
      console.error('Geolocation not supported by browser');
      showToast('Geolocation is not supported by your browser', {
        theme: {
          '--toastBackground': '#F56565',
          '--toastBarBackground': '#C53030'
        }
      });
      resolve(null);
      return;
    }

    console.log('Requesting geolocation...');
    
    // First get IP-based location to compare with browser geolocation
    const getIpLocation = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        
        if (data && data.latitude && data.longitude) {
          return {
            latitude: data.latitude,
            longitude: data.longitude,
            city: data.city || 'Unknown',
            country: data.country_name || 'Unknown'
          };
        }
      } catch (error) {
        console.error('Error getting IP-based location:', error);
      }
      return null;
    };
    
    // Calculate distance between two points in km using Haversine formula
    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371; // Radius of the earth in km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c; // Distance in km
    };
    
    // Get browser-reported location and compare with IP location
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        console.log('Geolocation success:', latitude, longitude);
        
        // Get IP-based location for comparison
        const ipLocation = await getIpLocation();
        
        let useIpLocation = false;
        
        if (ipLocation) {
          // Calculate distance between browser geolocation and IP location
          const distance = calculateDistance(
            latitude, 
            longitude, 
            ipLocation.latitude, 
            ipLocation.longitude
          );
          
          console.log(`Distance between browser location and IP location: ${distance.toFixed(2)}km`);
          
          // If the distance is greater than 100km, use IP location instead
          if (distance > 100) {
            console.warn('Browser reported location is significantly different from IP-based location. Using IP location instead.');
            
            // Create location object from IP data
            const location: Location = {
              latitude: ipLocation.latitude,
              longitude: ipLocation.longitude,
              timezone: -new Date().getTimezoneOffset() / 60,
              city: ipLocation.city || 'Unknown',
              country: ipLocation.country || 'Unknown'
            };
            
            // Show warning to user
            showToast('Your browser reported a location that appears to be incorrect. Using IP-based location instead.', {
              theme: {
                '--toastBackground': '#F56565',
                '--toastBarBackground': '#C53030'
              }
            });
            
            locationStore.set(location);
            
            // Save to localStorage
            if (browser) {
              localStorage.setItem('lastKnownLocation', JSON.stringify(location));
              console.log('Saved IP-based location to localStorage');
            }
            
            resolve(location);
            return;
          }
        }
        
        try {
          // Get timezone
          const timezone = -new Date().getTimezoneOffset() / 60;
          console.log('Timezone offset in hours:', timezone);
          
          // Create location object
          const location: Location = {
            latitude,
            longitude,
            timezone
          };
          
          // Try to get city and country
          try {
            console.log('Fetching location details from OpenStreetMap...');
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`
            );
            const data = await response.json();
            
            if (data && data.address) {
              location.city = data.address.city || data.address.town || data.address.village || data.address.county || 'Unknown';
              location.country = data.address.country || 'Unknown';
              console.log('Location details:', location.city, location.country);
            }
          } catch (error) {
            console.error('Error fetching location details:', error);
            location.city = 'Unknown';
            location.country = 'Unknown';
          }
          
          console.log('Setting location store with:', location);
          locationStore.set(location);
          
          // Save to localStorage
          if (browser) {
            localStorage.setItem('lastKnownLocation', JSON.stringify(location));
            console.log('Saved location to localStorage');
          }
          
          resolve(location);
        } catch (error) {
          console.error('Error getting location:', error);
          showToast('Failed to get location details', {
            theme: {
              '--toastBackground': '#F56565',
              '--toastBarBackground': '#C53030'
            }
          });
          resolve(null);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        let message = 'Failed to get your location';
        
        if (error.code === 1) {
          message = 'Location access denied. Please enable location services.';
        } else if (error.code === 2) {
          message = 'Location unavailable. Please try again.';
        } else if (error.code === 3) {
          message = 'Location request timed out. Please try again.';
        }
        
        showToast(message, {
          theme: {
            '--toastBackground': '#F56565',
            '--toastBarBackground': '#C53030'
          }
        });
        
        // Try to load last known location from localStorage
        if (browser) {
          try {
            const savedLocation = localStorage.getItem('lastKnownLocation');
            if (savedLocation) {
              const location = JSON.parse(savedLocation);
              console.log('Using saved location from localStorage:', location);
              locationStore.set(location);
              resolve(location);
              return;
            }
          } catch (e) {
            console.error('Error loading saved location:', e);
          }
        }
        
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// Calculate prayer times with settings
export async function calculatePrayerTimesWithSettings(
  latitude: number, 
  longitude: number, 
  settings: PrayerSettings
): Promise<{ prayerTimes: PrayerTimes; hijriDate: string; location: Location }> {
  try {
    // Get timezone offset in hours
    const timezoneOffset = -new Date().getTimezoneOffset() / 60;
    console.log('Current timezone offset:', timezoneOffset);
    console.log('Using calculation method:', settings.method);
    console.log('Using Asr method:', settings.asrMethod);
    
    // Calculate prayer times using Adhan library via our prayerCalculation module
    const prayerTimes = calculatePrayerTimes(
      new Date(),
      latitude,
      longitude,
      timezoneOffset,
      settings.method,
      settings.asrMethod
    );
    
    // Import the needed function
    const { getHijriDate, getHijriDateSync } = await import('./prayerCalculation');
    
    // Get current date
    const currentDate = new Date();
    
    // Get Hijri date - try async first with fallback to sync
    let hijriDate;
    try {
      console.log('Getting Hijri date from API...');
      hijriDate = await getHijriDate(currentDate);
      console.log('Got Hijri date from API:', hijriDate);
    } catch (error) {
      console.error('Error getting Hijri date from API, using sync fallback:', error);
      hijriDate = getHijriDateSync(currentDate);
      console.log('Got Hijri date from sync calculation:', hijriDate);
    }
    
    // Get current location from store to preserve city/country info
    const currentLocation = get(locationStore);
    
    // Create location object - preserve city/country if available
    const location: Location = {
      latitude,
      longitude,
      timezone: timezoneOffset,
      city: currentLocation?.city || 'Unknown',
      country: currentLocation?.country || 'Unknown'
    };
    
    // If we don't have city/country info, try to fetch it
    if ((!location.city || location.city === 'Unknown' || 
         !location.country || location.country === 'Unknown') && browser) {
      try {
        console.log('Fetching location details from OpenStreetMap...');
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`
        );
        const data = await response.json();
        
        if (data && data.address) {
          location.city = data.address.city || data.address.town || data.address.village || data.address.county || 'Unknown';
          location.country = data.address.country || 'Unknown';
          console.log('Location details:', location.city, location.country);
        }
      } catch (error) {
        console.error('Error fetching location details:', error);
      }
    }
    
    // Store the results
    prayerTimesStore.set(prayerTimes);
    hijriDateStore.set(hijriDate);
    locationStore.set(location);
    
    // Return the results
    return { prayerTimes, hijriDate, location };
  } catch (error) {
    console.error('Error calculating prayer times:', error);
    
    showToast('Failed to calculate prayer times', {
      theme: {
        '--toastBackground': '#F56565',
        '--toastBarBackground': '#C53030'
      }
    });
    
    throw error;
  }
}

// Initialize prayer times
export async function initializePrayerTimes(): Promise<void> {
  try {
    // Load saved settings
    const settings = loadSavedSettings();
    
    // First try to get location from store
    let location = get(locationStore);
    console.log("Location from store:", location);
    
    // Utility functions for location validation
    const getIpLocation = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        
        if (data && data.latitude && data.longitude) {
          return {
            latitude: data.latitude,
            longitude: data.longitude,
            city: data.city || 'Unknown',
            country: data.country_name || 'Unknown'
          };
        }
      } catch (error) {
        console.error('Error getting IP-based location:', error);
      }
      return null;
    };
    
    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371; // Radius of the earth in km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c; // Distance in km
    };

    // Validate stored location if it exists
    if (location) {
      // Get IP location for comparison
      const ipLocation = await getIpLocation();
      
      if (ipLocation) {
        const distance = calculateDistance(
          location.latitude, 
          location.longitude, 
          ipLocation.latitude, 
          ipLocation.longitude
        );
        
        console.log(`Distance between stored location and IP location: ${distance.toFixed(2)}km`);
        
        // If distance is large (> 100km), use IP location instead
        if (distance > 100) {
          console.warn('Stored location is significantly different from IP location. Using IP location instead.');
          
          // Create new location object
          location = {
            latitude: ipLocation.latitude,
            longitude: ipLocation.longitude,
            timezone: -new Date().getTimezoneOffset() / 60,
            city: ipLocation.city || 'Unknown',
            country: ipLocation.country || 'Unknown'
          };
          
          showToast('Your saved location appears to be incorrect. Using IP-based location instead.', {
            theme: {
              '--toastBackground': '#F56565',
              '--toastBarBackground': '#C53030'
            }
          });
          
          // Update the store
          locationStore.set(location);
        }
      }
    }
    
    if (!location) {
      console.log("No location in store, checking localStorage");
      // Try to get location from localStorage
      try {
        const savedLocation = localStorage.getItem('lastKnownLocation');
        
        if (savedLocation) {
          const parsedLocation = JSON.parse(savedLocation);
          
          // Validate saved location against IP
          const ipLocation = await getIpLocation();
          
          if (ipLocation) {
            const distance = calculateDistance(
              parsedLocation.latitude,
              parsedLocation.longitude,
              ipLocation.latitude,
              ipLocation.longitude
            );
            
            console.log(`Distance between localStorage location and IP location: ${distance.toFixed(2)}km`);
            
            if (distance > 100) {
              console.warn('Location in localStorage is significantly different from IP location.');
              
              // Use IP location instead
              location = {
                latitude: ipLocation.latitude,
                longitude: ipLocation.longitude,
                timezone: -new Date().getTimezoneOffset() / 60,
                city: ipLocation.city || 'Unknown',
                country: ipLocation.country || 'Unknown'
              };
              
              showToast('Your saved location appears to be incorrect. Using IP-based location instead.', {
                theme: {
                  '--toastBackground': '#F56565',
                  '--toastBarBackground': '#C53030'
                }
              });
              
              // Update the store
              locationStore.set(location);
            } else {
              location = parsedLocation;
              console.log("Found valid location in localStorage:", location);
              // Update the store
              locationStore.set(location);
            }
          } else {
            // If can't get IP location, use saved location
            location = parsedLocation;
            console.log("Found location in localStorage (couldn't validate with IP):", location);
            // Update the store
            locationStore.set(location);
          }
        } else {
          console.log("No saved location in localStorage");
        }
      } catch (e) {
        console.error('Error parsing saved location:', e);
      }
      
      // If still no location, get current
      if (!location) {
        console.log("Getting current location via geolocation API");
        location = await getCurrentLocation();
        
        // If still no location, use default
        if (!location) {
          console.log("Using default location (Mecca)");
          // Use default location (Mecca)
          location = {
            latitude: 21.3891,
            longitude: 39.8579,
            city: 'Mecca',
            country: 'Saudi Arabia',
            timezone: 3
          };
          // Update the store
          locationStore.set(location);
        }
      }
    }
    
    console.log("Final location being used:", location);
    
    // Determine calculation method if auto detect is enabled
    if (settings.useAutoDetect && location) {
      settings.method = determineCalculationMethod(location.latitude, location.longitude);
      console.log("Auto detected calculation method:", settings.method);
    }
    
    // Make sure we save location to store
    if (location) {
      locationStore.set(location);
      
      // Calculate prayer times - location is guaranteed to be non-null here
      await calculatePrayerTimesWithSettings(location.latitude, location.longitude, settings);
      
      // Save location to localStorage
      if (browser) {
        localStorage.setItem('lastKnownLocation', JSON.stringify(location));
        console.log("Saved location to localStorage:", location);
      }
    }
  } catch (error) {
    console.error('Error initializing prayer times:', error);
    
    showToast('Failed to initialize prayer times', {
      theme: {
        '--toastBackground': '#F56565',
        '--toastBarBackground': '#C53030'
      }
    });
  }
}

// Refresh prayer times
export async function refreshPrayerTimes(): Promise<void> {
  try {
    // Get location
    let location = get(locationStore);
    
    // Utility functions for location validation
    const getIpLocation = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        
        if (data && data.latitude && data.longitude) {
          return {
            latitude: data.latitude,
            longitude: data.longitude,
            city: data.city || 'Unknown',
            country: data.country_name || 'Unknown'
          };
        }
      } catch (error) {
        console.error('Error getting IP-based location:', error);
      }
      return null;
    };
    
    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371; // Radius of the earth in km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c; // Distance in km
    };
    
    // First, try to get a fresh location
    location = await getCurrentLocation();
    
    // If that fails, try to use stored location with validation
    if (!location) {
      const storedLocation = get(locationStore);
      
      if (storedLocation) {
        // Validate against IP location
        const ipLocation = await getIpLocation();
        
        if (ipLocation) {
          const distance = calculateDistance(
            storedLocation.latitude,
            storedLocation.longitude,
            ipLocation.latitude,
            ipLocation.longitude
          );
          
          console.log(`Distance between stored location and IP location during refresh: ${distance.toFixed(2)}km`);
          
          if (distance > 100) {
            console.warn('Stored location is significantly different from IP location during refresh.');
            
            // Use IP location instead
            location = {
              latitude: ipLocation.latitude,
              longitude: ipLocation.longitude,
              timezone: -new Date().getTimezoneOffset() / 60,
              city: ipLocation.city || 'Unknown',
              country: ipLocation.country || 'Unknown'
            };
            
            showToast('Your location appears to be incorrect. Using IP-based location instead.', {
              theme: {
                '--toastBackground': '#F56565',
                '--toastBarBackground': '#C53030'
              }
            });
            
            // Update the store and localStorage
            locationStore.set(location);
            if (browser) {
              localStorage.setItem('lastKnownLocation', JSON.stringify(location));
            }
          } else {
            location = storedLocation;
          }
        } else {
          // If IP check fails, use stored location
          location = storedLocation;
        }
      } else {
        // Try to get location from localStorage as last resort
        try {
          const savedLocation = localStorage.getItem('lastKnownLocation');
          
          if (savedLocation) {
            location = JSON.parse(savedLocation);
            locationStore.set(location);
          }
        } catch (e) {
          console.error('Error parsing saved location during refresh:', e);
        }
      }
      
      // If still no location, use default
      if (!location) {
        // Use default location (Mecca)
        location = {
          latitude: 21.3891,
          longitude: 39.8579,
          city: 'Mecca',
          country: 'Saudi Arabia',
          timezone: 3
        };
        locationStore.set(location);
      }
    }
    
    // Get settings
    const settings = get(prayerSettingsStore);
    
    // Calculate prayer times - now location is guaranteed to be non-null
    await calculatePrayerTimesWithSettings(location.latitude, location.longitude, settings);
    
    // Force refresh of Hijri date to ensure it's up-to-date
    // First clear any cached value to ensure fresh calculation
    if (browser) {
      try {
        // Get the most current date
        const currentDate = new Date();
        
        // Format date string for cache key in same format as used in prayerCalculation.ts
        const formattedDate = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}`;
        
        // Clear this date from cache in localStorage if exists
        const hijriCacheJson = localStorage.getItem('hijri_date_cache');
        if (hijriCacheJson) {
          try {
            const hijriCache = JSON.parse(hijriCacheJson);
            // If this date exists in cache, remove it
            if (hijriCache[formattedDate]) {
              delete hijriCache[formattedDate];
              localStorage.setItem('hijri_date_cache', JSON.stringify(hijriCache));
              console.log('Cleared cached Hijri date for today to force refresh');
            }
          } catch (e) {
            console.error('Error manipulating Hijri date cache:', e);
          }
        }
        
        // Import needed function
        const { getHijriDate, getHijriDateSync } = await import('./prayerCalculation');
        
        // Get fresh Hijri date - try async first with fallback to sync
        let freshHijriDate;
        try {
          freshHijriDate = await getHijriDate(currentDate);
        } catch (e) {
          console.warn('Async Hijri date calculation failed, using sync fallback:', e);
          freshHijriDate = getHijriDateSync(currentDate);
        }
        
        console.log('Fresh Hijri date calculated:', freshHijriDate);
        hijriDateStore.set(freshHijriDate);
      } catch (error) {
        console.error('Error refreshing Hijri date:', error);
      }
    }
    
    showToast('Prayer times updated', {
      theme: {
        '--toastBackground': '#48BB78',
        '--toastBarBackground': '#2F855A'
      }
    });
  } catch (error) {
    console.error('Error refreshing prayer times:', error);
    
    showToast('Failed to refresh prayer times', {
      theme: {
        '--toastBackground': '#F56565',
        '--toastBarBackground': '#C53030'
      }
    });
  }
}