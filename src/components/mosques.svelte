<script lang="ts">
import { onMount } from 'svelte';
import { getMosques, searchMosques, addMosque, getMosqueById, updateMosque, type Mosque, type PrayerTimeSettings, calculateMosquePrayerTimes, mosqueSettingsStore } from '../modules/mosqueData';
import { ASR_METHODS } from '../modules/prayerCalculation';
import { fade, fly } from 'svelte/transition';
import { formatDate } from '../modules/dateUtils';
import { hijriDateStore } from '../modules/salah';
import { accentColor, gradientColor } from '$lib/stores/accentColor';

// Responsive design - detect mobile devices
let isMobile = false;
let windowWidth = 0;

// Function to update mobile status based on window width
function updateMobileStatus() {
  isMobile = windowWidth <= 768;
}


// For date display
let gregorianDate = '';
let hijriDate = '';

let mosques: Mosque[] = [];
let searchQuery = '';
let filteredMosques: Mosque[] = [];
let selectedMosque: Mosque | null = null;
let showAddModal = false;
let newMosqueName = '';
let newMosqueNotes = '';
let showSettings = false;
let useCalculatedTimes = true;
let asrMethod = ASR_METHODS.STANDARD;
let showLeftSidebar = false;
let showRightSidebar = false;
let sidebarHoverTimeout: NodeJS.Timeout;
let currentPrayerIndex = 0; // Track the current prayer index
let timeUntilNextPrayer = ''; // Time until next prayer
// Animation properties for welcome screen
let welcomeAnimationActive = true;
let animationInterval: NodeJS.Timeout;
let welcomeGradientIndex = 0;
let welcomeTextOpacity = 1;
let welcomeTextInterval: NodeJS.Timeout;
const welcomeGradients = [
  'linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d)', // Fajr
  'linear-gradient(135deg, #8ae068, #0072ff)',          // Dhuhr
  'linear-gradient(135deg, #dda65e, #ef473a)',          // Asr
  'linear-gradient(135deg, #ef473a, #b42460)',          // Maghrib
  'linear-gradient(135deg, #0f2027, #203a43, #2c5364)'  // Isha
];
let welcomeMessages = [
  'Track prayer times for your local mosques',
  'Set and manage Iqamah times',
  'Get automatic prayer time calculations',
  'Add notes and important information',
  'Beautiful prayer time display'
];
let currentWelcomeMessage = 0;
// Individual prayer iqamah time mode settings
let globalIqamahTimeMode = 'minutes'; // Default global setting
let prayerIqamahModes: Record<string, string> = {
  fajr: 'minutes',
  dhuhr: 'minutes',
  asr: 'minutes',
  maghrib: 'minutes',
  isha: 'minutes'
};

// Individual prayer settings for fixed or incremental times
let prayerTimeSettings: PrayerTimeSettings = {
  fajr: 'fixed',
  dhuhr: 'fixed',
  asr: 'fixed',
  maghrib: 'fixed',
  isha: 'fixed'
};

