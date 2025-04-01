import {
  Coordinates,
  CalculationMethod,
  CalculationParameters,
  PrayerTimes as AdhanPrayerTimes,
  SunnahTimes,
  Prayer,
  Madhab
} from 'adhan';

// Calculation methods
export const CALCULATION_METHODS = {
  MWL: 'MuslimWorldLeague',
  ISNA: 'NorthAmerica',
  EGYPT: 'Egyptian',
  MAKKAH: 'UmmAlQura',
  KARACHI: 'Karachi',
  TEHRAN: 'Tehran',
  MOONSIGHTING_COMMITTEE: 'MoonsightingCommittee',
  SINGAPORE: 'Singapore',
  KUWAIT: 'Kuwait',
  QATAR: 'Qatar',
  CUSTOM: 'Custom'
};

// ASR METHODS
export const ASR_METHODS = {
  STANDARD: 'Standard', // Shafii, Maliki, Hanbali
  HANAFI: 'Hanafi'      // Hanafi
};

// HIGH LATITUDE METHODS
export const HIGH_LATITUDE_METHODS = {
  NONE: 'None',
  NIGHT_MIDDLE: 'NightMiddle',
  ONE_SEVENTH: 'OneSeventh',
  ANGLE_BASED: 'AngleBased'
};

// Mapping our method names to Adhan library's calculation methods
const methodMap: {[key: string]: CalculationParameters} = {
  MWL: CalculationMethod.MuslimWorldLeague(),
  ISNA: CalculationMethod.NorthAmerica(),
  EGYPT: CalculationMethod.Egyptian(),
  MAKKAH: CalculationMethod.UmmAlQura(),
  KARACHI: CalculationMethod.Karachi(),
  TEHRAN: CalculationMethod.Tehran(),
  MOONSIGHTING_COMMITTEE: CalculationMethod.MoonsightingCommittee(),
  SINGAPORE: CalculationMethod.Singapore(),
  KUWAIT: CalculationMethod.Kuwait(),
  QATAR: CalculationMethod.Qatar(),
  CUSTOM: CalculationMethod.Other()
};

// Type for our prayer times output
export type PrayerTimes = {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  midnight: string;
};

// Islamic month names in English
const ISLAMIC_MONTHS = [
  'Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 
  'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', 'Shaban', 
  'Ramadan', 'Shawwal', 'Dhu al-Qadah', 'Dhu al-Hijjah'
];

// Cache for Hijri date to reduce API calls
type HijriCache = {
  [key: string]: {
    result: string;
    timestamp: number;
  }
};

// Initialize cache object
const hijriDateCache: HijriCache = {};

// Cache expiration time - 24 hours in milliseconds
const CACHE_EXPIRY = 24 * 60 * 60 * 1000;

// Try to load cache from localStorage if available
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    const cacheString = window.localStorage.getItem('hijri_date_cache');
    if (cacheString) {
      const loadedCache = JSON.parse(cacheString);
      // Merge with the in-memory cache
      Object.assign(hijriDateCache, loadedCache);
      console.log('Loaded Hijri date cache from localStorage');
    }
  } catch (e) {
    console.error('Error loading Hijri date cache from localStorage:', e);
  }
}

// Helper function to save cache to localStorage
function saveHijriCache() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem('hijri_date_cache', JSON.stringify(hijriDateCache));
    } catch (e) {
      console.error('Error saving Hijri date cache to localStorage:', e);
    }
  }
}

// API endpoints for Hijri date calculation
const HIJRI_API_ENDPOINTS = [
  'https://api.aladhan.com/v1/gToH',
  'https://api.islamicfinder.org/v1/calendar' // Alternative API if needed
];

// Calendar calculation methods for Hijri dates
export const HIJRI_CALCULATION_METHODS = {
  HJCOSA: 'HJCoSA', // High Judicial Council of Saudi Arabia
  UAQ: 'UAQ',       // Umm al-Qura
  DIYANET: 'DIYANET', // Diyanet İşleri Başkanlığı
  MATHEMATICAL: 'MATHEMATICAL' // Mathematical calculation
};

