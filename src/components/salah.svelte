<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { 
        prayerTimesStore, hijriDateStore, locationStore, prayerSettingsStore,
        initializePrayerTimes, refreshPrayerTimes, type PrayerTimes, type Location
    } from '../modules/salah';
    import { t } from '$lib/i18n';
    import { fade } from 'svelte/transition';
    import PrayerSettings from './prayerSettings.svelte';
    
    // Extended types for night prayer times
    type ExtendedPrayers = keyof PrayerTimes | 'tahajjud' | 'last-third';
    
    let prayerTimes: PrayerTimes = {
        fajr: '',
        sunrise: '',
        dhuhr: '',
        asr: '',
        maghrib: '',
        isha: '',
        midnight: ''
    };
    
    // Add loading states and cache
    let isLoadingNew = false; // For background loading
    let cachedData = null; // For storing cached data from localStorage
    let isRefreshing = false; // For reload button state
    
    // Initialize location state
    let hijriDate = '';
    let location: Location | null = null;
    let isLoading = true;
    let error: string | null = null;
    
    let currentPrayer: ExtendedPrayers = 'fajr';
    let nextPrayer: ExtendedPrayers = 'dhuhr';
    let passedPrayers: string[] = [];
    let timeRemaining = '';
    let isFullscreen = false;
    let scrollTimeout: NodeJS.Timeout;
    let touchTimeout: NodeJS.Timeout;
    let updateInterval: NodeJS.Timeout;
    let isTransitioning = false;
    let isInitialLoad = true;
    let fadeState = "visible"; // "visible", "hidden", "fading-in", "fading-out"
    let showScrollNote = false;
    let isMobile = false;
    let startY = 0;
    let startX = 0;
    let isFirstVisit = true; // Track whether this is the first visit
    let showSettings = false;
    let isExtendedView = false; // Track extended state

    $: showScrollNote = isFirstVisit; // Always show for first-time visitors regardless of mode

    // Get bezels from parent component
    let containerHeight = '100%';
    let containerWidth = '100%';

    function calculateMidnight(isha: string, fajr: string): string {
        const timeToMinutes = (timeStr: string) => {
            if (!timeStr) return 0;
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };

        const ishaMinutes = timeToMinutes(isha);
        const fajrMinutes = timeToMinutes(fajr);
        
        // If fajr is next day
        let totalNightMinutes = fajrMinutes - ishaMinutes;
        if (totalNightMinutes < 0) {
            totalNightMinutes += 24 * 60; // Add 24 hours
        }
        
        const midnightMinutes = ishaMinutes + (totalNightMinutes / 2);
        const midnightHours = Math.floor(midnightMinutes / 60) % 24;
        const midnightMins = Math.floor(midnightMinutes % 60);
        
        return `${midnightHours.toString().padStart(2, '0')}:${midnightMins.toString().padStart(2, '0')}`;
    }

    function calculateFirstThird(isha: string, fajr: string): string {
        const timeToMinutes = (timeStr: string) => {
            if (!timeStr) return 0;
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };

        const ishaMinutes = timeToMinutes(isha);
        const fajrMinutes = timeToMinutes(fajr);
        
        // If fajr is next day
        let totalNightMinutes = fajrMinutes - ishaMinutes;
        if (totalNightMinutes < 0) {
            totalNightMinutes += 24 * 60; // Add 24 hours
        }
        
        const firstThirdMinutes = ishaMinutes + (totalNightMinutes / 3);
        const firstThirdHours = Math.floor(firstThirdMinutes / 60) % 24;
        const firstThirdMins = Math.floor(firstThirdMinutes % 60);
        
        return `${firstThirdHours.toString().padStart(2, '0')}:${firstThirdMins.toString().padStart(2, '0')}`;
    }

    // Add last third of the night calculation function
    function calculateLastThird(isha: string, fajr: string): string {
        const timeToMinutes = (timeStr: string) => {
            if (!timeStr) return 0;
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };

        const ishaMinutes = timeToMinutes(isha);
        const fajrMinutes = timeToMinutes(fajr);
        
        // If fajr is next day
        let totalNightMinutes = fajrMinutes - ishaMinutes;
        if (totalNightMinutes < 0) {
            totalNightMinutes += 24 * 60; // Add 24 hours
        }
        
        const lastThirdMinutes = ishaMinutes + (totalNightMinutes * 2 / 3);
        const lastThirdHours = Math.floor(lastThirdMinutes / 60) % 24;
        const lastThirdMins = Math.floor(lastThirdMinutes % 60);
        
        return `${lastThirdHours.toString().padStart(2, '0')}:${lastThirdMins.toString().padStart(2, '0')}`;
    }
    
    function updatePrayerStatus() {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        const timeToMinutes = (timeStr: string) => {
            if (!timeStr) return 0;
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };

        // Calculate additional prayer times for presentation
        const midnight = calculateMidnight(prayerTimes.isha, prayerTimes.fajr);
        const firstThird = calculateFirstThird(prayerTimes.isha, prayerTimes.fajr);
        const lastThird = calculateLastThird(prayerTimes.isha, prayerTimes.fajr);

        // Add these to a complete prayer times object for status calculation
        // Note: We don't add this to the main prayerTimes object to avoid modifying it
        const allPrayerTimes = {
            ...prayerTimes,
            tahajjud: firstThird,   // First third of the night
            'last-third': lastThird // Last third of the night
        };

        // Get all prayers sorted by time
        const prayers = Object.entries(allPrayerTimes).sort((a, b) => {
            return timeToMinutes(a[1]) - timeToMinutes(b[1]);
        });
        
        passedPrayers = [];
        let foundNext = false;

        // Find which prayers have passed and which is next
        for (let i = 0; i < prayers.length; i++) {
            const [prayer, time] = prayers[i];
            const prayerMinutes = timeToMinutes(time);
            
            if (currentTime < prayerMinutes && !foundNext) {
                // This is the next prayer
                nextPrayer = prayer as ExtendedPrayers;
                
                // Current prayer is the previous one or the last one of the day
                if (i > 0) {
                    currentPrayer = prayers[i-1][0] as ExtendedPrayers;
                } else {
                    // If next prayer is the first of the day, current is the last of previous day
                    currentPrayer = prayers[prayers.length-1][0] as ExtendedPrayers;
                }
                
                foundNext = true;
                
                // Add all prayers before next to passed prayers except current
                for (let j = 0; j < i; j++) {
                    if (prayers[j][0] !== currentPrayer) {
                        passedPrayers.push(prayers[j][0]);
                    }
                }
            }
        }
        
        // If no upcoming prayer found, they've all passed for today
        if (!foundNext) {
            nextPrayer = prayers[0][0] as ExtendedPrayers; // First prayer of next day
            currentPrayer = prayers[prayers.length-1][0] as ExtendedPrayers; // Last prayer of today
            
            // All prayers except current have passed
            passedPrayers = prayers
                .filter(([prayer]) => prayer !== currentPrayer)
                .map(([prayer]) => prayer);
        }
        
        updateTimeRemaining();
    }

    function updateTimeRemaining() {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        const timeToMinutes = (timeStr: string) => {
            if (!timeStr) return 0;
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };

        // Need to handle special case for non-standard prayer times
        let nextPrayerTime: number;
        
        if (nextPrayer === 'tahajjud') {
            nextPrayerTime = timeToMinutes(calculateFirstThird(prayerTimes.isha, prayerTimes.fajr));
        } else if (nextPrayer === 'last-third') {
            nextPrayerTime = timeToMinutes(calculateLastThird(prayerTimes.isha, prayerTimes.fajr));
        } else if (nextPrayer === 'midnight') {
            nextPrayerTime = timeToMinutes(calculateMidnight(prayerTimes.isha, prayerTimes.fajr));
        } else {
            // For standard prayer times, access from prayerTimes object
            nextPrayerTime = timeToMinutes(prayerTimes[nextPrayer as keyof PrayerTimes]);
        }
        
        let diff = nextPrayerTime - currentTime;
        
        if (diff < 0) {
            diff += 24 * 60; // Add 24 hours if we've wrapped around to next day
        }

        const hours = Math.floor(diff / 60);
        const minutes = diff % 60;
        timeRemaining = `${hours}h ${minutes}m`;
    }

    $: if (prayerTimes.fajr) {
        updatePrayerStatus();
        // Clear any existing interval
        if (updateInterval) {
            clearInterval(updateInterval);
        }
        // Set new interval
        updateInterval = setInterval(() => {
            updatePrayerStatus();
        }, 60000);
        
        document.documentElement.style.setProperty('--passed-count', passedPrayers.length.toString());
    }

    function checkMobile() {
        isMobile = window.innerWidth <= 768;
    }
    
    // First, modify the handleTouchMove function to only respond to horizontal swipes
    function handleTouchMove(event: TouchEvent) {
        if (isTransitioning) return;
        
        const currentY = event.touches[0].clientY;
        const currentX = event.touches[0].clientX;
        const diffY = startY - currentY;
        const diffX = startX - currentX;
        
        // Only respond to vertical swipes (ignore horizontal swipes)
        // This is to avoid conflict with page swiping in +page.svelte
        if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 50) {
            clearTimeout(touchTimeout);
            touchTimeout = setTimeout(() => {
                if (diffY > 0) {
                    // Swipe up - show fullscreen
                    toggleFullscreen();
                } else {
                    // Swipe down - show compact view
                    if (isFullscreen) {
                        toggleFullscreen();
                    }
                }
            }, 50);
        }
    }
    
    // Add startX to track horizontal movement too
    function handleTouchStart(event: TouchEvent) {
        if (isTransitioning) return;
        startY = event.touches[0].clientY;
        startX = event.touches[0].clientX;
    }
    
    function toggleFullscreen() {
        if (isTransitioning) return;
        
        isTransitioning = true;
        
        // Remember there was a scroll note
        const hadScrollNote = showScrollNote;
        
        // Temporarily hide scroll note during transition
        if (hadScrollNote) {
            showScrollNote = false;
        }
        
        // Step 1: Fade out completely
        fadeState = "fading-out";
        
        // Step 2: Wait for fade out to complete, then reposition
        setTimeout(() => {
            fadeState = "hidden";
            
            // Switch layout mode immediately after elements are hidden
            setTimeout(() => {
                // Logic for three-step transition:
                // 1. Split view -> Basic fullscreen
                // 2. Basic fullscreen -> Extended fullscreen
                // 3. Extended fullscreen -> Split view
                
                if (!isFullscreen) {
                    // Step 1 -> Step 2: Switch to basic fullscreen
                    isFullscreen = true;
                    // Track extended state in a variable instead of relying on DOM
                    isExtendedView = false;
                } else if (!isExtendedView) {
                    // Step 2 -> Step 3: Switch to extended fullscreen
                    isExtendedView = true;
                } else {
                    // Step 3 -> Step 1: Back to split view
                    isFullscreen = false;
                    isExtendedView = false;
                }
                
                // Step 3: Begin fade in after layout change is complete
                setTimeout(() => {
                    fadeState = "fading-in";
                    
                    // Step 4: Complete
                    setTimeout(() => {
                        fadeState = "visible";
                        isTransitioning = false;
                        
                        // Restore scroll note if needed
                        if (hadScrollNote) {
                            setTimeout(() => {
                                showScrollNote = true;
                            }, 300); // Add slight delay before showing the note again
                        }
                    }, 400);
                }, 50);
            }, 50);
        }, 400); // Wait for fade out to complete
    }
    
    function handleScroll(event: WheelEvent) {
        if (isTransitioning) return;
        
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            toggleFullscreen();
        }, 50);
    }

    // Function to load cached data from localStorage
    function loadCachedData() {
        try {
            const cached = localStorage.getItem('prayer_cache');
            if (cached) {
                const parsedCache = JSON.parse(cached);
                // Check if cache is still valid (less than 24 hours old)
                if (parsedCache && parsedCache.timestamp && 
                    (Date.now() - parsedCache.timestamp < 24 * 60 * 60 * 1000)) {
                    const data = parsedCache.data;
                    // Use cached data immediately while fresh data loads
                    if (data) {
                        prayerTimes = data.prayerTimes;
                        hijriDate = data.hijriDate;
                        location = data.location;
                        isLoading = false; // Stop showing loading indicator if we have cached data
                        return true;
                    }
                }
            }
            return false;
        } catch (e) {
            console.error('Error loading cached prayer data:', e);
            return false;
        }
    }
    
    // Function to save data to cache
    function saveCacheData(data: {prayerTimes: PrayerTimes, hijriDate: string, location: Location}) {
        try {
            const cacheObject = {
                timestamp: Date.now(),
                data: data
            };
            localStorage.setItem('prayer_cache', JSON.stringify(cacheObject));
        } catch (e) {
            console.error('Error saving prayer data to cache:', e);
        }
    }
    
    // Function to refresh data in background
    async function updatePrayerTimes() {
        try {
            isLoadingNew = true;
            isRefreshing = true; // Set reload button to loading state
            
            // Create subscription variables to track value changes
            let lastPrayerTimes = { ...prayerTimes };
            let lastHijriDate = hijriDate;
            let lastLocation = { ...location };
            let hasUpdated = false;
            
            // Subscribe to stores and wait for values to update
            const unsubscribePrayerTimes = prayerTimesStore.subscribe((value) => {
                if (value) {
                    prayerTimes = value;
                    // Check if values have actually changed
                    if (JSON.stringify(prayerTimes) !== JSON.stringify(lastPrayerTimes)) {
                        hasUpdated = true;
                    }
                }
            });
            
            const unsubscribeHijriDate = hijriDateStore.subscribe((value) => {
                if (value) {
                    hijriDate = value;
                    // Check if hijri date has changed
                    if (hijriDate !== lastHijriDate) {
                        console.log('Hijri date updated from', lastHijriDate, 'to', hijriDate);
                        hasUpdated = true;
                    }
                }
            });
            
            const unsubscribeLocation = locationStore.subscribe((value) => {
                if (value) {
                    location = value;
                    // Check if location has changed
                    if (JSON.stringify(location) !== JSON.stringify(lastLocation)) {
                        hasUpdated = true;
                    }
                }
            });
            
            // Call the refresh function from the salah module
            await refreshPrayerTimes();
            
            // Wait a short while to ensure all store updates have been processed
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Save data to cache
            if (prayerTimes && hijriDate && location) {
                saveCacheData({
                    prayerTimes,
                    hijriDate,
                    location
                });
            }
            
            // Clean up subscriptions
            unsubscribePrayerTimes();
            unsubscribeHijriDate();
            unsubscribeLocation();
            
            // Force UI update if needed
            if (!hasUpdated) {
                // If no updates were detected via subscription, force a UI update
                prayerTimes = { ...prayerTimes };
            }
            
            // Show success toast
            if (browser) {
                try {
                    // Create a simple toast element
                    const toast = document.createElement('div');
                    toast.className = 'toast';
                    toast.textContent = t('prayer_times_updated');
                    document.body.appendChild(toast);
                    
                    // Remove after 3 seconds
                    setTimeout(() => {
                        toast.remove();
                    }, 3000);
                } catch (e) {
                    console.error('Error showing toast:', e);
                }
            }
        } catch (err) {
            console.error('Error refreshing prayer times:', err);
            
            // Show error toast
            if (browser) {
                try {
                    const toast = document.createElement('div');
                    toast.className = 'toast error';
                    toast.textContent = t('error_updating_prayer_times');
                    document.body.appendChild(toast);
                    
                    // Remove after 3 seconds
                    setTimeout(() => {
                        toast.remove();
                    }, 3000);
                } catch (e) {
                    console.error('Error showing toast:', e);
                }
            }
        } finally {
            isLoadingNew = false;
            isRefreshing = false; // Reset reload button state
        }
    }
    
    // Handle settings save
    function handleSettingsSave() {
        updatePrayerTimes();
    }

    async function initializePrayerTimesData() {
        try {
            isLoading = true;
            error = null;
            
            // Try to load from cache first
            const hasCachedData = loadCachedData();
            
            // If no cache, initialize from module
            if (!hasCachedData) {
                // Subscribe to stores to get prayer times data
                const unsubscribePrayerTimes = prayerTimesStore.subscribe((value) => {
                    if (value) prayerTimes = value;
                });
                
                const unsubscribeHijriDate = hijriDateStore.subscribe((value) => {
                    if (value) hijriDate = value;
                });
                
                const unsubscribeLocation = locationStore.subscribe((value) => {
                    if (value) location = value;
                });
                
                // Initialize prayer times from the module
                await initializePrayerTimes();
                
                // Still load fresh data in background
                isLoadingNew = true;
                updatePrayerTimes();
            }
        } catch (err) {
            error = err instanceof Error ? err.message : 'An unknown error occurred';
            console.error('Error getting prayer times:', err);
        } finally {
            isLoading = false;
            
            // After a short delay, remove the initial load state for smooth animation
            setTimeout(() => {
                isInitialLoad = false;
            }, 300);
        }
    }

    onMount(() => {
        initializePrayerTimesData();
        checkMobile();
        
        // Load Material Icons font if not already loaded
        if (!document.getElementById('material-icons-font')) {
            const link = document.createElement('link');
            link.id = 'material-icons-font';
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@48,400,0,0';
            document.head.appendChild(link);
        }
        
        // Check if user has visited before
        if (localStorage.getItem('salahComponentVisited') === 'true') {
            isFirstVisit = false;
        } else {
            // Set flag for next time
            localStorage.setItem('salahComponentVisited', 'true');
        }
        
        window.addEventListener('wheel', handleScroll);
        window.addEventListener('resize', checkMobile);
        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
        
        return () => {
            // Clean up all event listeners
            window.removeEventListener('wheel', handleScroll);
            window.removeEventListener('resize', checkMobile);
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            
            // Clear all timeouts
            clearTimeout(scrollTimeout);
            clearTimeout(touchTimeout);
            
            // Clear the update interval
            if (updateInterval) {
                clearInterval(updateInterval);
            }
            
            // Remove the material icons font link if it exists
            const materialIconsLink = document.getElementById('material-icons-font');
            if (materialIconsLink) {
                materialIconsLink.remove();
            }
        };
    });
