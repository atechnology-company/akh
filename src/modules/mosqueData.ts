// Mosque data logic for search, CRUD, and settings with Firebase integration
import { browser } from '$app/environment';
import { writable, get } from 'svelte/store';
import { calculatePrayerTimes, ASR_METHODS } from './prayerCalculation';
import { fetchMosques, fetchMosqueById, searchMosquesByName, createMosque, updateMosqueData } from './firebase';
import * as fs from 'fs';
import { base } from '$app/paths';

export type Mosque = {
  id: string;
  name: string;
  notes: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  prayerSettings?: {
    method: string;
    asrMethod: string;
    adjustments: {
      fajr: number;
      dhuhr: number;
      asr: number;
      maghrib: number;
      isha: number;
    };
    timeSettings?: PrayerTimeSettings;
  };
  prayerTimes: {
    fajr: string;
    fajrIqamah: string;
    dhuhr: string;
    dhuhrIqamah: string;
    jumah: string;
    asr: string;
    asrIqamah: string;
    maghrib: string;
    maghribIqamah: string;
    isha: string;
    ishaIqamah: string;
  };
};

// Define the prayer time settings type
export type PrayerTimeSettings = {
  fajr: 'fixed' | 'incremental';
  dhuhr: 'fixed' | 'incremental';
  asr: 'fixed' | 'incremental';
  maghrib: 'fixed' | 'incremental';
  isha: 'fixed' | 'incremental';
};

// Store for mosque settings
export const mosqueSettingsStore = writable({
  asrMethod: ASR_METHODS.STANDARD,
  useCalculatedTimes: true,
  prayerTimeSettings: {
    fajr: 'fixed' as const,
    dhuhr: 'fixed' as const,
    asr: 'fixed' as const,
    maghrib: 'fixed' as const,
    isha: 'fixed' as const
  } as PrayerTimeSettings
});

// Function to calculate prayer times for a mosque based on its location
export function calculateMosquePrayerTimes(mosque: Mosque, date: Date = new Date()): Partial<Mosque['prayerTimes']> {
  if (!mosque.location) {
    console.warn('Cannot calculate prayer times: Mosque has no location data');
    return {};
  }
  
  const { latitude, longitude } = mosque.location;
  const timezone = -(new Date().getTimezoneOffset() / 60); // Get local timezone offset
  const method = mosque.prayerSettings?.method || 'MOONSIGHTING_COMMITTEE';
  const asrMethod = mosque.prayerSettings?.asrMethod || get(mosqueSettingsStore).asrMethod;
  
  try {
    const calculatedTimes = calculatePrayerTimes(
      date,
      latitude,
      longitude,
      timezone,
      method,
      asrMethod
    );
    
    // Apply any custom adjustments from mosque settings
    const adjustments = mosque.prayerSettings?.adjustments || {
      fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0
    };
    
    // Return only the prayer times needed for the mosque display
    // (not including sunrise, etc.)
    return {
      fajr: calculatedTimes.fajr,
      dhuhr: calculatedTimes.dhuhr,
      asr: calculatedTimes.asr,
      maghrib: calculatedTimes.maghrib,
      isha: calculatedTimes.isha
    };
  } catch (error) {
    console.error('Error calculating prayer times:', error);
    return {};
  }
}

// In-memory data that will be populated from JSON files
let mosques: Mosque[] = [];