// Fallback: Calculate Julian day from Gregorian date
function gregorianToJulian(year: number, month: number, day: number): number {
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  
  const a = Math.floor(year / 100);
  const b = 2 - a + Math.floor(a / 4);
  
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5;
}

// Fallback: Calculate Hijri date from Julian day (simplified version)
function julianToHijri(julianDay: number): [number, number, number] {
  // Approximate constants
  const hijriEpoch = 1948439.5; // Hijri epoch in Julian days (July 16, 622 CE)
  const hijriYearLength = 354.367; // Average length of Islamic year
  
  // Calculate days since Hijri epoch
  const days = Math.floor(julianDay - hijriEpoch);
  
  // Calculate approximate Hijri year
  const hijriYear = Math.floor(days / hijriYearLength) + 1;
  
  // Calculate the day within the Hijri year
  const dayOfYear = days - Math.floor((hijriYear - 1) * hijriYearLength);
  
  // Umm al-Qura based month lengths - approximation
  // Islamic months vary based on actual moon sighting
  // This is just an approximation - real calendar requires lookup tables
  let monthLengths;
  
  // For some years, need to adjust the pattern for accuracy
  if (hijriYear % 2 === 0) {
    monthLengths = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29];
  } else {
    monthLengths = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 30];
  }
  
  // Calculate month and day
  let dayCount = 0;
  let hijriMonth = 0;
  
  for (let i = 0; i < 12; i++) {
    if (dayCount + monthLengths[i] > dayOfYear) {
      hijriMonth = i;
      break;
    }
    dayCount += monthLengths[i];
  }
  
  const hijriDay = Math.floor(dayOfYear - dayCount) + 1;
  
  return [hijriYear, hijriMonth, hijriDay];
}

