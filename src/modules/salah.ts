/**
 * Module for managing Salah (prayer) times and related functionality.
 */

import { browser } from '$app/environment';
import { writable, get } from 'svelte/store';
import { calculatePrayerTimes, getHijriDateSync, determineCalculationMethod, CALCULATION_METHODS, ASR_METHODS } from './prayerCalculation';
import { accentColor, gradientColor } from '$lib/stores/accentColor';

// Simple toast interface for notifications
interface ToastOptions {
  theme?: Record<string, string>;
  [key: string]: any;
}

interface ToastInterface {
  push(message: string, options?: ToastOptions): void;
}

// Default toast implementation (DOM-based)
const defaultToast: ToastInterface = {
  push: (message: string, options?: ToastOptions) => {
    if (!browser) return;
    
    try {
      const toast = document.createElement('div');
      toast.className = 'toast';
      if (options?.theme?.['--toastBackground'] === '#F56565') {
        toast.classList.add('error');
      }
      toast.textContent = message;
      document.body.appendChild(toast);
      
      // Remove after 3 seconds
      setTimeout(() => {
        toast.remove();
      }, 3000);
    } catch (e) {
      console.error('Error showing toast:', e);
    }
  }
};

// Create a store for the toast functionality
const toastStore = writable<ToastInterface>(defaultToast);

// Helper function to use toast
function showToast(message: string, options?: ToastOptions): void {
  get(toastStore).push(message, options);
}

// Stores for reactive state
export const prayerTimesStore = writable<PrayerTimes | null>(null);
export const hijriDateStore = writable<string | null>(null);
export const locationStore = writable<Location | null>(null);

// Subscribe to prayer times changes to update colors
if (browser) {
  console.log('Setting up prayer times subscription in salah.ts module');
  prayerTimesStore.subscribe(value => {
    console.log('Prayer times store updated:', value ? 'has values' : 'null');
    if (value) {
      console.log('Calling updateColorsBasedOnPrayerTimes from store subscriber');
      updateColorsBasedOnPrayerTimes(value);
    }
  });
}

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
  tahajjud?: string;
  witr?: string;
  duha?: string;
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
export const getCurrentLocation = async (): Promise<Location | null> => {
  // Add mobile browser detection
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  console.log('Browser type:', isMobile ? 'Mobile' : 'Desktop');
  
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.log('Geolocation not supported by browser');
      resolve(null);
      return;
    }

    // Set a timeout for mobile browsers
    const timeout = isMobile ? 10000 : 5000; // 10 seconds for mobile, 5 for desktop
    
    const options = {
      enableHighAccuracy: true,
      timeout: timeout,
      maximumAge: 0
    };

    console.log('Requesting geolocation with options:', options);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('Geolocation success:', position);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          city: 'Unknown',
          country: 'Unknown',
          timezone: -new Date().getTimezoneOffset() / 60
        });
      },
      (error) => {
        console.error('Geolocation error:', error);
        // Try to get more specific error information
        let errorMessage = 'Unknown error';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Permission denied';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Position unavailable';
            break;
          case error.TIMEOUT:
            errorMessage = 'Request timed out';
            break;
          default:
            errorMessage = error.message;
        }
        console.error('Geolocation error details:', errorMessage);
        resolve(null);
      },
      options
    );
  });
};

