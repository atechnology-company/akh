const getCurrentLocation = () =>
  new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      }),
      (error) => reject(error)
    );
  });

const enableLocationRequest = async () => {
  return Promise.resolve();
};

import type { PrayerTimes, AladhanResponse } from '../types';

let prayerTimes: PrayerTimes = {
  fajr: '',
  dhuhr: '',
  asr: '',
  maghrib: '',
  isha: ''
};

export async function getPrayerTimes(): Promise<PrayerTimes | undefined> {
  try {
    await enableLocationRequest();
    const location = await getCurrentLocation();
    const lat = location.latitude;
    const lng = location.longitude;
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