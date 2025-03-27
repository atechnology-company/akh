const getCurrentLocation = () =>
  new Promise<{ latitude: number; longitude: number; locationName: string }>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };

        try {
          // Reverse geocoding using OpenStreetMap Nominatim
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}`
          );
          const data = await response.json();
          const locationName = data.address.suburb || data.address.city || data.address.town || 'Unknown Location';
          resolve({ ...coords, locationName });
        } catch (error) {
          console.error('Error getting location name:', error);
          resolve({ ...coords, locationName: 'Unknown Location' });
        }
      },
      (error) => {
        console.error('Error getting location:', error);
        reject(error);
      }
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
    const response = await fetch(
      `http://api.aladhan.com/v1/timings/${timestamp}?latitude=${latitude}&longitude=${longitude}&method=2`
    );
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
    const location = await getCurrentLocation();
    const [prayerTimesData, hijriDate] = await Promise.all([
      getPrayerTimes(location.latitude, location.longitude),
      getHijriDate(location.latitude, location.longitude)
    ]);

    if (!prayerTimesData) {
      throw new Error('Failed to fetch prayer times');
    }

    return {
      prayerTimes: prayerTimesData,
      hijriDate,
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        locationName: location.locationName
      }
    };
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
    const url = `http://api.aladhan.com/v1/timings/${Math.floor(date.getTime()/1000)}?latitude=${lat}&longitude=${lng}&method=2`;
    
    const response = await fetch(url);
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