// Function to toggle prayer time setting between fixed and incremental
function togglePrayerTimeSetting(prayer: PrayerKey) {
  // Toggle the setting for the specified prayer
  prayerTimeSettings[prayer] = prayerTimeSettings[prayer] === 'fixed' ? 'incremental' : 'fixed';
  
  // Save settings to Firebase if we have a selected mosque
  if (selectedMosque) {
    // Update local mosque object first for immediate feedback
    if (!selectedMosque.prayerSettings) {
      selectedMosque.prayerSettings = {
        method: 'MOONSIGHTING_COMMITTEE',
        asrMethod: asrMethod,
        adjustments: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
        timeSettings: {...prayerTimeSettings}
      };
    } else {
      // Ensure timeSettings exists
      if (!selectedMosque.prayerSettings.timeSettings) {
        selectedMosque.prayerSettings.timeSettings = {...prayerTimeSettings};
      } else {
        selectedMosque.prayerSettings.timeSettings = {...prayerTimeSettings};
      }
    }
    
    // Show saving status
    saveStatus = 'saving';
    
    // Then update in Firebase
    updateMosque(selectedMosque.id, {
      prayerSettings: {
        ...selectedMosque.prayerSettings,
        adjustments: selectedMosque.prayerSettings.adjustments || { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
        timeSettings: {...prayerTimeSettings}
      }
    }).then(() => {
      // Set save status to indicate success
      saveStatus = 'saved';
      setTimeout(() => { saveStatus = 'idle'; }, 3000);
    }).catch(error => {
      console.error('Error saving prayer time settings:', error);
      saveStatus = 'error';
      setTimeout(() => { saveStatus = 'idle'; }, 3000);
    });
  }
}
// Firebase loading state
let isLoading = false;
let dbError: string | null = null;

// Helper function to calculate minutes difference between prayer time and iqamah time
function getMinutesDifference(prayerTime: string, iqamahTime: string): number {
  if (!prayerTime || !iqamahTime) return 15; // Default to 15 minutes
  
  const [pHours, pMins] = prayerTime.split(':').map(Number);
  const [iHours, iMins] = iqamahTime.split(':').map(Number);
  
  let pTotalMins = pHours * 60 + pMins;
  let iTotalMins = iHours * 60 + iMins;
  
  // Handle case where iqamah is next day
  if (iTotalMins < pTotalMins) {
    iTotalMins += 24 * 60;
  }
  
  return iTotalMins - pTotalMins;
}

type PrayerTimes = {
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
  [key: string]: string;
};

// Define prayer time keys for type safety
type PrayerTimeKey = keyof PrayerTimes;

// Ensure type safety for prayer time keys with iqamah suffix
type PrayerKey = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
type IqamahKey = `${PrayerKey}Iqamah`;
type AllPrayerKeys = PrayerKey | IqamahKey | 'jumah';


// For mosque location
let newMosqueLatitude = '';
let newMosqueLongitude = '';

let newMosqueTimes: PrayerTimes = {
  fajr: '', fajrIqamah: '',
  dhuhr: '', dhuhrIqamah: '', jumah: '',
  asr: '', asrIqamah: '',
  maghrib: '', maghribIqamah: '',
  isha: '', ishaIqamah: ''
};
let editNotes = '';
let isEditingNotes = false;
let overlayMessage = '';
let overlayActive = false;
let now = new Date();
let interval: NodeJS.Timeout;

const prayerOrder = [
  { key: 'fajr' as PrayerKey, label: 'Fajr', iqamah: 'Fajr Iqamah' },
  { key: 'dhuhr' as PrayerKey, label: 'Dhuhr', iqamah: 'Dhuhr Iqamah', jumah: 'Jumah' },
  { key: 'asr' as PrayerKey, label: 'Asr', iqamah: 'Asr Iqamah' },
  { key: 'maghrib' as PrayerKey, label: 'Maghrib', iqamah: 'Maghrib Iqamah' },
  { key: 'isha' as PrayerKey, label: 'Isha', iqamah: 'Isha Iqamah' }
];

// Subscribe to mosque settings changes
$: {
  $mosqueSettingsStore = {
    asrMethod,
    useCalculatedTimes,
    prayerTimeSettings
  };
  
  // Recalculate prayer times if settings change and we have a selected mosque
  if (selectedMosque && selectedMosque.location && useCalculatedTimes) {
    updateCalculatedPrayerTimes();
  }
}

onMount(() => {
  isLoading = true;
  
  // Set up timer for clock and prayer times
  interval = setInterval(() => { 
    now = new Date(); 
    checkOverlay(); 
    updateTimeRemaining();
    updateDateDisplay();
  }, 1000);
  
  // Set welcome screen to active state without animations
  welcomeAnimationActive = true;
  
  // Set welcome text to visible without animations
  welcomeTextOpacity = 1;
  currentWelcomeMessage = 0; // Start with first message
  
  // Initialize welcome gradient
  document.documentElement.style.setProperty('--welcome-gradient', welcomeGradients[welcomeGradientIndex]);
  
  // Initialize settings from store
  asrMethod = $mosqueSettingsStore.asrMethod;
  useCalculatedTimes = $mosqueSettingsStore.useCalculatedTimes;
  
  // Initialize prayer time settings if available in store
  if ($mosqueSettingsStore.prayerTimeSettings) {
    prayerTimeSettings = $mosqueSettingsStore.prayerTimeSettings;
  }
  
  // Initialize date display
  updateDateDisplay();
  
  // Initialize mosque data from Firebase
  getMosques().then(result => {
    mosques = result;
    filteredMosques = mosques;
    isLoading = false;
    
    // Don't auto-select first mosque to show welcome screen
    // Only select if URL or other parameter indicates a specific mosque
    
    // Set the welcome gradient based on current time of day
    const hour = new Date().getHours();
    if (hour >= 4 && hour < 12) {
      // Morning - Fajr gradient
      welcomeGradientIndex = 0;
    } else if (hour >= 12 && hour < 15) {
      // Afternoon - Dhuhr gradient
      welcomeGradientIndex = 1;
    } else if (hour >= 15 && hour < 18) {
      // Late afternoon - Asr gradient
      welcomeGradientIndex = 2;
    } else if (hour >= 18 && hour < 20) {
      // Evening - Maghrib gradient
      welcomeGradientIndex = 3;
    } else {
      // Night - Isha gradient
      welcomeGradientIndex = 4;
    }
    document.documentElement.style.setProperty('--welcome-gradient', welcomeGradients[welcomeGradientIndex]);
  }).catch(error => {
    console.error('Error loading mosques:', error);
    dbError = 'Failed to load mosque data. Please try again later.';
    isLoading = false;
  });
  
  // Subscribe to hijri date from salah module
  const unsubscribeHijri = hijriDateStore.subscribe(value => {
    if (value) {
      hijriDate = value;
    }
  });
  
  // Return cleanup function
  return () => {
    clearInterval(interval);
    // No need to clear animation intervals as they're no longer used
    unsubscribeHijri();
  };
});

// Update date display
function updateDateDisplay() {
  const date = new Date();
  gregorianDate = formatDate(date, 'full');
}

function handleSearch() {
  searchMosques(searchQuery).then(res => filteredMosques = res);
}

// Function to update calculated prayer times
function updateCalculatedPrayerTimes() {
  if (!selectedMosque || !selectedMosque.location) return;
  
  const calculatedTimes = calculateMosquePrayerTimes(selectedMosque);
  
  // Only update the adhan times if they exist in calculatedTimes
  const prayerKeys = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
  prayerKeys.forEach(key => {
    if (calculatedTimes[key]) {
      selectedMosque!.prayerTimes[key] = calculatedTimes[key] as string;
    }
  });
}

function selectMosque(mosque: Mosque) {
  if (!mosque) return;
  selectedMosque = mosque;
  editNotes = mosque.notes || '';
  isEditingNotes = false;
  
  // Load prayer time settings from mosque if available
  if (mosque.prayerSettings && mosque.prayerSettings.timeSettings) {
    prayerTimeSettings = mosque.prayerSettings.timeSettings;
  }
  
  // If we're using calculated times and the mosque has location data, update prayer times
  if (useCalculatedTimes && mosque.location) {
    updateCalculatedPrayerTimes();
  }
  
  checkOverlay();
  updateTimeRemaining();
  hideLeftSidebar();
  hideRightSidebar();
}

function openAddModal() {
  showAddModal = true;
  newMosqueName = '';
  newMosqueNotes = '';
  newMosqueLatitude = '';
  newMosqueLongitude = '';
  newMosqueTimes = {
    fajr: '', fajrIqamah: '',
    dhuhr: '', dhuhrIqamah: '', jumah: '',
    asr: '', asrIqamah: '',
    maghrib: '', maghribIqamah: '',
    isha: '', ishaIqamah: ''
  };
}

async function addNewMosque() {
  // Create location data if coordinates are provided
  const location = (newMosqueLatitude && newMosqueLongitude) ? {
    latitude: parseFloat(newMosqueLatitude),
    longitude: parseFloat(newMosqueLongitude)
  } : undefined;
  
  // Create mosque object
  const mosque: Omit<Mosque, 'id'> = {
    name: newMosqueName,
    notes: newMosqueNotes,
    location,
    prayerSettings: {
      method: 'MOONSIGHTING_COMMITTEE',
      asrMethod,
      adjustments: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
      timeSettings: prayerTimeSettings
    },
    prayerTimes: newMosqueTimes
  };
  
  // Add mosque to database
  try {
    const newMosque = await addMosque(mosque);
    // Fix duplicate mosque issue by directly assigning instead of spreading
    mosques = [newMosque, ...mosques.filter(m => m.id !== newMosque.id)];
    filteredMosques = [newMosque, ...filteredMosques.filter(m => m.id !== newMosque.id)];
    selectedMosque = newMosque;
    showAddModal = false;
  } catch (error) {
    console.error('Error adding mosque:', error);
  }
}

// Function to start editing notes - now triggered directly when clicking on notes area
function startEditNotes() {
  isEditingNotes = true;
  editNotes = selectedMosque?.notes || '';
  // Ensure textarea is focused when edit mode starts
  setTimeout(() => {
    const textarea = document.querySelector('.notes-textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
    }
  }, 100);
}

// Function to save notes and exit edit mode
async function saveNotes() {
  if (selectedMosque) {
    try {
      // Update the mosque notes in Firebase if they've changed
      if (selectedMosque.notes !== editNotes) {
        await updateMosque(selectedMosque.id, { notes: editNotes });
        selectedMosque.notes = editNotes;
      }
      // Exit edit mode
      isEditingNotes = false;
    } catch (error) {
      console.error('Error saving notes:', error);
      // Show error message to user
      saveStatus = 'error';
      setTimeout(() => { saveStatus = 'idle'; }, 3000);
    }
  }
}

// Function to cancel editing and revert to original notes
function cancelEditNotes() {
  if (selectedMosque) {
    editNotes = selectedMosque.notes || '';
    isEditingNotes = false;
  }
}

// Debounce function for handling real-time updates
function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Status indicators for notes auto-save functionality
let saveStatus: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
let saveStatusTimeout: NodeJS.Timeout;

// Function to handle real-time notes editing with debounced auto-save
const debouncedSaveNotes = debounce(async (notes: string) => {
  if (selectedMosque) {
    try {
      // Show saving indicator
      saveStatus = 'saving';
      
      // Update local state first for immediate feedback
      selectedMosque.notes = notes;
      
      // Then update in Firebase
      await updateMosque(selectedMosque.id, { notes });
      
      // Show saved indicator
      saveStatus = 'saved';
      
      // Reset status after 3 seconds
      clearTimeout(saveStatusTimeout);
      saveStatusTimeout = setTimeout(() => {
        saveStatus = 'idle';
      }, 3000);
      
      console.log('Notes auto-saved successfully');
    } catch (error) {
      console.error('Error auto-saving notes:', error);
      // Show error indicator
      saveStatus = 'error';
      
      // Reset status after 5 seconds
      clearTimeout(saveStatusTimeout);
      saveStatusTimeout = setTimeout(() => {
        saveStatus = 'idle';
      }, 5000);
    }
  }
}, 1000); // 1 second debounce

function handleNotesInput(event: Event) {
  if (event.target instanceof HTMLTextAreaElement) {
    editNotes = event.target.value;
    debouncedSaveNotes(editNotes);
  }
}

function checkOverlay() {
  if (!selectedMosque || !selectedMosque.prayerTimes) return;
  const t = (s: string) => {
    if (!s) return 0;
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  const minsNow = now.getHours() * 60 + now.getMinutes();
  const pt: PrayerTimes = selectedMosque.prayerTimes;
  
  // Update current prayer index
  updateCurrentPrayer(minsNow, pt);
  
  // Set the prayer gradient CSS variable based on current prayer without animation
  const currentPrayer = prayerOrder[currentPrayerIndex]?.key || 'fajr';
  const prayerGradients = {
    'fajr': 'linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d)',
    'dhuhr': 'linear-gradient(135deg, #8ae068, #0072ff)',
    'asr': 'linear-gradient(135deg, #dda65e, #ef473a)',
    'maghrib': 'linear-gradient(135deg, #ef473a, #b42460)',
    'isha': 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)'
  };
  // Apply the current prayer gradient directly without transitions
  document.documentElement.style.setProperty('--gradient-color', prayerGradients[currentPrayer]);
  // Also update welcome gradient to match current prayer
  document.documentElement.style.setProperty('--welcome-gradient', prayerGradients[currentPrayer]);
  
  // Check for overlay conditions
  
  // Check for Jumah in progress
  if (pt.jumah && pt.dhuhrIqamah) {
    const jumahStart = t(pt.jumah);
    const jumahEnd = t(pt.dhuhrIqamah);
    if (minsNow >= jumahStart && minsNow < jumahEnd) {
      overlayMessage = 'Jumah in progress, please sit down and pay attention to the khutbah.';
      overlayActive = true;
      return;
    }
  }
  
  // Check for prayers about to begin (within 10 minutes)
  const prayerKeys = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
  for (const prayer of prayerKeys) {
    const prayerTime = t(pt[prayer]);
    const timeUntilPrayer = prayerTime - minsNow;
    
    // If prayer is within 10 minutes and hasn't started yet
    if (timeUntilPrayer > 0 && timeUntilPrayer <= 10) {
      overlayMessage = `${prayer.charAt(0).toUpperCase() + prayer.slice(1)} prayer will begin in ${timeUntilPrayer} minutes. Please prepare for prayer.`;
      overlayActive = true;
      return;
    }
  }
  
  overlayActive = false;
}

// Function to determine the current prayer based on time
function updateCurrentPrayer(minsNow: number, pt: PrayerTimes) {
  if (!pt) return;
  const t = (s: string) => {
    if (!s) return 0;
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  
  // Get prayer times in order
  const times = [
    { index: 0, name: 'fajr', time: t(pt.fajr) },
    { index: 1, name: 'dhuhr', time: t(pt.dhuhr) },
    { index: 2, name: 'asr', time: t(pt.asr) },
    { index: 3, name: 'maghrib', time: t(pt.maghrib) },
    { index: 4, name: 'isha', time: t(pt.isha) }
  ];
  
  // Sort by time for proper sequence through the day
  times.sort((a, b) => a.time - b.time);
  
  // Find the current prayer (the most recent prayer that has passed)
  let currentIndex = 0;
  let nextIndex = 0;
  
  // If before first prayer of the day, show the last prayer from yesterday
  if (minsNow < times[0].time) {
    currentIndex = times.length - 1; // Last prayer (Isha)
  } else {
    // Find the most recent prayer that has passed
    for (let i = times.length - 1; i >= 0; i--) {
      if (minsNow >= times[i].time) {
        currentIndex = i;
        break;
      }
    }
  }
  
  // Map the sorted index back to the original prayer index
  currentPrayerIndex = times[currentIndex].index;
}

// Left sidebar hover functionality
function showLeftSidebarOnHover() {
  clearTimeout(sidebarHoverTimeout);
  showLeftSidebar = true;
}

function hideLeftSidebar() {
  sidebarHoverTimeout = setTimeout(() => {
    showLeftSidebar = false;
  }, 300);
}

function keepLeftSidebarOpen() {
  clearTimeout(sidebarHoverTimeout);
}

function toggleLeftSidebar() {
  showLeftSidebar = !showLeftSidebar;
}

// Right sidebar hover functionality
function showRightSidebarOnHover() {
  clearTimeout(sidebarHoverTimeout);
  showRightSidebar = true;
}

function hideRightSidebar() {
  sidebarHoverTimeout = setTimeout(() => {
    showRightSidebar = false;
  }, 300);
}

function keepRightSidebarOpen() {
  clearTimeout(sidebarHoverTimeout);
}

// Function to calculate time until next prayer
function updateTimeRemaining() {
  if (!selectedMosque || !selectedMosque.prayerTimes) return;
  
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes() + (now.getSeconds() / 60);
  
  const timeToMinutes = (timeStr: string) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };
  
  // Get next prayer time
  const prayerKeys = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
  let nextPrayerIndex = (currentPrayerIndex + 1) % prayerKeys.length;
  let nextPrayerTime = timeToMinutes(selectedMosque.prayerTimes[prayerKeys[nextPrayerIndex]]);
  
  // If next prayer is tomorrow (time is less than current time)
  let diff = nextPrayerTime - currentTime;
  if (diff < 0) {
    diff += 24 * 60; // Add 24 hours
  }
  
  const hours = Math.floor(diff / 60);
  const minutes = Math.floor(diff % 60);
  const seconds = Math.floor((diff % 1) * 60);
  
  // Format with hours, minutes and seconds
  if (hours > 0) {
    timeUntilNextPrayer = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    timeUntilNextPrayer = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}
</script>

<style>
.mosque-container {
  position: fixed;
  inset: 0;
  display: flex;
  background: #1a232b;
  color: #fff;
  z-index: 100;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 12px;
  font-family: "Onest", sans-serif;
}

/* Mobile-specific styles */
@media (max-width: 768px) {
  .mosque-container {
    flex-direction: column;
  }
  
  /* Hide notes and settings on mobile by default */
  .mosque-sidebar-right {
    display: none;
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-width: 100%;
    z-index: 200;
    transform: translateX(0);
  }
  
  .mosque-sidebar-right.visible {
    display: block;
  }
  
  /* Make the main content take full width on mobile */
  .mosque-main {
    width: 100%;
    padding: 0;
  }
  
  /* Adjust prayer times display for mobile */
  .prayer-list {
    width: 100%;
  }
  
  /* Mobile layout for three-section layout */
  .three-section-layout.mobile-layout {
    flex-direction: column;
  }
  
  .three-section-layout.mobile-layout .main-section {
    width: 100%;
    height: 30vh;
  }
  
  .three-section-layout.mobile-layout .prayer-list-section {
    width: 100%;
    height: 70vh;
  }
  
  .three-section-layout.mobile-layout .notes-section-simple {
    display: none;
  }
  
  .three-section-layout.mobile-layout .notes-section-simple.mobile-notes {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    z-index: 150;
    background: rgba(0, 0, 0, 0.95);
  }
  
  /* Mobile settings toggle button */
}

/* Notes styling */
.notes-content {
  padding: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  min-height: 100px;
  margin-top: 0.5rem;
  white-space: pre-wrap;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
}

.notes-content:hover {
  background: rgba(255, 255, 255, 0.1);
}

.notes-content.empty {
  font-style: italic;
  color: rgba(255, 255, 255, 0.5);
}

.placeholder-text {
  font-style: italic;
  color: rgba(255, 255, 255, 0.5);
  display: block;
}

.notes-text {
  flex: 1;
}

.edit-indicator {
  position: absolute;
  bottom: 8px;
  right: 8px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.notes-content:hover .edit-indicator {
  opacity: 0.7;
}

.auto-save-status {
  display: flex;
  align-items: center;
  font-size: 0.8rem;
  margin-top: 0.5rem;
}

.auto-save-status .material-icons {
  font-size: 1rem;
  margin-right: 0.25rem;
}

.auto-save-status.saving {
  color: #ffcc00;
}

.auto-save-status.saved {
  color: #4caf50;
}

.auto-save-status.error {
  color: #f44336;
}

.auto-save-status.idle {
  color: rgba(255, 255, 255, 0.6);
}

/* Prayer time settings styling */
.prayer-setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.prayer-name {
  font-weight: 500;
}

.settings-description {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 1rem;
}

.mosque-container * {
  box-sizing: border-box;
}

.topleft {
  position: absolute;
  top: 40px;
  left: 40px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}

.bottomleft {
  position: absolute;
  bottom: 40px;
  left: 40px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  z-index: 20;
}

.mosque-name {
  font-size:2rem;
  margin-bottom: 4px;
}

/* Date display */
.gregorian-date {
  font-size: 2rem;
  margin-bottom: 4px;
}

.hijri-date {
  font-size: 1.5rem;
  opacity: 0.8;
}

/* Time until next prayer */
.time-until-next-prayer {
  font-size: 3rem;
  font-weight: 500;
}

/* Current prayer name */
.current-prayer-label {
  font-size: 2rem;
  font-weight: 500;
}

/* Main prayer times display */
.prayer-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1), margin-right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.prayer-display.sidebar-left-visible {
  margin-left: 320px;
}

.prayer-display.sidebar-right-visible {
  margin-right: 500px;
}

/* Current time display */
.prayer-display-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  z-index: 10;
}

.current-time {
  font-size: 10rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

.next-prayer-info {
  font-size: 1.2rem;
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}

/* Three-section layout */
.three-section-layout {
  display: flex;
  height: 100%;
  width: 100%;
  flex-direction: row;
}

/* Main section - 50% width */
.main-section {
  flex: 0 0 50%;
  position: relative;
  height: 100%;
  overflow: hidden;
  color: white;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

/* Prayer list section - 25% width */
.prayer-list-section {
  flex: 0 0 25%;
  height: 100%;
}

/* Notes section - 25% width */
.notes-section-simple {
  flex: 0 0 25%;
  padding: 1.5rem;
  height: 100%;
  overflow-y: auto;
  background-color: rgb(0, 0, 0);
}

.notes-content {
  color: #fff;
  font-size: 1rem;
  line-height: 1.5;
  white-space: pre-wrap;
  min-height: 100px;
  padding: 0.5rem;
  border-radius: 4px;
}

.notes-edit-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.notes-textarea {
  flex: 1;
  min-height: 200px;
  padding: 0.75rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  font-size: 1rem;
  line-height: 1.5;
  resize: none;
  margin-bottom: 0.5rem;
  transition: all 0.3s ease;
  font-family: inherit;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) inset;
}

.notes-textarea:focus {
  border-color: rgba(255, 255, 255, 0.5);
  outline: none;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.1), 0 2px 8px rgba(0, 0, 0, 0.2) inset;
}

.notes-status-indicator {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
  height: 20px;
}

.auto-save-status {
  padding: 4px 10px;
  border-radius: 12px;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 5px;
  animation: fadeIn 0.3s ease;
  font-weight: 500;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.auto-save-status .material-icons {
  font-size: 1rem;
}

.auto-save-status.saving {
  background-color: rgba(52, 152, 219, 0.2);
  color: #3498db;
  animation: pulse 1.5s infinite;
}

.auto-save-status.saved {
  background-color: rgba(46, 204, 113, 0.2);
  color: #2ecc71;
}

.auto-save-status.error {
  background-color: rgba(231, 76, 60, 0.2);
  color: #e74c3c;
}

.auto-save-status.idle {
  background-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
  font-style: italic;
}

@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.auto-save-status.saved {
  color: #4caf50;
  background-color: rgba(76, 175, 80, 0.1);
}

.auto-save-status.error {
  color: #f44336;
  background-color: rgba(244, 67, 54, 0.1);
}
@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}

.notes-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.edit-notes-btn, .save-notes-btn, .cancel-notes-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s ease;
}