</script>

<div class="layout" class:fullscreen={isFullscreen} class:extended={isExtendedView} class:transitioning={isTransitioning} class:initial-load={isInitialLoad}
    class:fade-out={fadeState === "fading-out"} 
    class:hidden={fadeState === "hidden"} 
    class:fade-in={fadeState === "fading-in"} 
    class:visible={fadeState === "visible"}
    class:mobile={isMobile}>
    
    {#if !isFullscreen}
    <div class="current-prayer" class:hidden={isFullscreen} data-prayer={currentPrayer}>
        {#if isLoading}
            <div class="generation-indicator">
                <div class="galaxy-loader">
                <div class="crescent-moon"></div>
                <div class="star star-1"></div>
                <div class="star star-2"></div>
                <div class="star star-3"></div>
                <div class="star star-4"></div>
                <div class="star star-5"></div>
                </div>
                <div class="status-text">{t('loading_prayer_times')}</div>
            </div>
        {:else if error}
            <div class="error">
                <p>{error}</p>
                <button on:click={initializePrayerTimesData}>{t('retry')}</button>
            </div>
        {:else if currentPrayer}
            <div class="header">
                <div class="header-top">
                    <p class="hijri">{hijriDate}</p>
                    <div class="buttons-container">
                        <button class="icon-btn reload-btn" on:click={updatePrayerTimes} aria-label="Reload location" disabled={isRefreshing}>
                            <span class="material-symbols-rounded">{isRefreshing ? 'sync' : 'refresh'}</span>
                        </button>
                        <button class="icon-btn settings-btn" on:click={() => showSettings = true} aria-label="Settings">
                            <span class="material-symbols-rounded">settings</span>
                        </button>
                    </div>
                </div>
                <p class="location">{location && (location.city || location.country) ? 
                    `${location.city || ''}, ${location.country || ''}` : 
                    t('unknown_location')}</p>
            </div>
            <div class="next-prayer">
                <div class="countdown">
                    <p class="time">{timeRemaining}</p>
                    <p class="subtitle">{t('until')} {
                        nextPrayer === 'tahajjud' ? t('prayer_names.first_third') :
                        nextPrayer === 'last-third' ? t('prayer_names.last_third') :
                        t(`prayer_names.${nextPrayer}`)
                    }</p>
                </div>
            </div>
            <div class="prayer-info">
                <div class="prayer-details">
                    <h2>{t(`prayer_names.${currentPrayer}`)}</h2>
                    <p class="time">{
                        currentPrayer === 'tahajjud' ? calculateFirstThird(prayerTimes.isha, prayerTimes.fajr) :
                        currentPrayer === 'last-third' ? calculateLastThird(prayerTimes.isha, prayerTimes.fajr) :
                        prayerTimes[currentPrayer as keyof PrayerTimes]
                    }</p>
                </div>
            </div>
        {/if}
    </div>
    {/if}
    
    <div class="prayer-list" class:fullscreen={isFullscreen}>
        <div class="prayer-list-overlay"></div>
        {#if isLoading}
            <div class="generation-indicator">
                <div class="galaxy-loader">
                <div class="crescent-moon"></div>
                <div class="star star-1"></div>
                <div class="star star-2"></div>
                <div class="star star-3"></div>
                <div class="star star-4"></div>
                <div class="star star-5"></div>
                </div>
                <div class="status-text">{t('loading_prayer_times')}</div>
            </div>
        {:else if error}
            <div class="error">
                <p>{error}</p>
                <button on:click={initializePrayerTimesData}>{t('retry')}</button>
            </div>
        {:else}
            <div class="prayer-grid">
                {#if !isFullscreen}
                    {#if currentPrayer === 'isha'}
                        <!-- Show night prayers after Isha: midnight, first third, last third, and fajr -->
                        <div class="prayer-time" data-prayer="midnight" style="--index: 0">
                            <div class="prayer-list-info">
                                {#if isMobile}
                                    <p class="prayer-name">{t('prayer_names.midnight')}</p>
                                    <div class="time-display">
                                        <p class="time">{calculateMidnight(prayerTimes.isha, prayerTimes.fajr)}</p>
                                    </div>
                                {:else}
                                    <div class="time-display">
                                        <p class="time">{calculateMidnight(prayerTimes.isha, prayerTimes.fajr)}</p>
                                    </div>
                                    <p class="prayer-name">{t('prayer_names.midnight')}</p>
                                {/if}
                            </div>
                        </div>
                        <div class="prayer-time" data-prayer="tahajjud" style="--index: 1">
                            <div class="prayer-list-info">
                                {#if isMobile}
                                    <p class="prayer-name">{t('prayer_names.first_third')}</p>
                                    <div class="time-display">
                                        <p class="time">{calculateFirstThird(prayerTimes.isha, prayerTimes.fajr)}</p>
                                    </div>
                                {:else}
                                    <div class="time-display">
                                        <p class="time">{calculateFirstThird(prayerTimes.isha, prayerTimes.fajr)}</p>
                                    </div>
                                    <p class="prayer-name">{t('prayer_names.first_third')}</p>
                                {/if}
                            </div>
                        </div>
                        <div class="prayer-time" data-prayer="last-third" style="--index: 2">
                            <div class="prayer-list-info">
                                {#if isMobile}
                                    <p class="prayer-name">{t('prayer_names.last_third')}</p>
                                    <div class="time-display">
                                        <p class="time">{calculateLastThird(prayerTimes.isha, prayerTimes.fajr)}</p>
                                    </div>
                                {:else}
                                    <div class="time-display">
                                        <p class="time">{calculateLastThird(prayerTimes.isha, prayerTimes.fajr)}</p>
                                    </div>
                                    <p class="prayer-name">{t('prayer_names.last_third')}</p>
                                {/if}
                            </div>
                        </div>
                        <div class="prayer-time" data-prayer="fajr" style="--index: 3">
                            <div class="prayer-list-info">
                                {#if isMobile}
                                    <p class="prayer-name">{t('prayer_names.fajr')}</p>
                                    <div class="time-display">
                                        <p class="time">{prayerTimes.fajr}</p>
                                    </div>
                                {:else}
                                    <div class="time-display">
                                        <p class="time">{prayerTimes.fajr}</p>
                                    </div>
                                    <p class="prayer-name">{t('prayer_names.fajr')}</p>
                                {/if}
                            </div>
                        </div>
                    {:else if currentPrayer === 'midnight'}
                        <!-- Show appropriate prayers after midnight: last third and fajr -->
                        <div class="prayer-time" data-prayer="last-third" style="--index: 0">
                            <div class="prayer-list-info">
                                {#if isMobile}
                                    <p class="prayer-name">{t('prayer_names.last_third')}</p>
                                    <div class="time-display">
                                        <p class="time">{calculateLastThird(prayerTimes.isha, prayerTimes.fajr)}</p>
                                    </div>
                                {:else}
                                    <div class="time-display">
                                        <p class="time">{calculateLastThird(prayerTimes.isha, prayerTimes.fajr)}</p>
                                    </div>
                                    <p class="prayer-name">{t('prayer_names.last_third')}</p>
                                {/if}
                            </div>
                        </div>
                        <div class="prayer-time" data-prayer="fajr" style="--index: 1">
                            <div class="prayer-list-info">
                                {#if isMobile}
                                    <p class="prayer-name">{t('prayer_names.fajr')}</p>
                                    <div class="time-display">
                                        <p class="time">{prayerTimes.fajr}</p>
                                    </div>
                                {:else}
                                    <div class="time-display">
                                        <p class="time">{prayerTimes.fajr}</p>
                                    </div>
                                    <p class="prayer-name">{t('prayer_names.fajr')}</p>
                                {/if}
                            </div>
                        </div>
                    {:else if currentPrayer === 'tahajjud'}
                        <!-- Show appropriate prayers after first third: midnight, last third and fajr -->
                        <div class="prayer-time" data-prayer="midnight" style="--index: 0">
                            <div class="prayer-list-info">
                                {#if isMobile}
                                    <p class="prayer-name">{t('prayer_names.midnight')}</p>
                                    <div class="time-display">
                                        <p class="time">{calculateMidnight(prayerTimes.isha, prayerTimes.fajr)}</p>
                                    </div>
                                {:else}
                                    <div class="time-display">
                                        <p class="time">{calculateMidnight(prayerTimes.isha, prayerTimes.fajr)}</p>
                                    </div>
                                    <p class="prayer-name">{t('prayer_names.midnight')}</p>
                                {/if}
                            </div>
                        </div>
                        <div class="prayer-time" data-prayer="last-third" style="--index: 1">
                            <div class="prayer-list-info">
                                {#if isMobile}
                                    <p class="prayer-name">{t('prayer_names.last_third')}</p>
                                    <div class="time-display">
                                        <p class="time">{calculateLastThird(prayerTimes.isha, prayerTimes.fajr)}</p>
                                    </div>
                                {:else}
                                    <div class="time-display">
                                        <p class="time">{calculateLastThird(prayerTimes.isha, prayerTimes.fajr)}</p>
                                    </div>
                                    <p class="prayer-name">{t('prayer_names.last_third')}</p>
                                {/if}
                            </div>
                        </div>
                        <div class="prayer-time" data-prayer="fajr" style="--index: 2">
                            <div class="prayer-list-info">
                                {#if isMobile}
                                    <p class="prayer-name">{t('prayer_names.fajr')}</p>
                                    <div class="time-display">
                                        <p class="time">{prayerTimes.fajr}</p>
                                    </div>
                                {:else}
                                    <div class="time-display">
                                        <p class="time">{prayerTimes.fajr}</p>
                                    </div>
                                    <p class="prayer-name">{t('prayer_names.fajr')}</p>
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <!-- Default case for regular prayers -->
                        {#each Object.entries(prayerTimes || {})
                            .filter(([prayer]) => {
                                // Skip specific prayers based on current prayer time
                                if (prayer === 'midnight' && currentPrayer !== 'isha' && 
                                    currentPrayer !== 'tahajjud' && currentPrayer !== 'last-third') return false;
                                
                                // Define prayer order (fajr first)
                                const prayerOrder = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha', 'midnight'];
                                const currentPrayerIndex = prayerOrder.indexOf(currentPrayer);
                                const thisPrayerIndex = prayerOrder.indexOf(prayer);
                                
                                // Show prayers that come after the current one in the day cycle
                                // If we're at isha, show midnight, fajr, and sunrise
                                if (currentPrayer === 'isha') {
                                    return prayer === 'midnight' || prayer === 'fajr' || prayer === 'sunrise';
                                }
                                
                                // Otherwise show only prayers that come after current in the order
                                return thisPrayerIndex > currentPrayerIndex;
                            })
                            .sort((a, b) => {
                                // Define prayer order (fajr first)
                                const prayerOrder = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha', 'midnight'];
                                
                                // Get indices in the prayer order
                                const indexA = prayerOrder.indexOf(a[0]);
                                const indexB = prayerOrder.indexOf(b[0]);
                                
                                // If current prayer is isha, we need special handling for next-day prayers
                                if (currentPrayer === 'isha') {
                                    // For prayers after midnight (fajr, sunrise), assign them higher indices
                                    const adjustedIndexA = a[0] === 'fajr' || a[0] === 'sunrise' ? indexA + 10 : indexA;
                                    const adjustedIndexB = b[0] === 'fajr' || b[0] === 'sunrise' ? indexB + 10 : indexB;
                                    return adjustedIndexA - adjustedIndexB;
                                }
                                
                                // Normal case: sort by prayer order
                                return indexA - indexB;
                            }) as [prayer, time], i}
                            <div 
                                class="prayer-time" 
                                data-prayer={prayer}
                                style="--index: {i}"
                            >
                                <div class="prayer-list-info">
                                    {#if isMobile}
                                        <p class="prayer-name">{t(`prayer_names.${prayer}`)}</p>
                                        <div class="time-display">
                                            <p class="time">{time}</p>
                                        </div>
                                    {:else}
                                        <div class="time-display">
                                            <p class="time">{time}</p>
                                        </div>
                                        <p class="prayer-name">{t(`prayer_names.${prayer}`)}</p>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    {/if}
                {:else}
                    <!-- Fullscreen mode -->
                    {#if !isExtendedView}
                        <!-- Basic fullscreen - only show main 5 prayers without sunrise -->
                        {#each Object.entries(prayerTimes || {})
                            .filter(([prayer]) => prayer !== 'midnight' && prayer !== 'sunrise')
                            .sort((a, b) => {
                                // Define prayer order
                                const prayerOrder = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
                                return prayerOrder.indexOf(a[0]) - prayerOrder.indexOf(b[0]);
                            }) as [prayer, time], i}
                            <div 
                                class="prayer-time fullscreen" 
                                data-prayer={prayer}
                                style="--index: {i}"
                            >
                                <div class="prayer-list-info">
                                    <p class="prayer-name">{t(`prayer_names.${prayer}`)}</p>
                                    <div class="time-display">
                                        <p class="time">{time}</p>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    {:else}
                        <!-- Extended fullscreen - show ALL prayers (standard + night prayers) -->
                        <!-- Standard prayers first -->
                        {#each Object.entries(prayerTimes || {})
                            .filter(([prayer]) => prayer !== 'midnight')
                            .sort((a, b) => {
                                // Define prayer order
                                const prayerOrder = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
                                return prayerOrder.indexOf(a[0]) - prayerOrder.indexOf(b[0]);
                            }) as [prayer, time], i}
                            <div 
                                class="prayer-time fullscreen" 
                                data-prayer={prayer}
                                style="--index: {i}"
                            >
                                <div class="prayer-list-info">
                                    <p class="prayer-name">{t(`prayer_names.${prayer}`)}</p>
                                    <div class="time-display">
                                        <p class="time">{time}</p>
                                    </div>
                                </div>
                            </div>
                        {/each}
                        
                        <!-- First third of night -->
                        <div class="prayer-time fullscreen" data-prayer="tahajjud" style="--index: {Object.keys(prayerTimes || {}).filter(p => p !== 'midnight').length}">
                            <div class="prayer-list-info">
                                <p class="prayer-name">{t('prayer_names.first_third')}</p>
                                <div class="time-display">
                                    <p class="time">{calculateFirstThird(prayerTimes.isha, prayerTimes.fajr)}</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Midnight -->
                        <div class="prayer-time fullscreen" data-prayer="midnight" style="--index: {Object.keys(prayerTimes || {}).filter(p => p !== 'midnight').length + 1}">
                            <div class="prayer-list-info">
                                <p class="prayer-name">{t('prayer_names.midnight')}</p>
                                <div class="time-display">
                                    <p class="time">{calculateMidnight(prayerTimes.isha, prayerTimes.fajr)}</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Last third of night -->
                        <div class="prayer-time fullscreen" data-prayer="last-third" style="--index: {Object.keys(prayerTimes || {}).filter(p => p !== 'midnight').length + 2}">
                            <div class="prayer-list-info">
                                <p class="prayer-name">{t('prayer_names.last_third')}</p>
                                <div class="time-display">
                                    <p class="time">{calculateLastThird(prayerTimes.isha, prayerTimes.fajr)}</p>
                                </div>
                            </div>
                        </div>
                    {/if}
                {/if}
            </div>
        {/if}
    </div>
    
    {#if showScrollNote && isFirstVisit}
        <div class="scroll-note" transition:fade={{duration: 500}}>
            {#if !isFullscreen}
                <span class="swipe-icon">⬆️</span>
                <span class="swipe-text">{t('scroll_to_see')}</span>
            {:else if isFullscreen && !isExtendedView}
                <span class="swipe-icon">⬆️</span>
                <span class="swipe-text">{t('scroll_for_more')}</span>
            {:else}
                <span class="swipe-icon">⬇️</span>
                <span class="swipe-text">{t('scroll_again')}</span>
            {/if}
        </div>
    {/if}
    
    {#if isMobile && isFirstVisit}
        {#if !isFullscreen}
            <div class="mobile-swipe-hint" transition:fade|local={{duration: 500}}>
                <div class="swipe-indicator">
                    <span class="swipe-arrow">↑</span>
                </div>
                <span class="swipe-text">{t('swipe_up_hint')}</span>
            </div>
        {:else if isFullscreen && !isExtendedView}
            <div class="mobile-swipe-hint" transition:fade|local={{duration: 500}}>
                <div class="swipe-indicator">
                    <span class="swipe-arrow">↑</span>
                </div>
                <span class="swipe-text">{t('swipe_for_more')}</span>
            </div>
        {:else}
            <div class="mobile-swipe-hint down" transition:fade|local={{duration: 500}}>
                <div class="swipe-indicator">
                    <span class="swipe-arrow">↓</span>
                </div>
                <span class="swipe-text">{t('swipe_down_hint')}</span>
            </div>
        {/if}
    {/if}
    
    <!-- Settings Modal -->
    {#if showSettings}
        <div class="settings-modal" transition:fade={{duration: 300}}>
            <div class="settings-modal-content">
                <button class="close-button" on:click={() => showSettings = false}>&times;</button>
                <h2>Prayer Settings</h2>
                <PrayerSettings on:save={handleSettingsSave} />
            </div>
        </div>
    {/if}
</div>

<style>
    :root {
        --text-opacity: 0.8;
        --view-mode: 1; /* 1: split, 2: basic fullscreen, 3: extended fullscreen */
    }
    
    .layout {
        --view-mode: 1;
        display: grid;
        grid-template-columns: 60% 40%;
        height: 100%;
        width: 100%;
        overflow: hidden;
        position: relative;
        transition: all 0.8s cubic-bezier(0.645, 0.045, 0.355, 1);
        font-family: "Onest", sans-serif;
        background: #000;
        border-radius: 8px;
        scrollbar-width: none;
        -ms-overflow-style: none;
        transform: translateZ(0); /* Force GPU acceleration */
    }
    
    /* Mobile layout */
    .layout.mobile {
        grid-template-columns: 1fr;
        grid-template-rows: 70% 30%;
    }
    
    .layout.mobile.fullscreen {
        grid-template-rows: 1fr;
    }
    
    .layout::-webkit-scrollbar {
        display: none; /* Hide scrollbar for Chrome, Safari and Opera */
    }
    
    /* Initial load animation */
    .layout.initial-load .current-prayer,
    .layout.initial-load .prayer-list {
        opacity: 0;
        transform: translateY(20px);
    }
    
    /* Simple 4-state transition system */
    .layout.fade-out .current-prayer,
    .layout.fade-out .prayer-list {
        opacity: 0;
        transition: opacity 0.4s ease-out;
    }
    
    .layout.hidden .current-prayer,
    .layout.hidden .prayer-list {
        opacity: 0;
    }
    
    .layout.fade-in .current-prayer,
    .layout.fade-in .prayer-list {
        opacity: 1;
        transition: opacity 0.4s ease-in;
    }
    
    .layout.visible .current-prayer,
    .layout.visible .prayer-list {
        opacity: 1;
    }
    
    .layout .current-prayer,
    .layout .prayer-list {
        transition: opacity 0.8s ease-out, transform 0.8s ease-out;
    }

    .layout.transitioning {
        pointer-events: none;
    }

    .layout.fullscreen {
        --view-mode: 2;
        grid-template-columns: 1fr;
    }
    
    .layout.fullscreen.extended {
        --view-mode: 3;
        grid-template-columns: 1fr;
    }
    
    .current-prayer {
        position: relative;
        padding: 3rem;
        display: flex;
        flex-direction: column;
        color: white;
        height: 100%;
        transition: all 0.5s cubic-bezier(0.645, 0.045, 0.355, 1);
        opacity: 1;
        border-radius: 8px 0 0 8px;
    }
    
    /* Mobile current prayer */
    .layout.mobile .current-prayer {
        border-radius: 8px 8px 0 0;
        padding: 2rem;
        max-height: none; /* Remove height limit */
        height: 100%; /* Take full height of container */
    }
    
    /* Prayer time backgrounds */
    .prayer-time[data-prayer="fajr"] {
        background: linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d);
    }

    .prayer-time[data-prayer="sunrise"] {
        background: linear-gradient(135deg, #FF9500, #ff2d00, #ffb01f);
    }

    .prayer-time[data-prayer="dhuhr"] {
        background: linear-gradient(135deg, #8ae068, #0072ff);
    }

    .prayer-time[data-prayer="asr"] {
        background: linear-gradient(135deg, #dda65e, #ef473a);
    }

    .prayer-time[data-prayer="maghrib"] {
        background: linear-gradient(135deg, #ef473a, #b42460);
    }

    .prayer-time[data-prayer="isha"] {
        background: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
    }

    .prayer-time[data-prayer="midnight"] {
        background: linear-gradient(135deg, #222222, #000000, #505050);
    }

    .prayer-time[data-prayer="tahajjud"] {
        background: linear-gradient(135deg, #0b122b, #3f0c41, #7a0270);
    }

    .prayer-time[data-prayer="last-third"] {
        background: linear-gradient(135deg, #2C3E50, #4B6CB7, #182848);
    }

    /* Current prayer backgrounds */
    .current-prayer[data-prayer="fajr"] {
        background: linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d);
    }

    .current-prayer[data-prayer="sunrise"] {
        background: linear-gradient(135deg, #FF9500, #ff2d00, #ffb01f);
    }

    .current-prayer[data-prayer="dhuhr"] {
        background: linear-gradient(135deg, #8ae068, #0072ff);
    }

    .current-prayer[data-prayer="asr"] {
        background: linear-gradient(135deg, #dda65e, #ef473a);
    }

    .current-prayer[data-prayer="maghrib"] {
        background: linear-gradient(135deg, #ef473a, #b42460);
    }

    .current-prayer[data-prayer="isha"] {
        background: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
    }

    .current-prayer[data-prayer="midnight"] {
        background: linear-gradient(135deg, #222222, #000000, #505050);
    }

    .current-prayer[data-prayer="tahajjud"] {
        background: linear-gradient(135deg, #0b122b, #3f0c41, #7a0270);
    }

    .current-prayer[data-prayer="last-third"] {
        background: linear-gradient(135deg, #2C3E50, #4B6CB7, #182848);
    }

    .current-prayer.hidden {
        opacity: 0;
        transform: translateX(-5%);
    }

    .header {
        position: absolute;
        top: 3rem;
        left: 3rem;
        right: 3rem;
        display: flex;
        flex-direction: column;
        z-index: 1;
    }
    
    .header-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
    }
    
    .layout.mobile .header {
        position: relative;
        top: 0;
        left: 0;
        right: 0;
        margin-bottom: 1rem;
    }
    
    .hijri {
        font-size: 2rem;
        color: rgba(255, 255, 255, var(--text-opacity));
        margin: 0;
        font-weight: 300;
    }
    
    .layout.mobile .hijri,
    .layout.mobile .location {
        font-size: 1.5rem;
    }

    .location {
        font-size: 2rem;
        color: rgba(255, 255, 255, var(--text-opacity));
        margin: 0;
        font-weight: 300;
        margin-top: 0.5rem;
        align-self: flex-start;
    }
    
    .buttons-container {
        display: flex;
        gap: 12px;
    }

    .next-prayer {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding-top: 2rem;
    }
    
    .layout.mobile .next-prayer {
        padding-top: 0.5rem;
    }

    .countdown {
        text-align: center;
    }

    .countdown .time {
        font-size: 10rem;
        font-weight: 200;
        line-height: 1;
        color: rgba(255, 255, 255, var(--text-opacity));
        margin: 0;
    }
    
    .layout.mobile .countdown .time {
        font-size: 6rem;
    }

    .countdown .subtitle {
        font-size: 2.5rem;
        color: rgba(255, 255, 255, var(--text-opacity));
        margin: 1rem 0 0 0;
        font-weight: 300;
        text-transform: lowercase;
    }
    
    .layout.mobile .countdown .subtitle {
        font-size: 1.8rem;
    }

    .prayer-info {
        position: absolute;
        bottom: 3rem;
        left: 3rem;
        right: 3rem;
        display: flex;
        justify-content: space-between;
        align-items: baseline;
    }
    
    .layout.mobile .prayer-info {
        position: relative;
        bottom: auto;
        left: auto;
        right: auto;
        margin-top: 1.5rem;
    }

    .prayer-list-info {
        position: relative;
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        z-index: 2;
        height: 100%;
        width: 100%;
    }

    .prayer-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        background-color: rgba(0, 0, 0, 0.15);
        padding: 1.5rem 2rem;
        border-radius: 1rem;
        backdrop-filter: blur(10px);
    }

    .prayer-details h2 {
        font-size: 2rem;
        color: rgba(255, 255, 255, var(--text-opacity));
        margin: 0;
        text-transform: lowercase;
        font-weight: 300;
    }

    .prayer-details .time {
        font-size: 3.5rem;
        font-weight: 200;
        color: rgba(255, 255, 255, var(--text-opacity));
        margin: 0;
        line-height: 1;
    }

    .prayer-list {
        position: relative;
        background: transparent;
        height: 100%;
        transition: all 0.5s cubic-bezier(0.645, 0.045, 0.355, 1);
        opacity: 1;
        display: flex;
        flex-direction: column;
        border-radius: 0 8px 8px 0;
        overflow: hidden;
        transform: translateZ(0);
    }
    
    .layout.mobile .prayer-list {
        border-radius: 0 0 8px 8px;
    }
    
    .prayer-list-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.6);
        z-index: 1;
        pointer-events: none;
        display: block;
    }
    
    .prayer-list.fullscreen .prayer-list-overlay {
        display: none;
    }
    
    .prayer-grid {
        display: grid;
        grid-template-columns: 1fr;
        grid-auto-rows: 1fr;
        height: 100%;
        overflow-y: auto;
        overflow-x: hidden;
        position: relative;
        z-index: 2;
        scrollbar-width: none;
        -ms-overflow-style: none;
        transform: translateZ(0);
    }
    
    .prayer-grid::-webkit-scrollbar {
        display: none; /* Hide scrollbar for Chrome, Safari and Opera */
    }
    
    /* Mobile prayer grid */
    .layout.mobile .prayer-grid {
        display: flex;
        flex-direction: column;
        align-items: center; /* Center prayer times */
        width: 100%;
        height: 100%; /* Take full height */
    }
    
    .layout.mobile:not(.fullscreen) .prayer-grid {
        max-height: none; /* Remove height limit */
        height: 100%; /* Take full height of container */
        overflow-y: auto;
        width: 100%; /* Ensure full width */
        padding: 0; /* Remove any padding */
        display: flex;
        flex-direction: column;
    }
    
    .layout.mobile:not(.fullscreen) .prayer-time {
        height: auto; /* Auto height */
        flex: 1; /* Equal distribution of space */
        min-height: 60px; /* Minimum height */
        max-height: none; /* Remove max height */
        flex-shrink: 0;
        width: 100%; /* Ensure full width */
        box-sizing: border-box; /* Include padding in width */
    }
    
    .layout.mobile.fullscreen .prayer-time {
        animation: mobileSlideIn 0.4s ease-out forwards;
        animation-delay: calc(var(--index) * 0.08s);
        width: 100%; /* Ensure full width */
        margin: 0; /* No margins in fullscreen */
        padding: 0; /* No padding in fullscreen */
        height: 20%; /* Maintain height proportion */
        min-height: 100px; /* Minimum height */
    }
    
    .prayer-list.fullscreen {
        width: 100%;
        padding: 0;
        border-radius: 8px;
    }
    
    .prayer-list.fullscreen .prayer-grid {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 0;
        height: 100%;
    }

    .prayer-time {
        position: relative;
        overflow: hidden;
    }
    
    /* Fullscreen prayer time styles */
    .prayer-time.fullscreen {
        flex: 1;
        height: 100%;
        animation: fadeSlideIn 0.5s ease-out forwards;
        animation-delay: calc(var(--index) * 0.1s);
        opacity: 0;
        padding: 0;
    }
    
    /* Add subtle hover effect for fullscreen view */
    .prayer-time.fullscreen:hover {
        transform: scale(1.02);
        z-index: 10;
    }
    
    /* Prayer time backgrounds */
    .prayer-time[data-prayer="fajr"] {
        background: linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d);
    }

    .prayer-time[data-prayer="sunrise"] {
        background: linear-gradient(135deg, #FF9500, #ff2d00, #ffb01f);
    }

    .prayer-time[data-prayer="dhuhr"] {
        background: linear-gradient(135deg, #8ae068, #0072ff);
    }

    .prayer-time[data-prayer="asr"] {
        background: linear-gradient(135deg, #dda65e, #ef473a);
    }

    .prayer-time[data-prayer="maghrib"] {
        background: linear-gradient(135deg, #ef473a, #b42460);
    }

    .prayer-time[data-prayer="isha"] {
        background: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
    }

    .prayer-time[data-prayer="midnight"] {
        background: linear-gradient(135deg, #222222, #000000, #505050);
    }

    .prayer-time[data-prayer="tahajjud"] {
        background: linear-gradient(135deg, #0b122b, #3f0c41, #7a0270);
    }

    .prayer-time[data-prayer="last-third"] {
        background: linear-gradient(135deg, #2C3E50, #4B6CB7, #182848);
    }

    .prayer-list .prayer-info, .prayer-list .prayer-list-info {
        position: relative;
        display: flex;
        height: 100%;
        width: 100%;
        padding: 0;
    }
    
    /* Layout for split view vs fullscreen */
    .prayer-time:not(.fullscreen) .prayer-info, .prayer-list .prayer-list-info {
        flex-direction: column;
        justify-content: space-between;
        align-items: flex-start;
        padding: 1rem;
        background-color: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(10px);
        height: auto;
        width: 100%;
        box-sizing: border-box;
    }
    
    .prayer-time:not(.fullscreen) .prayer-name {
        position: absolute;
        bottom: 16px;
        left: 16px;
        margin: 0;
    }
    
    .prayer-time:not(.fullscreen) .time-display {
        margin-bottom: 8px;
        width: 100%;
        text-align: center;
    }
    
    /* Only fix the mobile layout for correct left-right alignment */
    .layout.mobile .prayer-time:not(.fullscreen) .prayer-list-info {
        flex-direction: row !important;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1.25rem;
        width: 100%;
        box-sizing: border-box;
    }
    
    .layout.mobile .prayer-time:not(.fullscreen) .prayer-name {
        position: static;
        font-size: 1.5rem;
        text-align: left;
        margin: 0;
        order: 1; /* Force name to left */
    }

    .layout.mobile .prayer-time:not(.fullscreen) .time-display {
        margin-bottom: 0;
        width: auto;
        justify-content: flex-end; /* Align to right */
        text-align: right;
        order: 2; /* Force time to right */
    }
    
    /* Make fullscreen view have name left, time right */
    .prayer-time.fullscreen .prayer-info, .prayer-list.fullscreen .prayer-list-info {
        flex-direction: row !important;
        justify-content: space-between !important;
        align-items: center !important;
        padding: 1.5rem 2rem;
        background-color: rgba(0, 0, 0, 0);
        height: 100%;
        width: 100%;
        box-sizing: border-box;
    }
    
    .prayer-time.fullscreen .prayer-name {
        font-size: 2.5rem;
        position: static;
        order: 1; /* Name on left */
        margin: 0;
        padding: 0;
    }
    
    .prayer-time.fullscreen .time-display {
        order: 2; /* Time on right */
        width: auto;
        margin: 0;
        padding: 0;
        justify-content: flex-end;
        text-align: right;
    }
    
    .prayer-time.fullscreen .time {
        font-size: 2.5rem;
        line-height: 1;
        margin-right: 2rem;
    }

    .generation-indicator {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100%;
        width: 100%;
        position: relative;
        z-index: 2;
    }

    .galaxy-loader {
        position: relative;
        width: 100px;
        height: 100px;
        display: flex;
        justify-content: center;
        align-items: center;
        animation: galaxy-rotate 12s infinite linear;
        margin: 0 auto;
    }

    .crescent-moon {
        position: absolute;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: transparent;
        box-shadow: 15px 15px 0 0 #ffffff;
        animation: moon-pulse 3s infinite ease-in-out;
        transform-origin: 25% 25%;
    }

    .star {
        position: absolute;
        background-color: #ffffff;
        clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
        opacity: 0.8;
        animation: twinkle 3s infinite ease-in-out;
    }

    .star-1 {
        width: 12px;
        height: 12px;
        top: 10px;
        left: 50%;
        animation-delay: 0s;
    }

    .star-2 {
        width: 10px;
        height: 10px;
        top: 50%;
        right: 10px;
        animation-delay: 0.3s;
    }

    .star-3 {
        width: 14px;
        height: 14px;
        bottom: 10px;
        left: 50%;
        animation-delay: 0.6s;
    }

    .star-4 {
        width: 8px;
        height: 8px;
        top: 50%;
        left: 10px;
        animation-delay: 0.9s;
    }

    .star-5 {
        width: 16px;
        height: 16px;
        top: 30px;
        right: 30px;
        animation-delay: 1.2s;
    }

    @keyframes galaxy-rotate {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    @keyframes moon-pulse {
        0%, 100% { 
        transform: scale(0.9);
        opacity: 0.85;
        }
        50% { 
        transform: scale(1.1);
        opacity: 1;
        }
    }

    @keyframes twinkle {
        0%, 100% { 
        transform: scale(0.5);
        opacity: 0.5;
        }
        50% { 
        transform: scale(1.3);
        opacity: 1;
        }
    }


    .error {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100%;
        color: #ff4444;
        gap: 1rem;
        position: relative;
        z-index: 2;
    }

    .error button {
        background: none;
        border: 1px solid rgba(255, 255, 255, 0.7);
        color: rgba(255, 255, 255, 0.7);
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.3s ease;
    }

    .error button:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    @keyframes fadeSlideIn {
        from {
            opacity: 0;
            transform: translateX(20px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }

    .scroll-note {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: rgba(0, 0, 0, 0.85);
        color: white;
        padding: 10px 15px;
        border-radius: 5px;
        transition: opacity 0.5s ease;
        opacity: 1;
        z-index: 2000;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
    }
    
    .layout.mobile .scroll-note {
        font-size: 0.9rem;
        padding: 8px 12px;
    }

    .fade-in {
        opacity: 1;
    }

    .fade-out {
        opacity: 0;
    }

    .prayer-time:not(.fullscreen) {
        background-color: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(10px);
    }

    .prayer-time:not(.fullscreen) .prayer-list-info {
        padding: 1rem;
        height: auto;
        background: none;
        height: 100%;
        width: 100%;
    }

    /* Mobile time display adjustments */
    .layout.mobile .prayer-time:not(.fullscreen) .time-display {
        margin-bottom: 0;
        width: auto;
    }
    
    /* Better touch target sizes for mobile */
    .layout.mobile .prayer-time {
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    
    .layout.mobile .prayer-time:active {
        transform: scale(0.98);
    }
    
    /* Adjust animation for mobile fullscreen transitions */
    @keyframes mobileSlideIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .layout.mobile.fullscreen .prayer-time {
        animation: mobileSlideIn 0.4s ease-out forwards;
        animation-delay: calc(var(--index) * 0.08s);
        width: 100%; /* Ensure full width */
        margin: 0; /* No margins in fullscreen */
        padding: 0; /* No padding in fullscreen */
        height: 20%; /* Maintain height proportion */
        min-height: 100px; /* Minimum height */
    }
    
    .layout.mobile.fullscreen .prayer-list-info {
        width: 100%;
    }

    /* Swipe indicator for mobile */
    .swipe-indicator {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        width: 40px;
        height: 20px;
        opacity: 0.8;
        z-index: 1000;
        pointer-events: none;
        animation: pulseIndicator 2s infinite ease-in-out;
    }
    
    .swipe-indicator.up {
        bottom: 45px; 
        animation: bounceUp 2s infinite ease-in-out;
    }
    
    .swipe-indicator.down {
        bottom: 15px;
        animation: bounceDown 2s infinite ease-in-out;
    }
    
    .swipe-indicator .arrow {
        width: 12px;
        height: 12px;
        border-right: 3px solid white;
        border-bottom: 3px solid white;
        display: block;
        position: absolute;
        left: 50%;
        top: 50%;
        filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.7));
    }
    
    .swipe-indicator.up .arrow {
        transform: translate(-50%, -75%) rotate(225deg); /* Point up to indicate swipe up */
    }
    
    .swipe-indicator.down .arrow {
        transform: translate(-50%, -75%) rotate(45deg); /* Point down to indicate swipe down */
    }
    
    @keyframes bounceUp {
        0%, 100% {
            transform: translateX(-50%) translateY(0);
            opacity: 0.7;
        }
        50% {
            transform: translateX(-50%) translateY(5px);
            opacity: 1;
        }
    }
    
    @keyframes bounceDown {
        0%, 100% {
            transform: translateX(-50%) translateY(0);
            opacity: 0.7;
        }
        50% {
            transform: translateX(-50%) translateY(-5px);
            opacity: 1;
        }
    }
    
    @keyframes pulseIndicator {
        0%, 100% {
            opacity: 0.4;
            transform: translateX(-50%) scale(0.95);
        }
        50% {
            opacity: 0.8;
            transform: translateX(-50%) scale(1.05);
        }
    }

    /* Add subtle gradient overlays to improve contrast */
    .prayer-time::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0));
        pointer-events: none;
    }

    .layout.mobile:not(.fullscreen) .prayer-list {
        width: 100%;
        box-sizing: border-box;
    }

    /* Add a hint text next to the arrows */
    .swipe-indicator::after {
        content: attr(data-hint);
        position: absolute;
        color: white;
        font-size: 0.8rem;
        opacity: 0.9;
        white-space: nowrap;
        text-shadow: 0 0 5px rgba(0, 0, 0, 0.8);
    }
    
    .swipe-indicator.up::after {
        content: "Swipe up to see all prayer times"; 
        top: 25px;
        left: 50%;
        transform: translateX(-50%);
    }
    
    .swipe-indicator.down::after {
        content: "Go back";
        bottom: 25px;
        left: 50%;
        transform: translateX(-50%);
    }

    /* Add styles for the settings button */
    .settings-button {
        position: fixed;
        bottom: 15px;
        right: 15px;
        z-index: 1000;
        background-color: rgba(0, 0, 0, 0.6);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 50px;
        padding: 8px 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        transition: all 0.3s ease;
        backdrop-filter: blur(10px);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    }
    
    .settings-button:hover {
        background-color: rgba(0, 0, 0, 0.8);
        transform: translateY(-2px);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    }
    
    .settings-icon {
        width: 20px;
        height: 20px;
    }
    
    .settings-text {
        font-size: 14px;
        font-weight: 500;
    }
    
    /* Settings Modal */
    .settings-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(5px);
        z-index: 2000;
        display: flex;
        justify-content: center;
        align-items: center;
    }
    
    .settings-modal-content {
        background-color: #1e1e1e;
        border-radius: 12px;
        width: 90%;
        max-width: 500px;
        max-height: 90vh;
        overflow-y: auto;
        padding: 24px;
        position: relative;
        box-shadow: 0 5px 30px rgba(0, 0, 0, 0.5);
    }
    
    .settings-modal-content h2 {
        margin-top: 0;
        color: white;
        text-align: center;
        margin-bottom: 20px;
    }
    
    .close-button {
        position: absolute;
        top: 10px;
        right: 15px;
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .close-button:hover {
        transform: scale(1.2);
    }

    .location-wrapper {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        width: auto;
        gap: 12px;
    }
    
    .buttons-container {
        display: flex;
        gap: 12px;
    }
    
    .icon-btn {
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: rgba(255, 255, 255, 0.8);
        cursor: pointer;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        padding: 0;
        backdrop-filter: blur(4px);
    }
    
    .icon-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }
    
    .icon-btn:not(:disabled):hover {
        background-color: rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 1);
        transform: translateY(-2px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    
    .icon-btn:not(:disabled):active {
        transform: translateY(0);
    }
    
    .reload-btn:not(:disabled):active {
        transform: rotate(180deg);
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .reload-btn:disabled .material-symbols-rounded {
        animation: spin 1.5s linear infinite;
    }
    
    .material-symbols-rounded {
        font-size: 22px;
    }

    .time-display {
        width: 100%;
        text-align: center;
        margin-bottom: 8px;
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
    }
    
    .prayer-name {
        font-size: 2rem;
        font-weight: 300;
        color: rgba(255, 255, 255, var(--text-opacity));
        margin: 0;
        text-transform: lowercase;
        letter-spacing: 0.05em;
        position: absolute;
        bottom: 16px;
        left: 16px;
    }
    
    .prayer-time .time {
        font-size: 3rem;
        font-weight: 200;
        color: rgba(255, 255, 255, var(--text-opacity));
        margin: 0;
    }
    
    .layout.mobile .prayer-time:not(.fullscreen) .time {
        font-size: 1.5rem;
        text-align: right;
    }
    
    .prayer-time:not(.fullscreen) .time {
        font-size: 8rem;
        line-height: 1;
    }
    
    .layout.mobile .current-prayer .prayer-details {
        width: 100%; /* Full width */
        display: flex;
        flex-direction: row; /* Horizontal layout */
        justify-content: space-between; /* Space between name and time */
        align-items: center;
        background-color: rgba(0, 0, 0, 0.15);
        padding: 1.5rem 2rem;
        border-radius: 1rem;
        backdrop-filter: blur(10px);
    }
    
    .layout.mobile .current-prayer .prayer-details h2 {
        font-size: 2rem;
        font-weight: 300;
        margin: 0;
    }
    
    .layout.mobile .current-prayer .prayer-details .time {
        font-size: 2.5rem;
        font-weight: 200;
        margin: 0;
        line-height: 1;
    }

    /* Make fullscreen view have time right-aligned with proper margins */
    .prayer-time.fullscreen .time-display {
        order: 2; /* Time on right */
        width: auto;
        margin: 0;
        padding: 0;
        justify-content: flex-end;
        text-align: right;
    }
    
    .prayer-time.fullscreen .time {
        font-size: 2.5rem;
        line-height: 1;
        margin-right: 0;
        text-align: right;
    }
    
    .prayer-time.fullscreen .prayer-name {
        font-size: 2.5rem;
        position: static;
        order: 1; /* Name on left */
        margin: 0;
        padding: 0;
        margin-left: 2rem;
    }
    
    /* Make fullscreen list properly spaced with consistent margins */
    .prayer-time.fullscreen .prayer-info, .prayer-list.fullscreen .prayer-list-info {
        padding: 1.5rem 2rem;
    }

    /* Make font size in mobile fullscreen smaller */
    .layout.mobile.fullscreen .prayer-time .prayer-name {
        font-size: 1.8rem;
    }
    
    .layout.mobile.fullscreen .prayer-time .time {
        font-size: 1.8rem;
    }

    /* Animation for extended view */
    .layout.fullscreen.extended .prayer-time.fullscreen {
        animation: extendedSlideIn 0.6s ease-out forwards;
        animation-delay: calc(var(--index) * 0.12s);
        opacity: 0;
    }
    
    @keyframes extendedSlideIn {
        from {
            opacity: 0;
            transform: translateY(30px) scale(0.95);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }
    
    /* Enhance background gradients for extended view */
    .layout.fullscreen.extended .prayer-time[data-prayer="sunrise"] {
        background: linear-gradient(135deg, #FF9500, #ff2d00, #ffb01f);
    }
    
    .layout.fullscreen.extended .prayer-time[data-prayer="tahajjud"] {
        background: linear-gradient(135deg, #0b122b, #3f0c41, #7a0270);
    }
    
    .layout.fullscreen.extended .prayer-time[data-prayer="midnight"] {
        background: linear-gradient(135deg, #222222, #000000, #505050);
    }
    
    .layout.fullscreen.extended .prayer-time[data-prayer="last-third"] {
        background: linear-gradient(135deg, #2C3E50, #4B6CB7, #182848);
    }

    .toast {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #48BB78;
        color: white;
        padding: 12px 24px;
        border-radius: 4px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    }

    .toast.error {
        background-color: #F56565;
    }

    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
</style>
