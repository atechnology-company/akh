import * as geolocation from '@nativescript/geolocation';

  let prayerTimes = {
    fajr: '',
    dhuhr: '',
    asr: '',
    maghrib: '',
    isha: ''
  };
  
  export async function getPrayerTimes() {
    await geolocation.enableLocationRequest();
    const location = await geolocation.getCurrentLocation({});
    const lat = location.latitude;
    const lng = location.longitude;
    const date = new Date();
    const url = `http://api.aladhan.com/v1/timings/${date.getTime()/1000}?latitude=${lat}&longitude=${lng}&method=2`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
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
    }
  }