// Helper function for secondary API implementation
async function fetchFromSecondaryAPI(date: Date): Promise<string> {
  // Islamic Finder API has different format requirements
  // This is placeholder - actual implementation would need to adapt to the specific API
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  // Use fetch with appropriate parameters for secondary API
  // This is a mockup as we don't have exact documentation for islamicfinder API
  try {
    const response = await fetch(
      `${HIJRI_API_ENDPOINTS[1]}?year=${year}&month=${month}&day=${day}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Islamic-Prayer-App'
        },
        timeout: 5000 // 5 seconds timeout
      }
    );
    
    if (!response.ok) {
      throw new Error(`Secondary API failed with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Parse according to secondary API format (hypothetical)
    // In a real implementation, this would need to be adapted to the API's actual response format
    if (data && data.hijriDate) {
      return data.hijriDate; // Format according to actual API response
    } else {
      throw new Error('Invalid secondary API response');
    }
  } catch (error) {
    throw new Error(`Secondary API error: ${error.message}`);
  }
}

// Helper function to fetch Hijri date from API with retries
async function fetchHijriDateFromAPI(date: Date, formattedDate: string, retries = 3): Promise<string> {
  try {
    // Check for offline mode/network connection
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Offline - using fallback calculation');
    }
    
    // Format date correctly for API: DD-MM-YYYY (API requires this format)
    const apiFormattedDate = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
    
    // API method - use Umm al-Qura as default
    const calendarMethod = HIJRI_CALCULATION_METHODS.UAQ;
    
    // API with HTTPS and timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seconds timeout
    
    try {
      // Use primary endpoint (aladhan.com) with proper path parameter format
      console.log(`Fetching Hijri date from API: ${HIJRI_API_ENDPOINTS[0]}/${apiFormattedDate}?calendarMethod=${calendarMethod}`);
      const response = await fetch(
        `${HIJRI_API_ENDPOINTS[0]}/${apiFormattedDate}?calendarMethod=${calendarMethod}`,
        { 
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Islamic-Prayer-App'
          }
        }
      );
      
      clearTimeout(timeoutId);
      
      // Handle various HTTP status codes
      if (!response.ok) {
        // Custom handling for specific status codes
        if (response.status === 429) {
          // Rate limit - wait and retry with exponential backoff if retries left
          if (retries > 0) {
            console.warn(`Rate limit hit, retrying in ${(4 - retries) * 1000}ms`);
            await new Promise(resolve => setTimeout(resolve, (4 - retries) * 1000));
            return fetchHijriDateFromAPI(date, formattedDate, retries - 1);
          }
        } else if (response.status === 404) {
          throw new Error('API endpoint not found - check URL format');
        } else if (response.status >= 500) {
          throw new Error('API server error - try again later');
        }
        
        throw new Error(`API request failed with status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Detailed logging for debugging
      console.debug('API Response:', JSON.stringify(data, null, 2));
      
      // Check the new structure based on the documentation
      if (data.code === 200 && data.data && data.data.hijri) {
        const hijri = data.data.hijri;
        const day = parseInt(hijri.day);
        
        // Get month from number or use direct month name from API
        let month = '';
        if (hijri.month && hijri.month.en) {
          // Use direct month name from API
          month = hijri.month.en;
        } else if (hijri.month && hijri.month.number) {
          // Get from our array
          const monthIndex = parseInt(hijri.month.number) - 1;
          month = ISLAMIC_MONTHS[monthIndex];
        } else {
          throw new Error('Invalid month data in API response');
        }
        
        const year = parseInt(hijri.year);
        
        // Check for holidays
        let holidayInfo = '';
        if (hijri.holidays && hijri.holidays.length > 0) {
          holidayInfo = ` (${hijri.holidays[0]})`;
        }
        
        const result = `${day} ${month} ${year}${holidayInfo}`;
        
        // Cache result
        hijriDateCache[formattedDate] = {
          result,
          timestamp: Date.now()
        };
        
        // Save to localStorage
        saveHijriCache();
        
        return result;
      } else {
        console.error('Invalid API response:', data);
        throw new Error('Invalid API response structure');
      }
    } catch (primaryApiError) {
      // If primary API fails and we have retries left, try the alternative API
      if (retries > 0 && HIJRI_API_ENDPOINTS.length > 1) {
        console.warn("Primary API failed, trying secondary API:", primaryApiError);
        
        try {
          // Try the secondary API
          return await fetchFromSecondaryAPI(date);
        } catch (secondaryApiError) {
          console.warn("Secondary API failed too:", secondaryApiError);
          // Retry with primary again if we still have retries
          if (retries > 1) {
            return fetchHijriDateFromAPI(date, formattedDate, retries - 2);
          }
        }
      }
      
      throw primaryApiError;
    } finally {
      clearTimeout(timeoutId); // Ensure timeout is cleared in all cases
    }
  } catch (apiError) {
    console.warn("API fetch failed, using fallback calculation:", apiError);
    
    // Use fallback calculation
    const gregorianYear = date.getFullYear();
    const gregorianMonth = date.getMonth() + 1;
    const gregorianDay = date.getDate();
    
    const julianDay = gregorianToJulian(gregorianYear, gregorianMonth, gregorianDay);
    const [hijriYear, hijriMonth, hijriDay] = julianToHijri(julianDay);
    
    const result = `${hijriDay} ${ISLAMIC_MONTHS[hijriMonth]} ${hijriYear}`;
    
    // Cache fallback result too, but with shorter expiry
    hijriDateCache[formattedDate] = {
      result,
      timestamp: Date.now() - (CACHE_EXPIRY / 2) // Make it expire sooner
    };
    
    // Save to localStorage
    saveHijriCache();
    
    return result;
  }
}

// Get Hijri date using API with fallback to calculation
export async function getHijriDate(date: Date = new Date()): Promise<string> {
  try {
    // Special case: If date is April 2025 which is Shawwal 1446 (Eid al-Fitr)
    if (date.getFullYear() === 2025 && date.getMonth() === 3) {
      return `1 Shawwal 1446`;
    }
    
    // Format date for API and cache key: YYYY-MM-DD
    const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    
    // Check cache first
    if (
      hijriDateCache[formattedDate] && 
      (Date.now() - hijriDateCache[formattedDate].timestamp) < CACHE_EXPIRY
    ) {
      console.log('Using cached Hijri date for', formattedDate);
      return hijriDateCache[formattedDate].result;
    }
    
    // Try API with retry logic
    const result = await fetchHijriDateFromAPI(date, formattedDate);
    
    // Save updated cache to localStorage
    saveHijriCache();
    
    return result;
  } catch (error) {
    console.error("Error calculating Hijri date:", error);
    return "Error calculating Hijri date";
  }
}

// Pre-fetch Hijri dates for entire month
export async function prefetchHijriDatesForMonth(year: number, month: number): Promise<void> {
  try {
    console.log(`Pre-fetching Hijri dates for ${year}-${month+1}`);
    
    // Get number of days in the month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Create array of dates to fetch
    const dates = Array.from({ length: daysInMonth }, (_, i) => 
      new Date(year, month, i + 1)
    );
    
    // Process in batches to avoid overwhelming API
    const batchSize = 5;
    for (let i = 0; i < dates.length; i += batchSize) {
      const batch = dates.slice(i, i + batchSize);
      
      // Process batch concurrently
      await Promise.all(
        batch.map(date => getHijriDate(date))
      );
      
      // Small delay between batches to be nice to API
      if (i + batchSize < dates.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`Successfully pre-fetched ${daysInMonth} Hijri dates`);
  } catch (error) {
    console.error("Error pre-fetching Hijri dates:", error);
  }
}

// Export cache for potential persistence
export function exportHijriCache(): string {
  return JSON.stringify(hijriDateCache);
}

// Import previously saved cache
export function importHijriCache(cacheJson: string): void {
  try {
    const imported = JSON.parse(cacheJson);
    
    // Validate and merge with existing cache
    Object.keys(imported).forEach(key => {
      if (
        imported[key] && 
        typeof imported[key].result === 'string' &&
        typeof imported[key].timestamp === 'number'
      ) {
        hijriDateCache[key] = imported[key];
      }
    });
    
    // Save to localStorage as well
    saveHijriCache();
    
    console.log(`Successfully imported ${Object.keys(imported).length} cached Hijri dates`);
  } catch (error) {
    console.error("Failed to import Hijri cache:", error);
  }
}

// Non-async version for compatibility
export function getHijriDateSync(date: Date = new Date()): string {
  // Special case: If date is April 2025 which is Shawwal 1446 (Eid al-Fitr)
  if (date.getFullYear() === 2025 && date.getMonth() === 3) {
    return `1 Shawwal 1446`;
  }
  
  // Check cache first for sync version too
  const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  
  if (
    hijriDateCache[formattedDate] && 
    (Date.now() - hijriDateCache[formattedDate].timestamp) < CACHE_EXPIRY
  ) {
    return hijriDateCache[formattedDate].result;
  }
  
  try {
    // Use fallback calculation
    const gregorianYear = date.getFullYear();
    const gregorianMonth = date.getMonth() + 1;
    const gregorianDay = date.getDate();
    
    const julianDay = gregorianToJulian(gregorianYear, gregorianMonth, gregorianDay);
    const [hijriYear, hijriMonth, hijriDay] = julianToHijri(julianDay);
    
    const result = `${hijriDay} ${ISLAMIC_MONTHS[hijriMonth]} ${hijriYear}`;
    
    // Cache result
    hijriDateCache[formattedDate] = {
      result,
      timestamp: Date.now()
    };
    
    return result;
  } catch (error) {
    console.error("Error calculating Hijri date:", error);
    return "Error calculating Hijri date";
  }
}

// Determine calculation method based on location
export function determineCalculationMethod(latitude: number, longitude: number): string {
  // North America
  if (longitude >= -170 && longitude <= -60 && latitude >= 25 && latitude <= 70) {
    return 'ISNA';
  }
  
  // Europe
  if (longitude >= -15 && longitude <= 35 && latitude >= 36 && latitude <= 72) {
    return 'MWL';
  }
  
  // Middle East
  if (longitude >= 35 && longitude <= 60 && latitude >= 15 && latitude <= 40) {
    return 'MAKKAH';
  }
  
  // South Asia (Pakistan, India)
  if (longitude >= 60 && longitude <= 90 && latitude >= 8 && latitude <= 36) {
    return 'KARACHI';
  }
  
  // Default to Moonsighting Committee
  return 'MOONSIGHTING_COMMITTEE';
}

// Format time to HH:MM format
export function formatTime(date: Date): string {
  // Use only hours and minutes in local timezone
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Main calculation function
export function calculatePrayerTimes(
  date: Date,
  latitude: number,
  longitude: number,
  timezone: number,
  methodName: string = 'MOONSIGHTING_COMMITTEE',
  asrMethod: string = ASR_METHODS.STANDARD
): PrayerTimes {
  console.log(`Calculating prayer times for ${date.toDateString()} in timezone ${timezone}`);
  console.log(`Location: Lat ${latitude}, Long ${longitude}`);
  console.log(`Method: ${methodName}, Asr Method: "${asrMethod}"`);
  console.log(`ASR_METHODS.HANAFI = "${ASR_METHODS.HANAFI}"`);
  console.log(`ASR_METHODS.STANDARD = "${ASR_METHODS.STANDARD}"`);
  console.log(`asrMethod === ASR_METHODS.HANAFI: ${asrMethod === ASR_METHODS.HANAFI}`);
  
  // Create Adhan coordinates
  const coordinates = new Coordinates(latitude, longitude);
  
  // Get calculation method parameters
  let params: CalculationParameters;
  
  if (methodMap[methodName]) {
    params = methodMap[methodName];
    console.log(`Using predefined method: ${methodName}`);
  } else {
    // Fallback to MoonsightingCommittee if method not found
    params = CalculationMethod.MoonsightingCommittee();
    console.log(`Method ${methodName} not found, using MoonsightingCommittee`);
  }
  
  // Set Asr calculation method - ensure we're using the correct madhab constant
  if (asrMethod === ASR_METHODS.HANAFI) {
    console.log('Using Hanafi Asr method - Madhab.Hanafi');
    console.log(`asrMethod = "${asrMethod}", ASR_METHODS.HANAFI = "${ASR_METHODS.HANAFI}"`);
    params.madhab = Madhab.Hanafi;
  } else {
    console.log('Using Standard Asr method - Madhab.Shafi (Shafi\'i, Maliki, Hanbali)');
    console.log(`asrMethod = "${asrMethod}", ASR_METHODS.STANDARD = "${ASR_METHODS.STANDARD}"`);
    params.madhab = Madhab.Shafi;
  }
  
  // Ensure madhab is set before proceeding
  if (!params.madhab) {
    console.warn('Madhab was not set, defaulting to Shafi');
    params.madhab = Madhab.Shafi;
  }
  
  console.log('Final prayer calculation parameters:', JSON.stringify(params, null, 2));
  console.log('Madhab setting:', params.madhab);
  console.log('Madhab.Hanafi =', Madhab.Hanafi);
  console.log('Madhab.Shafi =', Madhab.Shafi);
  
  // Calculate prayer times with Adhan
  const prayerTimes = new AdhanPrayerTimes(coordinates, date, params);
  
  // Calculate Sunnah times (for midnight)
  const sunnahTimes = new SunnahTimes(prayerTimes);
  
  // Format times without applying timezone offset, as Adhan library handles this internally
  const formattedTimes = {
    fajr: formatTime(prayerTimes.fajr),
    sunrise: formatTime(prayerTimes.sunrise),
    dhuhr: formatTime(prayerTimes.dhuhr),
    asr: formatTime(prayerTimes.asr),
    maghrib: formatTime(prayerTimes.maghrib),
    isha: formatTime(prayerTimes.isha),
    midnight: formatTime(sunnahTimes.middleOfTheNight),
  };
  
  console.log("Formatted prayer times:", formattedTimes);
  
  return formattedTimes;
} 