// Function to update accent and gradient colors based on prayer times
export function updateColorsBasedOnPrayerTimes(prayerTimes: PrayerTimes) {
  if (!browser || !prayerTimes) {
    console.warn('Cannot update colors: browser not available or prayer times missing');
    return;
  }
  
  // Determine current prayer based on time
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  console.log(`Current time: ${now.getHours()}:${now.getMinutes()} (${currentTime} minutes)`);
  
  // Convert time string to minutes
  const timeToMinutes = (timeStr: string) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };
  
  // Define prayer order
  const prayers = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  
  // Log all prayer times for debugging
  console.log('Prayer times available:', Object.entries(prayerTimes)
    .map(([prayer, time]) => `${prayer}: ${time} (${timeToMinutes(time)} minutes)`)
    .join(', '));
  
  // Store current prayer
  let currentPrayer = 'fajr'; // Default
  
  // Find current prayer
  for (let i = 0; i < prayers.length; i++) {
    const prayer = prayers[i];
    const prayerTimeStr = prayerTimes[prayer as keyof typeof prayerTimes];
    if (!prayerTimeStr) continue;
    const prayerTime = timeToMinutes(prayerTimeStr);
    
    if (currentTime < prayerTime) {
      // If we're before this prayer, the previous one is current
      currentPrayer = i === 0 ? prayers[prayers.length - 1] : prayers[i - 1];
      console.log(`Current prayer is ${currentPrayer} because current time (${currentTime}) is before ${prayer} (${prayerTime})`);
      break;
    }
  }
  
  // Prayer color mapping
  const prayerColors = {
    fajr: '#fdbb2d', // Using last color from gradient
    sunrise: '#ffb01f',
    dhuhr: '#0072ff',
    asr: '#ef473a',
    maghrib: '#b42460',
    isha: '#2c5364',
    tahajjud: '#7a0270',
    witr: '#182848',
    duha: '#ffb01f'
  };

  const prayerGradients = {
    fajr: 'linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d)',
    sunrise: 'linear-gradient(135deg, #FF9500, #ff2d00, #ffb01f)',
    dhuhr: 'linear-gradient(135deg, #8ae068, #0072ff)',
    asr: 'linear-gradient(135deg, #dda65e, #ef473a)',
    maghrib: 'linear-gradient(135deg, #ef473a, #b42460)',
    isha: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
    tahajjud: 'linear-gradient(135deg, #0b122b, #3f0c41, #7a0270)',
    witr: 'linear-gradient(135deg, #2C3E50, #4B6CB7, #182848)',
    duha: 'linear-gradient(135deg, #FF9500, #ff2d00, #ffb01f)'
  };
  
  // Get color for current prayer (with fallback)
  const color = prayerColors[currentPrayer as keyof typeof prayerColors] || prayerColors.fajr;
  const gradient = prayerGradients[currentPrayer as keyof typeof prayerGradients] || prayerGradients.fajr;
  
  // Update DOM directly for immediate effect
  document.documentElement.style.setProperty('--accent-color', color);
  document.documentElement.style.setProperty('--gradient-color', gradient);
  
  // Update stores
  accentColor.set(color);
  gradientColor.set(gradient);
  
  console.log(`Updated accent color to ${color} and gradient to ${gradient} for prayer: ${currentPrayer}`);
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
    
    // Extended prayers calculation is causing issues in prayer lists
    // These should be calculated only when specifically needed
    const extendedPrayers = {
      ...prayerTimes,
      // Commenting out extended prayers to fix prayer list ordering
      // tahajjud: calculateTahajjudTime(prayerTimes.isha, prayerTimes.fajr),
      // witr: calculateWitrTime(prayerTimes.isha, prayerTimes.fajr),
      // duha: calculateDuhaTime(prayerTimes.sunrise, prayerTimes.dhuhr)
    };
    
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
    prayerTimesStore.set(extendedPrayers);
    hijriDateStore.set(hijriDate);
    locationStore.set(location);
    
    // Update colors based on calculated prayer times
    updateColorsBasedOnPrayerTimes(extendedPrayers);
    
    // Return the results
    return { prayerTimes: extendedPrayers, hijriDate, location };
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
    // Add mobile browser detection
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    // Check specifically for Safari/WebKit
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) || 
                    /AppleWebKit/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    
    console.log('Browser type:', isMobile ? 'Mobile' : 'Desktop');
    console.log('Is Safari/WebKit:', isSafari);
    console.log('User agent:', navigator.userAgent);
    
    // Load saved settings
    const settings = loadSavedSettings();
    console.log('Loaded settings:', settings);
    
    // First try to get location from store
    let location = get(locationStore);
    console.log("Location from store:", location);
    
    // Utility function for IP-based location
    const getIpLocation = async (): Promise<Location | null> => {
      try {
        console.log('Attempting to get IP-based location...');
        
        // Safari sometimes has issues with some APIs, so try multiple services with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        try {
          const response = await fetch('https://ipapi.co/json/', {
            signal: controller.signal,
            mode: 'cors',
            headers: {
              'Accept': 'application/json'
            }
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const data = await response.json();
          console.log('IP location response:', data);
          
          if (data && data.latitude && data.longitude) {
            return {
              latitude: data.latitude,
              longitude: data.longitude,
              city: data.city || 'Unknown',
              country: data.country_name || 'Unknown',
              timezone: -new Date().getTimezoneOffset() / 60
            };
          }
        } catch (error) {
          console.error('Error getting IP-based location:', error);
          // Try alternative IP service as fallback
          try {
            console.log('Trying alternative IP service...');
            const altResponse = await fetch('https://ip-api.com/json/', {
              mode: 'cors',
              headers: {
                'Accept': 'application/json'
              }
            });
            if (!altResponse.ok) {
              throw new Error(`HTTP error! status: ${altResponse.status}`);
            }
            const altData = await altResponse.json();
            console.log('Alternative IP location response:', altData);
            
            if (altData && altData.lat && altData.lon) {
              return {
                latitude: altData.lat,
                longitude: altData.lon,
                city: altData.city || 'Unknown',
                country: altData.country || 'Unknown',
                timezone: -new Date().getTimezoneOffset() / 60
              };
            }
          } catch (altError) {
            console.error('Error getting alternative IP location:', altError);
            
            // Last resort - try geolocation API directly if both IP services fail
            // This is especially important for Safari where IP services might be blocked
            if (navigator.geolocation) {
              try {
                console.log('Trying direct geolocation API as last resort');
                const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                  navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                  });
                });
                
                return {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  city: 'Unknown',
                  country: 'Unknown',
                  timezone: -new Date().getTimezoneOffset() / 60
                };
              } catch (geoError) {
                console.error('Direct geolocation failed too:', geoError);
              }
            }
          }
        }
      } catch (e) {
        console.error('Error in getIpLocation:', e);
      }
      return null;
    };
    
    // If no location in store, try to get it
    if (!location) {
      console.log("No location in store, attempting to get location...");
      
      // For mobile browsers, try IP location first as it's more reliable
      if (isMobile) {
        console.log("Mobile browser detected, trying IP location first...");
        location = await getIpLocation();
      }
      
      // If IP location failed or not mobile, try browser geolocation
      if (!location) {
        console.log("IP location failed or not mobile, trying browser geolocation...");
        location = await getCurrentLocation();
      }
      
      // If both failed, try to get from localStorage
      if (!location) {
        console.log("Both location methods failed, trying localStorage...");
        try {
          const savedLocation = localStorage.getItem('lastKnownLocation');
          if (savedLocation) {
            location = JSON.parse(savedLocation);
            console.log("Found location in localStorage:", location);
          }
        } catch (e) {
          console.error('Error parsing saved location:', e);
        }
      }
      
      // If still no location, use default
      if (!location) {
        console.log("Using default location (Mecca)");
        location = {
          latitude: 21.3891,
          longitude: 39.8579,
          city: 'Mecca',
          country: 'Saudi Arabia',
          timezone: 3
        };
      }
      
      // Update the store
      if (location) {
        locationStore.set(location);
        // Save to localStorage
        if (browser) {
          try {
            localStorage.setItem('lastKnownLocation', JSON.stringify(location));
            console.log("Saved location to localStorage:", location);
          } catch (e) {
            console.error('Error saving to localStorage:', e);
          }
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
    const { prayerTimes } = await calculatePrayerTimesWithSettings(location.latitude, location.longitude, settings);
    
    // Ensure colors are updated
    updateColorsBasedOnPrayerTimes(prayerTimes);
    
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

// Helper functions for extended prayers
function calculateTahajjudTime(isha: string, fajr: string): string {
  const ishaTime = new Date(`1970-01-01T${isha}`);
  const fajrTime = new Date(`1970-01-01T${fajr}`);
  
  // Tahajjud is recommended in the last third of the night
  const nightDuration = fajrTime.getTime() - ishaTime.getTime();
  const tahajjudTime = new Date(ishaTime.getTime() + (nightDuration * 2/3));
  
  return tahajjudTime.toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
}

function calculateWitrTime(isha: string, fajr: string): string {
  const ishaTime = new Date(`1970-01-01T${isha}`);
  const fajrTime = new Date(`1970-01-01T${fajr}`);
  
  // Witr is recommended after Tahajjud or in the last third of the night
  const nightDuration = fajrTime.getTime() - ishaTime.getTime();
  const witrTime = new Date(ishaTime.getTime() + (nightDuration * 3/4));
  
  return witrTime.toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
}

function calculateDuhaTime(sunrise: string, dhuhr: string): string {
  const sunriseTime = new Date(`1970-01-01T${sunrise}`);
  const dhuhrTime = new Date(`1970-01-01T${dhuhr}`);
  
  // Duha is recommended when the sun has risen to the height of a spear (about 15-20 minutes after sunrise)
  const duhaTime = new Date(sunriseTime.getTime() + (20 * 60 * 1000)); // 20 minutes after sunrise
  
  return duhaTime.toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
}