.edit-notes-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.save-notes-btn {
  background: #4caf50;
  color: white;
}

.cancel-notes-btn {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.edit-notes-btn:hover, .save-notes-btn:hover, .cancel-notes-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.edit-icon, .save-icon, .cancel-icon {
  font-size: 1rem;
}

.prayer-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0;
  margin: 0;
  list-style: none;
  overflow-y: auto;
}

.prayer-time {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
  transition: all 0.3s ease;
  padding: 1.5rem;
  color: white;
  text-align: center;
  min-height: 140px;
  border-radius: 0;
}

/* Apply border radius only to top-left of Fajr and bottom-left of Isha */
.prayer-time:first-child {
  border-top-right-radius: 8px;
}

.prayer-time:last-child {
  border-bottom-right-radius: 8px;
}

.prayer-time .iqamah-time {
  position: absolute;
  bottom: 5px;
  right: 10px;
  font-size: 1.2rem;
  margin: 0;
  opacity: 0.8;
}


/* Prayer time backgrounds with smooth transitions */
:root {
  --prayer-gradient: linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d);
  --welcome-gradient: linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d);
  /* Remove transitions to fix animation issues */
}

.prayer-time[data-prayer="fajr"], .current-prayer[data-prayer="fajr"] {
  --prayer-gradient: linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d);
  background: var(--prayer-gradient);
}

