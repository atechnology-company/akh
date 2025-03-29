// Add cache object at the top
const cache = {
  prayerData: null as PrayerData | null,
  timestamp: 0,
  expiry: 60 * 60 * 1000 // 1 hour cache
};

const getCurrentLocation = () =>
  new Promise<{ latitude: number; longitude: number; locationName: string }>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    // Add timeout for geolocation
    const timeoutId = setTimeout(() => {
      reject(new Error('Geolocation request timed out'));
    }, 5000);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        clearTimeout(timeoutId);
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };

        try {
          // Reverse geocoding using OpenStreetMap Nominatim
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);
          
          const data = await response.json();
          const locationName = data.address.suburb || data.address.city || data.address.town || 'Unknown Location';
          resolve({ ...coords, locationName });
        } catch (error) {
          console.error('Error getting location name:', error);
          resolve({ ...coords, locationName: 'Unknown Location' });
        }
      },
      (error) => {
        clearTimeout(timeoutId);
        console.error('Error getting location:', error);
        reject(error);
      },
      { timeout: 5000, maximumAge: 600000 } // Use cached location if available within 10 minutes
    );
  });

const enableLocationRequest = async () => {
  return Promise.resolve();
};

import type { AladhanResponse } from '../types/index';

export interface PrayerTimes {
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

let prayerTimes: PrayerTimes = {
  fajr: '',
  dhuhr: '',
  asr: '',
  maghrib: '',
  isha: ''
};

export interface PrayerData {
  prayerTimes: PrayerTimes;
  hijriDate: string;
  location: {
    latitude: number;
    longitude: number;
    locationName: string;
  };
}

export async function getHijriDate(latitude: number, longitude: number): Promise<string> {
  try {
    const date = new Date();
    const timestamp = Math.floor(date.getTime() / 1000);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(
      `https://api.aladhan.com/v1/timings/${timestamp}?latitude=${latitude}&longitude=${longitude}&method=2`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    
    const data = await response.json();
    if (data.code === 200) {
      const hijri = data.data.date.hijri;
      return `${hijri.day} ${hijri.month.en} ${hijri.year}`;
    }
    return 'Unable to fetch Hijri date';
  } catch (error) {
    console.error('Error fetching Hijri date:', error);
    return 'Unable to fetch Hijri date';
  }
}

export async function getPrayerData(): Promise<PrayerData | undefined> {
  try {
    // Check cache first
    const now = Date.now();
    if (cache.prayerData && (now - cache.timestamp < cache.expiry)) {
      return cache.prayerData;
    }
    
    const location = await getCurrentLocation();
    const [prayerTimesData, hijriDate] = await Promise.all([
      getPrayerTimes(location.latitude, location.longitude),
      getHijriDate(location.latitude, location.longitude)
    ]);

    if (!prayerTimesData) {
      throw new Error('Failed to fetch prayer times');
    }

    const prayerData = {
      prayerTimes: prayerTimesData,
      hijriDate,
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        locationName: location.locationName
      }
    };
    
    // Update cache
    cache.prayerData = prayerData;
    cache.timestamp = now;
    
    return prayerData;
  } catch (error) {
    console.error('Error fetching prayer data:', error);
    return undefined;
  }
}

export async function getPrayerTimes(latitude?: number, longitude?: number): Promise<PrayerTimes | undefined> {
  try {
    let lat: number;
    let lng: number;

    if (latitude !== undefined && longitude !== undefined) {
      lat = latitude;
      lng = longitude;
    } else {
      const location = await getCurrentLocation();
      lat = location.latitude;
      lng = location.longitude;
    }

    const date = new Date();
    const url = `https://api.aladhan.com/v1/timings/${Math.floor(date.getTime()/1000)}?latitude=${lat}&longitude=${lng}&method=2`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    const data = await response.json() as AladhanResponse;
    const timings = data.data.timings;
    
    prayerTimes = {
      fajr: timings.Fajr,
      dhuhr: timings.Dhuhr,
      asr: timings.Asr,
      maghrib: timings.Maghrib,
      isha: timings.Isha
    };
    
    return prayerTimes;
  } catch (error) {
    console.error('Error fetching prayer times:', error);
    return undefined;
  }
}