// Function to import mosques from JSON files in the mosques directory
export async function importMosquesFromJson(): Promise<Mosque[]> {
  if (!browser) {
    // Server-side: Use fs to read the directory
    try {
      const mosquesDir = 'src/mosques';
      const files = fs.readdirSync(mosquesDir);
      const jsonFiles = files.filter((file: string) => file.endsWith('.json'));
      
      const importedMosques: Mosque[] = [];
      
      for (const file of jsonFiles) {
        try {
          const content = fs.readFileSync(`${mosquesDir}/${file}`, 'utf-8');
          const mosque = JSON.parse(content) as Mosque;
          importedMosques.push(mosque);
        } catch (error) {
          console.error(`Error importing mosque from ${file}:`, error);
        }
      }
      
      mosques = importedMosques;
      return mosques;
    } catch (error) {
      console.error('Error reading mosque directory:', error);
      return [];
    }
  } else {
    // Client-side: Use fetch to get the JSON files
    try {
      const response = await fetch(`${base}/api/mosques`);
      if (!response.ok) throw new Error('Failed to fetch mosques');
      
      const importedMosques = await response.json() as Mosque[];
      mosques = importedMosques;
      return mosques;
    } catch (error) {
      console.error('Error fetching mosques:', error);
      
      // Fallback to sample data if fetch fails
      const defaultMosque: Mosque = {
        id: 'sample-' + Date.now().toString(),
        name: 'Sample Mosque',
        notes: 'This is a sample mosque created for demonstration purposes.\n\nPrayer times are calculated based on the default location.\n\nYou can add your own mosques using the Add New Mosque button.',
        location: {
          latitude: 51.5074,
          longitude: -0.1278
        },
        prayerSettings: {
          method: 'MOONSIGHTING_COMMITTEE',
          asrMethod: ASR_METHODS.STANDARD,
          adjustments: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
          timeSettings: {
            fajr: 'fixed',
            dhuhr: 'fixed',
            asr: 'fixed',
            maghrib: 'fixed',
            isha: 'fixed'
          }
        },
        prayerTimes: {
          fajr: '05:30', fajrIqamah: '05:45',
          dhuhr: '12:30', dhuhrIqamah: '12:45', jumah: '13:15',
          asr: '15:45', asrIqamah: '16:00',
          maghrib: '18:15', maghribIqamah: '18:20',
          isha: '19:45', ishaIqamah: '20:00'
        }
      };
      
      // Calculate prayer times based on the location
      if (defaultMosque.location) {
        const calculatedTimes = calculateMosquePrayerTimes(defaultMosque);
        if (calculatedTimes.fajr) defaultMosque.prayerTimes.fajr = calculatedTimes.fajr;
        if (calculatedTimes.dhuhr) defaultMosque.prayerTimes.dhuhr = calculatedTimes.dhuhr;
        if (calculatedTimes.asr) defaultMosque.prayerTimes.asr = calculatedTimes.asr;
        if (calculatedTimes.maghrib) defaultMosque.prayerTimes.maghrib = calculatedTimes.maghrib;
        if (calculatedTimes.isha) defaultMosque.prayerTimes.isha = calculatedTimes.isha;
      }
      
      mosques = [defaultMosque];
      
      // Try to add the sample mosque to Firebase for future use
      try {
        const { id, ...mosqueData } = defaultMosque;
        await createMosque(mosqueData);
      } catch (e) {
        console.log('Could not save sample mosque to Firebase:', e);
      }
      return mosques;
    }
  }
}

// Function to fetch mosques from Firebase
export async function fetchMosquesFromFirebase(): Promise<Mosque[]> {
  try {
    return await fetchMosques();
  } catch (error) {
    console.error('Error in fetchMosquesFromFirebase:', error);
    return [];
  }
}

export async function getMosques(): Promise<Mosque[]> {
  // Always try to fetch the latest data from Firebase
  try {
    const firebaseMosques = await fetchMosquesFromFirebase();
    if (firebaseMosques && firebaseMosques.length > 0) {
      mosques = firebaseMosques;
      return mosques;
    }
  } catch (error) {
    console.error('Error fetching mosques from Firebase:', error);
  }
  
  // If Firebase fetch fails or returns empty, try to import from JSON files
  if (mosques.length === 0) {
    return importMosquesFromJson();
  }
  return Promise.resolve(mosques);
}

export async function addMosque(mosque: Omit<Mosque, 'id'>): Promise<Mosque> {
  try {
    // First try to add to Firebase
    const firebaseMosque = await createMosque(mosque);
    if (firebaseMosque) {
      // If successful, add to local array and return Firebase mosque
      mosques.push(firebaseMosque);
      return firebaseMosque;
    }
  } catch (error) {
    console.error('Error adding mosque to Firebase:', error);
  }
  
  // Fallback to local storage if Firebase fails
  const newMosque = { ...mosque, id: Date.now().toString() };
  mosques.push(newMosque);
  return newMosque;
}

export async function updateMosque(id: string, data: Partial<Mosque>): Promise<Mosque | undefined> {
  const mosque = mosques.find(m => m.id === id);
  if (mosque) {
    // Update local mosque data
    Object.assign(mosque, data);
    
    try {
      // Try to update in Firebase
      const success = await updateMosqueData(id, data);
      if (!success) {
        console.warn('Firebase update failed, but local data was updated');
      }
    } catch (error) {
      console.error('Error updating mosque in Firebase:', error);
    }
    
    return mosque;
  }
  return undefined;
}

export function getMosqueById(id: string): Promise<Mosque | undefined> {
  return Promise.resolve(mosques.find(m => m.id === id));
}

// For search functionality
export function searchMosques(query: string): Promise<Mosque[]> {
  const q = query.toLowerCase();
  return Promise.resolve(mosques.filter(m => m.name.toLowerCase().includes(q)));
}