.prayer-time[data-prayer="dhuhr"], .current-prayer[data-prayer="dhuhr"] {
  --prayer-gradient: linear-gradient(135deg, #8ae068, #0072ff);
  background: var(--prayer-gradient);
}

.prayer-time[data-prayer="asr"], .current-prayer[data-prayer="asr"] {
  --prayer-gradient: linear-gradient(135deg, #dda65e, #ef473a);
  background: var(--prayer-gradient);
}

.prayer-time[data-prayer="maghrib"], .current-prayer[data-prayer="maghrib"] {
  --prayer-gradient: linear-gradient(135deg, #ef473a, #b42460);
  background: var(--prayer-gradient);
}

.prayer-time[data-prayer="isha"], .current-prayer[data-prayer="isha"] {
  --prayer-gradient: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
  background: var(--prayer-gradient);
}

/* Fullscreen modal styles */
.fullscreen-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(10px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
}

.fullscreen-modal-content {
  width: 100%;
  height: 100%;
  max-width: 1200px;
  max-height: 90vh;
  background: #1a232b;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.modal-header {
  padding: 1.5rem 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: white;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 600;
}

.close-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
}

.modal-body {
  flex: 1;
  padding: 1.5rem 2rem;
  overflow-y: auto;
  color: white;
}

.modal-footer {
  padding: 1.5rem 2rem;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.cancel-btn, .save-btn {
  padding: 0.8rem 1.5rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-btn {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.save-btn {
  background: var(--gradient-color);
  color: white;
  border: none;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
}

.save-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 15px rgba(0, 0, 0, 0.4);
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Form styling */
.form-section {
  margin-bottom: 2rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.form-section h3 {
  margin-top: 0;
  margin-bottom: 1.2rem;
  font-size: 1.3rem;
  font-weight: 500;
  color: white;
  opacity: 0.9;
}

.form-group {
  margin-bottom: 1.2rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.8);
}

.form-group input[type="text"],
.form-group input[type="number"],
.form-group input[type="time"] {
  width: 100%;
  padding: 0.8rem 1rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 1rem;
  transition: all 0.2s ease;
}

.form-group input:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.15);
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  margin-right: 0.5rem;
  width: 18px;
  height: 18px;
}

.info-text {
  margin-top: 0.5rem;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.6);
  font-style: italic;
}

.toggle-container {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.toggle-label {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.8);
}

.toggle-btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle-btn.active {
  background: var(--gradient-color);
  border-color: transparent;
}

.prayer-time-inputs {
  display: grid;
  gap: 1.2rem;
}

.prayer-time-row {
  display: grid;
  grid-template-columns: 80px 1fr 1fr;
  gap: 1rem;
  align-items: center;
  padding: 0.8rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
}

.prayer-label {
  font-weight: 500;
}

.time-input-container {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.time-input-container label {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.7);
}

.time-input {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Welcome screen styles */
.welcome-screen {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background-size: 400% 400%;
  animation: gradientAnimation 15s ease infinite;
  transition: all 0.8s ease;
  overflow: hidden;
}

.welcome-screen.active {
  opacity: 1;
}

.welcome-content {
  z-index: 10;
  padding: 2.5rem;
  border-radius: 1.5rem;
  backdrop-filter: blur(10px);
  margin: 0 auto;
  transition: transform 0.5s ease, box-shadow 0.5s ease;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
}

.welcome-content:hover {
  transform: translateY(-5px);
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.4);
}

.welcome-content h1 {
  font-size: 3.5rem;
  margin-bottom: 1rem;
  background: linear-gradient(to right, #fff, #8cf);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
}

.welcome-feature {
  font-size: 1.4rem;
  font-weight: 500;
  margin: 1.5rem 0;
  color: white;
  transition: opacity 0.5s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.welcome-feature-icon {
  margin-right: 0.8rem;
  font-size: 1.6rem;
}

.welcome-actions {
  display: flex;
  gap: 1.5rem;
  justify-content: center;
  margin-top: 2.5rem;
}

.welcome-btn {
  padding: 1rem 2rem;
  border-radius: 2rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 1.1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.welcome-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
}

.welcome-btn.primary {
  background: rgba(255, 255, 255, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.welcome-btn.primary:hover {
  background: rgba(255, 255, 255, 0.35);
}

/* Animated background elements */
.animated-background {
  position: absolute;
  inset: 0;
  z-index: 1;
  opacity: 0.8;
  filter: blur(50px);
}

.animated-particles {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow: hidden;
}

.particle {
  position: absolute;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 50%;
  animation: float 20s linear infinite;
  z-index: 2;
}

@keyframes float {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    transform: translateY(-100vh) rotate(720deg);
    opacity: 0;
  }
}

@keyframes gradientAnimation {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

/* Smooth gradient transitions */
.animated-background, .main-section {
  transition: background 1.5s ease-in-out;
}

.prayer-name-bottomleft {
  position: absolute;
  bottom: 5px;
  left: 10px;
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}

.prayer-time-display {
  font-size: 6rem;
  font-weight: 700;
}

.iqamah-time {
  font-size: 1.2rem;
  margin-top: 0.5rem;
  opacity: 0.8;
}

.jumah-time-topright {
  position: absolute;
  top: 5px;
  right: 10px;
  font-size: 1.2rem;
  color: #ffeb3b;
  z-index: 5;
}

/* Left sidebar for mosque selection */
.mosque-sidebar-left {
  position: fixed;
  top: 0;
  left: 0;
  height: 100%;
  width: 320px;
  background: rgba(0, 0, 0, 0.85);
  transform: translateX(-100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 200;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(8px);
}

.mosque-sidebar-left.visible {
  transform: translateX(0);
}

.left-sidebar-hover-area {
  position: fixed;
  top: 0;
  left: 0;
  height: 100%;
  width: 20px;
  z-index: 199;
}

/* Right sidebar for settings */
.mosque-sidebar-right {
  position: fixed;
  top: 0;
  right: 0;
  height: 100%;
  width: 500px;
  background: rgba(0, 0, 0, 0.85);
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 200;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(8px);
}

.mosque-sidebar-right.visible {
  transform: translateX(0);
}

.right-sidebar-hover-area {
  position: fixed;
  top: 0;
  right: 0;
  height: 100%;
  width: 20px;
  z-index: 199;
}

/* Settings sections */
.settings-section {
  padding: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.settings-section h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1.2rem;
}

.settings-option {
  margin-bottom: 1rem;
  display: flex;
}

.settings-option label {
  display: block;
  margin-bottom: 0.5rem;
  width: 50%;
}

.settings-option select,
.settings-option input {
  width: 50%;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: white;
}

.reload-button {
  background: #2d8cff;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 0.5rem 1rem;
  margin-top: 1rem;
  cursor: pointer;
  font-size: 1rem;
  width: 100%;
}

.reload-button:hover {
  background: #1a6abf;
}

.mosque-list {
  padding: 1rem;
  flex: 1;
  overflow-y: auto;
}

.sidebar-footer {
  padding: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin-top: auto;
}

.add-mosque-btn {
  background: var(--gradient-color);
  color: #fff;
  border: none;
  border-radius: 8px;
  width: 100%;
  padding: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  transition: all 0.2s ease;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
}

.add-mosque-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 15px rgba(0, 0, 0, 0.3);
}

.add-icon {
  margin-right: 0.5rem;
  font-size: 1.2rem;
  font-weight: bold;
}

.mosque-list-item {
  padding: 0.75rem 1rem;
  margin-bottom: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
  background: rgba(255, 255, 255, 0.1);
}

.mosque-list-item:hover {
  background: rgba(255, 255, 255, 0.2);
}

.mosque-list-item.selected {
  background: var(--gradient-color);
}

.sidebar-header {
  padding: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.searchbar {
  display: flex;
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.searchbar input {
  flex: 1;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  padding: 0.5rem;
  border-radius: 4px;
  color: white;
}

.add-btn {
  background: #2d8cff;
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-left: 0.5rem;
  font-size: 1.5rem;
}

/* Notes section - moved to right side */
.notes-section {
  flex: 1;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  height: 100%;
  order: 3; /* Move to the right */
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0 8px 8px 0;
}

.notes-section h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1.2rem;
}

.mosque-name-header {
  position: sticky;
  top: 0;
  background: black;
  padding: 10px 0;
  margin-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  font-size: 1.5rem;
  font-weight: bold;
  z-index: 10;
}

.notes-content {
  white-space: pre-line;
  font-size: 1.1rem;
  line-height: 1.6;
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  margin-top: 0.5rem;
}

.notes-section textarea {
  width: 100%;
  min-height: 6em;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 0.5rem;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

/* Toggle container styles */
.toggle-container {
  display: flex;
  flex-direction: row;
  width: 100%;
  margin-bottom: 1rem;
  border-radius: 4px;
  overflow: hidden;
}

.toggle-btn {
  flex: 1;
  padding: 10px;
  border: none;
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
}

.toggle-btn.active {
  background: var(--gradient-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.toggle-btn:not(.active) {
  background: rgba(255, 255, 255, 0.1);
}

.toggle-btn:first-child {
  border-radius: 4px 0 0 4px;
}

.toggle-btn:last-child {
  border-radius: 0 4px 4px 0;
}

/* Add mosque modal styles */
.add-mosque-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  color: white;
  backdrop-filter: blur(10px);
}

.add-mosque-content {
  background: rgba(26, 35, 43, 0.95);
  border-radius: 16px;
  width: 95%;
  max-width: 900px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.add-mosque-header {
  padding: 1.5rem 2rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px 16px 0 0;
}

.add-mosque-header h2 {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 600;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.add-mosque-body {
  padding: 2rem;
  flex: 1;
  overflow-y: auto;
}

.form-section {
  margin-bottom: 2.5rem;
  background: rgba(0, 0, 0, 0.2);
  padding: 1.5rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.form-section h3 {
  margin-top: 0;
  margin-bottom: 1.2rem;
  font-size: 1.3rem;
  color: #8cf;
  border-bottom: 1px solid rgba(140, 204, 255, 0.2);
  padding-bottom: 0.8rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1.5rem;
  margin-top: 2.5rem;
  padding: 1.5rem 2rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0 0 16px 16px;
}

.form-actions button {
  padding: 0.9rem 2rem;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.form-actions button.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.form-actions button.primary {
  background: var(--accent-color);
  color: white;
  border: none;
  position: relative;
  overflow: hidden;
}

.form-actions button.primary::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: 0.5s;
}

.form-actions button:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
}

.form-actions button.primary:hover::before {
  left: 100%;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: auto;
  margin-right: 10px;
  cursor: pointer;
}

.checkbox-text {
  font-size: 1.05rem;
}

/* Iqamah settings styles */
.iqamah-settings {
  margin-top: 1rem;
}

.iqamah-row {
  display: flex;
  align-items: center;
  margin-bottom: 0.75rem;
  justify-content: space-between;
}

.prayer-label {
  flex: 0 0 80px;
  font-weight: 500;
}

.input-with-label {
  display: flex;
  align-items: center;
}

.input-with-label input {
  width: 60px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.input-with-label span {
  margin-left: 8px;
  opacity: 0.8;
}

/* Modal section styles */
.modal-section {
  margin-bottom: 1.5rem;
}

.modal-section h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1.1rem;
  color: #8cf;
}

.info-text {
  font-size: 0.9rem;
  color: #8cf;
  margin: 0.5rem 0;
  opacity: 0.8;
}

/* Form styles */
.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

/* Prayer time inputs in modal */
.prayer-time-inputs {
  margin-top: 1rem;
}

.prayer-time-row {
  display: flex;
  align-items: center;
  margin-bottom: 0.75rem;
  gap: 0.75rem;
  padding: 0.5rem;
  border-radius: 8px;
  transition: transform 0.2s, box-shadow 0.2s;
}

.prayer-time-row:hover {
  background: rgba(255, 255, 255, 0.05);
  transform: translateY(-2px);
}

.time-input {
  width: 80px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.jumah-input {
  color: #ffeb3b;
}

.auto-text {
  width: 80px;
  text-align: center;
  font-style: italic;
  opacity: 0.6;
}

.placeholder {
  width: 80px;
}

/* Modal styles */
/* Add mosque modal */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(10px);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  background: #22303c;
  padding: 2rem;
  border-radius: 1rem;
  min-width: 320px;
  max-width: 500px;
  color: #fff;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.modal-content input, .modal-content textarea {
  width: 100%;
  margin-bottom: 1rem;
  padding: 0.7rem;
  border-radius: 0.5rem;
  border: none;
  font-size: 1rem;
}

.modal-content button {
  margin-right: 1rem;
  padding: 0.7rem 1.5rem;
  border-radius: 0.5rem;
  border: none;
  background: #2d8cff;
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
}

.modal-content button.cancel {
  background: #888;
}

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 15, 15, 0.945);
  color: #fff;
  z-index: 400;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 2vw;
  text-align: center;
  pointer-events: all;
  font-family: "Onest", sans-serif;
}

/* Active prayer styling */
.prayer-time.active {
  background-color: rgba(255, 255, 255, 0.1);
  border-left: 4px solid #2d8cff;
}

/* Fix for prayer time selectors in settings menu */
.iqamah-settings {
  margin-top: 1rem;
}

.iqamah-settings input, .iqamah-input {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid var(--gradient-color);
  border-radius: 4px;
  padding: 8px;
}

.toggle-container {
  display: flex;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  overflow: hidden;
  margin: 1rem 0;
}

.toggle-btn {
  flex: 1;
  background: transparent;
  border: none;
  padding: 0.5rem 1rem;
  color: white;
  cursor: pointer;
  transition: background-color 0.5s ease;
}

.toggle-btn.active {
  background: var(--gradient-color);
  font-weight: 500;
}

.settings-section {
  margin-bottom: 2rem;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.settings-section h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1.2rem;
  font-weight: 500;
  color: white;
}

.settings-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.settings-option input[type="checkbox"]  {
  background: var(--gradient-color);
}

.reload-button {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  padding: 8px 16px;
  cursor: pointer;
  font-weight: 500;
  margin-top: 1rem;
  width: 100%;
  transition: background-color 0.5s ease;
}

.reload-button:hover {
  background: var(--gradient-color);
}

.prayer-times-container {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-top: 15px;
}

.prayer-time-row {
  display: flex;
  align-items: flex-start;
  flex-direction: row;
  align-items: center;
  margin-bottom: 0.75rem;
  padding: 0.5rem;
  border-radius: 8px;
  transition: transform 0.2s, box-shadow 0.2s;
  background: rgba(255, 255, 255, 0.05);
}

.prayer-time-inputs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.time-setting-toggle {
  display: flex;
  gap: 15px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}

.time-inputs {
  display: flex;
  gap: 10px;
}

.time-input {
  width: 80px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.jumah-input {
  color: #ffeb3b;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

/* Fix for modal content overflow */
.modal-body {
  flex: 1;
  padding: 1.5rem 2rem;
  overflow-y: auto;
  color: white;
  max-height: calc(90vh - 140px); /* Adjust based on header and footer height */
}

/* Responsive styles */
@media (max-width: 768px) {
  .three-section-layout {
    flex-direction: column;
    width: 100%;
  }
  
  .main-section {
    flex: 0 0 auto;
    min-height: 50vh;
  }
  
  .prayer-list-section {
    flex: 0 0 auto;
    border-left: none;
    border-right: none;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .prayer-list {
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
  }
  
  .prayer-time {
    min-width: 150px;
  }
  
  .notes-section-simple {
    flex: 0 0 auto;
    min-height: 20vh;
  }

  .prayer-time-row {
    flex-direction: column;
  }
  
  .time-inputs {
    margin-top: 8px;
  }
  
  .fullscreen-modal-content {
    width: 95%;
    height: 95%;
  }
}
</style>
{#if overlayActive}
  <div class="overlay" transition:fade>{overlayMessage}</div>
{/if}

<div class="mosque-container">
  <!-- Main prayer times display -->
  <div class="prayer-display" class:sidebar-left-visible={showLeftSidebar} class:sidebar-right-visible={showRightSidebar}>
    {#if !selectedMosque}
      <!-- Welcome screen when no mosque is selected -->
      <div class="welcome-screen" class:active={welcomeAnimationActive} style="background: var(--welcome-gradient)">
        <div class="welcome-content" transition:fade={{ duration: 1000 }}>
          <h1>Assalamualaikum!</h1>
          
          <!-- Animated feature text -->
          <div class="welcome-feature" style="opacity: {welcomeTextOpacity}" transition:fade={{ duration: 500 }}>
            <span class="welcome-feature-icon">
              {#if currentWelcomeMessage === 0}🕌
              {:else if currentWelcomeMessage === 1}⏰
              {:else if currentWelcomeMessage === 2}🧮
              {:else if currentWelcomeMessage === 3}📝
              {:else}✨
              {/if}
            </span>
            {welcomeMessages[currentWelcomeMessage]}
          </div>
          <div>Hover to the left to see the list of mosques and hover to the right to see settings at any time.</div>
          
          <div class="welcome-actions">
            <button class="welcome-btn" on:click={() => showLeftSidebar = true}>
              <span class="icon">📋</span> Select Mosque
            </button>
            <button class="welcome-btn primary" on:click={openAddModal}>
              <span class="icon">➕</span> Add New Mosque
            </button>
          </div>
        </div>
        <div class="animated-background" style="background: var(--welcome-gradient)"></div>
        <div class="animated-particles">
          {#each Array(20) as _, i}
            <div class="particle" style="
              left: {Math.random() * 100}%;
              top: {Math.random() * 100}%;
              width: {3 + Math.random() * 5}px;
              height: {3 + Math.random() * 5}px;
              opacity: {0.3 + Math.random() * 0.5};
              animation-duration: {10 + Math.random() * 20}s;
              animation-delay: {Math.random() * 5}s;
            "></div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="three-section-layout" class:mobile-layout={windowWidth <= 768}>
      <!-- Section 1: Main display with gradient background (50%) -->
      <div class="main-section" style="background: var(--gradient-color)">
        <div class="topleft">
          <div class="mosque-name">{selectedMosque.name}</div>
          <div class="gregorian-date">{gregorianDate}</div>
          <div class="hijri-date">{hijriDate}</div>
        </div>
        
        <div class="prayer-display-center">
          <div class="current-time">{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</div>
        </div>
        
        <div class="bottomleft">
          {#if timeUntilNextPrayer}
            <div class="next-prayer-info">
              <span class="current-prayer-label">Next is {prayerOrder[currentPrayerIndex === 4 ? 0 : currentPrayerIndex + 1].label}</span>
              <span class="time-until-next-prayer">{timeUntilNextPrayer}</span>
            </div>
          {/if}
        </div>
      </div>
      
      <!-- Section 2: Prayer times list (25%) -->
      <div class="prayer-list-section">
        <ul class="prayer-list">
          {#each prayerOrder as prayer, i}
            <li class="prayer-time" data-prayer={prayer.key} class:active={i === currentPrayerIndex}>
              <!-- Jumah time in top right for Dhuhr only -->
              {#if prayer.key === 'dhuhr' && selectedMosque?.prayerTimes?.jumah}
                <div class="jumah-time-topright">{selectedMosque?.prayerTimes?.jumah || ''}</div>
              {/if}
              
              <div class="prayer-time-display">{selectedMosque?.prayerTimes?.[prayer.key] || ''}</div>
              <div class="prayer-name-bottomleft">{prayer.label}</div>
              <div class="iqamah-time">{selectedMosque?.prayerTimes?.[`${prayer.key}Iqamah`] || ''}</div>
            </li>
          {/each}
        </ul>
      </div>
      
      <!-- Section 3: Notes section (25%) - with editable textarea -->
      <!-- Only show on desktop or when explicitly toggled on mobile -->
      <div class="notes-section-simple" class:mobile-notes={windowWidth <= 768 && showRightSidebar}>
        {#if isEditingNotes}
          <div class="notes-edit-container">
            <textarea 
              class="notes-textarea" 
              bind:value={editNotes} 
              on:input={handleNotesInput}
              placeholder="Add notes about this mosque..."
              autofocus
            ></textarea>
            <div class="notes-status-indicator">
              {#if saveStatus === 'saving'}
                <span class="auto-save-status saving"><span class="material-icons">sync</span> Saving...</span>
              {:else if saveStatus === 'saved'}
                <span class="auto-save-status saved"><span class="material-icons">check_circle</span> Saved</span>
              {:else if saveStatus === 'error'}
                <span class="auto-save-status error"><span class="material-icons">error</span> Failed to save</span>
              {:else}
                <span class="auto-save-status idle"><span class="material-icons">auto_awesome</span> Changes auto-save as you type</span>
              {/if}
            </div>
            <div class="notes-edit-actions">
              <button class="save-notes-btn" on:click={saveNotes}>
                <span class="material-icons">check</span> Done
              </button>
              <button class="cancel-notes-btn" on:click={cancelEditNotes}>
                <span class="material-icons">close</span> Cancel
              </button>
            </div>
          </div>
        {:else}
          <!-- Make notes content clickable to start editing directly -->
          <div 
            class="notes-content" 
            on:click={startEditNotes} 
            on:keydown={(e) => e.key === 'Enter' && startEditNotes()}
            role="button" 
            tabindex="0" 
            aria-label="Click to edit mosque notes"
            class:empty={!selectedMosque.notes}
          >
            <div class="notes-text">
              {#if selectedMosque.notes}
                {selectedMosque.notes}
              {:else}
                <span class="placeholder-text">Click here to add notes about this mosque.</span>
              {/if}
            </div>
            <div class="edit-indicator">
              <span class="material-icons">edit</span>
              <span>Click to edit</span>
            </div>
          </div>
        {/if}
      </div>
    </div>
    {/if}
    
    <!-- Left hover area to show mosque sidebar -->
    <div 
      class="left-sidebar-hover-area" 
      on:mouseenter={showLeftSidebarOnHover}
      on:mouseleave={hideLeftSidebar}
    ></div>
    
    <!-- Right hover area to show settings sidebar -->
    <div 
      class="right-sidebar-hover-area" 
      on:mouseenter={showRightSidebarOnHover}
    ></div>
  </div>
  
  <!-- Left mosque selection sidebar -->
  <div 
    class="mosque-sidebar-left {showLeftSidebar ? 'visible' : ''}" 
    on:mouseenter={keepLeftSidebarOpen}
    on:mouseleave={hideLeftSidebar}
  >
    <div class="sidebar-header">
      <h2>Mosques</h2>
    </div>
    
    <div class="searchbar">
      <input 
        type="text" 
        placeholder="Search mosques..." 
        bind:value={searchQuery} 
        on:input={handleSearch} 
      />
    </div>
    
    <div class="mosque-list">
      {#if isLoading}
        <div class="loading-indicator">
          <div class="spinner"></div>
          <p>Loading mosques...</p>
        </div>
      {:else if dbError}
        <div class="error-message">
          <p>{dbError}</p>
          <button on:click={() => { dbError = null; getMosques().then(result => { mosques = result; filteredMosques = mosques; }); }}>Retry</button>
        </div>
      {:else if filteredMosques.length === 0}
        <div class="empty-state">
          <p>No mosques found</p>
          <button class="add-btn-large" on:click={openAddModal}>Add a Mosque</button>
        </div>
      {:else}
        {#each filteredMosques as mosque}
          <div 
            class="mosque-list-item {selectedMosque && mosque.id === selectedMosque.id ? 'selected' : ''}" 
            on:click={() => selectMosque(mosque)}
          >
            {mosque.name}
          </div>
        {/each}
      {/if}
    </div>
    
    <!-- Add mosque button at the bottom of sidebar -->
    <div class="sidebar-footer">
      <button class="add-mosque-btn" on:click={openAddModal}>
        <span class="add-icon">+</span> Add New Mosque
      </button>
    </div>
  </div>

  <!-- Right settings sidebar - Simplified -->
  <div 
    class="mosque-sidebar-right {showRightSidebar ? 'visible' : ''}" 
    on:mouseenter={keepRightSidebarOpen}
    on:mouseleave={hideRightSidebar}
  >
    <div class="sidebar-header">
      <h2>Mosque Settings</h2>
    </div>
    
    {#if selectedMosque}
      <!-- Simplified settings section -->
      <div class="settings-section">
        <h3>Prayer Times</h3>
        
        <div class="settings-option">
          <label>
            Use calculated prayer times
          </label>
          <input type="checkbox" bind:checked={useCalculatedTimes}>
        </div>
        
        <div class="settings-option">
          <label>Asr Method:</label>
          <select bind:value={asrMethod}>
            <option value={ASR_METHODS.STANDARD}>Standard</option>
            <option value={ASR_METHODS.HANAFI}>Hanafi</option>
          </select>
        </div>
      
        <button class="reload-button" on:click={() => {
          if (selectedMosque) {
            // Save prayer time settings to Firebase
            updateMosque(selectedMosque.id, {
              prayerSettings: {
                ...selectedMosque.prayerSettings,
                method: selectedMosque.prayerSettings?.method || 'MOONSIGHTING_COMMITTEE',
                asrMethod,
                adjustments: selectedMosque.prayerSettings?.adjustments || {
                  fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0
                },
                timeSettings: prayerTimeSettings
              }
            });
            
            if (useCalculatedTimes && selectedMosque.location) {
              updateCalculatedPrayerTimes();
              updateMosque(selectedMosque.id, { prayerTimes: selectedMosque.prayerTimes });
            }
            checkOverlay();
            updateTimeRemaining();
          }
        }}>Update Prayer Times</button>
      </div>
      
      <!-- Simplified Iqamah time adjustment section -->
      <div class="settings-section">
        <h3>Iqamah Times</h3>
        
        <!-- Toggle between minutes and fixed time (Global setting) -->
        <div class="toggle-container" style="margin-bottom: 1rem;">
          <button 
            class="toggle-btn {globalIqamahTimeMode === 'minutes' ? 'active' : ''}" 
            on:click={() => {
              globalIqamahTimeMode = 'minutes';
              // Apply to all prayers
              Object.keys(prayerIqamahModes).forEach(key => {
                prayerIqamahModes[key] = 'minutes';
              });
            }}
          >
            Minutes After (All)
          </button>
          <button 
            class="toggle-btn {globalIqamahTimeMode === 'fixed' ? 'active' : ''}" 
            on:click={() => {
              globalIqamahTimeMode = 'fixed';
              // Apply to all prayers
              Object.keys(prayerIqamahModes).forEach(key => {
                prayerIqamahModes[key] = 'fixed';
              });
            }}
          >
            Fixed Time (All)
          </button>
        </div>
        
        <!-- Iqamah time inputs -->
        <div class="iqamah-settings">
          {#each prayerOrder as prayer}
            <div style="display: flex; align-items: center; margin-bottom: 1.25rem; justify-content: space-between;">
              <span style="flex: 0 0 80px; font-weight: 500;">{prayer.label}:</span>
              
              <div style="display: flex; align-items: center; gap: 10px;">
                <!-- Iqamah time mode toggle for individual prayer -->
                <div class="toggle-container" style="margin: 0;">
                  <button 
                    class="toggle-btn {prayerIqamahModes[prayer.key] === 'minutes' ? 'active' : ''}"
                    on:click={() => {
                      prayerIqamahModes[prayer.key] = 'minutes';
                      // Force UI update
                      prayerIqamahModes = {...prayerIqamahModes};
                    }}
                  >
                    Minutes
                  </button>
                  <button 
                    class="toggle-btn {prayerIqamahModes[prayer.key] === 'fixed' ? 'active' : ''}"
                    on:click={() => {
                      prayerIqamahModes[prayer.key] = 'fixed';
                      // Force UI update
                      prayerIqamahModes = {...prayerIqamahModes};
                    }}
                  >
                    Fixed
                  </button>
                </div>
                
                {#if prayerIqamahModes[prayer.key] === 'minutes'}
                  <!-- Minutes after adhan input -->
                  <div style="display: flex; align-items: center; gap: 5px;">
                    <input 
                      type="number" 
                      min="0"
                      max="60"
                      placeholder="15"
                      class="iqamah-input"
                      style="width: 70px;"
                      on:change={(e) => {
                        if (selectedMosque && e.target instanceof HTMLInputElement && e.target.value) {
                          const prayerTime = selectedMosque.prayerTimes[prayer.key];
                          if (prayerTime) {
                            const minutes = parseInt(e.target.value);
                            const [hours, mins] = prayerTime.split(':').map(Number);
                            let newMins = mins + minutes;
                            let newHours = hours;
                            
                            if (newMins >= 60) {
                              newHours = (newHours + Math.floor(newMins / 60)) % 24;
                              newMins = newMins % 60;
                            }
                            
                            selectedMosque.prayerTimes[`${prayer.key}Iqamah`] = 
                              `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
                            updateMosque(selectedMosque.id, { prayerTimes: selectedMosque.prayerTimes });
                          }
                        }
                      }}
                    />
                    <span>min</span>
                  </div>
                {:else}
                  <!-- Fixed time input -->
                  <input 
                    type="time" 
                    placeholder="HH:MM" 
                    value={selectedMosque.prayerTimes[`${prayer.key}Iqamah`] || ''}
                    class="iqamah-input"
                    style="width: 100px;"
                    on:change={(e) => {
                      if (selectedMosque && e.target instanceof HTMLInputElement) {
                        selectedMosque.prayerTimes[`${prayer.key}Iqamah`] = e.target.value;
                        updateMosque(selectedMosque.id, { prayerTimes: selectedMosque.prayerTimes });
                      }
                    }}
                  />
                {/if}
              </div>
            </div>
          {/each}
          
          <!-- Jumah time input -->
          {#if prayerOrder.some(p => p.key === 'dhuhr')}
            <div style="display: flex; align-items: center; margin-bottom: 1.25rem; justify-content: space-between;">
              <span style="flex: 0 0 80px; font-weight: 500;">Jumah:</span>
              <input 
                type="text" 
                placeholder="HH:MM"
                value={selectedMosque?.prayerTimes?.jumah || ''}
                style="width: 140px; padding: 8px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;"
                on:change={(e) => {
                  if (selectedMosque && e.target instanceof HTMLInputElement) {
                    selectedMosque.prayerTimes.jumah = e.target.value;
                    updateMosque(selectedMosque.id, { prayerTimes: selectedMosque.prayerTimes });
                  }
                }}
              />
            </div>
          {/if}
        </div>
      </div>
      
      <!-- We've removed the manual prayer times section as requested -->
      
      <!-- Notes section moved out of right sidebar to main layout -->
    {:else}
      <div style="padding: 1rem; text-align: center;">
        <p>Select a mosque to view settings</p>
      </div>
    {/if}
  </div>
  </div>

{#if showAddModal}
  <div class="fullscreen-modal" transition:fade={{ duration: 300 }}>
    <div class="fullscreen-modal-content" transition:fly={{ y: 30, duration: 400 }}>
      <div class="modal-header" style="background: var(--gradient-color);">
        <h2>Add New Mosque</h2>
        <button class="close-btn" on:click={() => showAddModal = false}>×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="mosque-name">Mosque Name</label>
          <input 
            type="text" 
            id="mosque-name" 
            placeholder="Enter mosque name" 
            bind:value={newMosqueName}
            style="background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;"
          />
        </div>
        
        <div class="form-group">
          <label for="mosque-notes">Notes</label>
          <textarea 
            id="mosque-notes" 
            placeholder="Enter any notes about this mosque" 
            bind:value={newMosqueNotes}
            style="background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; min-height: 100px; width: 100%;"
          ></textarea>
        </div>
        
        <div class="form-group">
          <label>Location (Optional)</label>
          <div style="display: flex; gap: 10px;">
            <input 
              type="text" 
              placeholder="Latitude" 
              bind:value={newMosqueLatitude}
              style="flex: 1; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;"
            />
            <input 
              type="text" 
              placeholder="Longitude" 
              bind:value={newMosqueLongitude}
              style="flex: 1; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;"
            />
          </div>
        </div>
        
        <div class="form-group">
          <h3>Prayer Times</h3>
          <div class="prayer-times-container">
            {#each prayerOrder as prayer}
              <div class="prayer-time-row">
                <div style="width: 100px; font-weight: 500;">{prayer.label}:</div>
                <div class="toggle-container" style="margin: 0;">
                  <button 
                    class="toggle-btn {prayerTimeSettings[prayer.key] === 'fixed' ? 'active' : ''}"
                    on:click={() => prayerTimeSettings[prayer.key] = 'fixed'}
                  >
                    Fixed
                  </button>
                  <button 
                    class="toggle-btn {prayerTimeSettings[prayer.key] === 'incremental' ? 'active' : ''}"
                    on:click={() => prayerTimeSettings[prayer.key] = 'incremental'}
                  >
                    Incremental
                  </button>
                </div>
                
                <div>
                  <input 
                    type="text" 
                    class="time-input" 
                    placeholder={prayerTimeSettings[prayer.key] === 'fixed' ? "HH:MM" : "Minutes"} 
                    bind:value={newMosqueTimes[`${prayer.key}Iqamah`]}
                    style="width: 100px;"
                  />
                </div>
              </div>
            {/each}
            
            <!-- Special case for Jumah -->
            <div class="prayer-time-row">
              <div style="width: 100px; font-weight: 500;">Jumah:</div>
              <div class="prayer-time-inputs" style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 180px;"></div>
                <div>
                  <input 
                    type="text" 
                    class="time-input jumah-input" 
                    placeholder="HH:MM" 
                    bind:value={newMosqueTimes.jumah}
                    style="width: 100px;"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button 
          on:click={addNewMosque}
          style="background: var(--gradient-color); color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;"
        >
          Add Mosque
        </button>
        <button 
          on:click={() => showAddModal = false}
          style="background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); padding: 10px 20px; border-radius: 4px; cursor: pointer; margin-left: 10px;"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Settings modal -->
{#if showSettings}
  <div class="modal">
    <div class="modal-content">
      <h2 style="margin-bottom:1rem;">Mosque Settings</h2>
      
      <div style="margin-bottom:1rem;">
        <label>
          <input type="checkbox" bind:checked={useCalculatedTimes} />
          Use calculated prayer times (requires mosque location)
        </label>
      </div>
      
      <div style="margin-bottom:1rem;">
        <label>Asr Calculation Method:</label>
        <select bind:value={asrMethod} style="width:100%; padding:0.7rem; margin-top:0.5rem; border-radius:0.5rem;">
          <option value={ASR_METHODS.STANDARD}>Standard (Shafi'i, Maliki, Hanbali)</option>
          <option value={ASR_METHODS.HANAFI}>Hanafi</option>
        </select>
      </div>
      
      <!-- Individual Prayer Time Settings -->
      <div style="margin-bottom:1rem;">
        <h3>Prayer Time Settings</h3>
        <p class="settings-description">Choose whether each prayer's iqamah time should be fixed or incremental (based on seasonal changes)</p>
        
        {#each prayerOrder as prayer}
          <div class="prayer-setting-row">
            <span class="prayer-name">{prayer.label}</span>
            <div class="toggle-container">
              <button 
                class="toggle-btn {prayerTimeSettings[prayer.key] === 'fixed' ? 'active' : ''}"
                on:click={() => togglePrayerTimeSetting(prayer.key)}
              >
                Fixed
              </button>
              <button 
                class="toggle-btn {prayerTimeSettings[prayer.key] === 'incremental' ? 'active' : ''}"
                on:click={() => togglePrayerTimeSetting(prayer.key)}
              >
                Incremental
              </button>
            </div>
          </div>
        {/each}
      </div>
      
      <div class="modal-footer">
        <button class="cancel-btn" on:click={() => showSettings = false}>Cancel</button>
        <button class="save-btn" on:click={() => showSettings = false}>Save Settings</button>
      </div>
    </div>
  </div>
{/if}
