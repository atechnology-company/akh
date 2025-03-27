<script lang="ts">
    import { onMount } from 'svelte';
    import { getPrayerData, type PrayerTimes } from '../modules/salah';
    
    let prayerTimes: PrayerTimes = {
        fajr: '',
        dhuhr: '',
        asr: '',
        maghrib: '',
        isha: ''
    };
    
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
    
    let currentPrayer: keyof typeof prayerTimes = 'fajr';
    let nextPrayer: keyof typeof prayerTimes = 'dhuhr';
    let passedPrayers: string[] = [];
    let timeRemaining = '';
    let isFullscreen = false;
    let scrollTimeout: NodeJS.Timeout;
    let hijriDate = '';
    let location = '';
    let isLoading = true;
    let error: string | null = null;
    let isTransitioning = false;
    let isInitialLoad = true;
    let fadeState = "visible"; // "visible", "hidden", "fading-in", "fading-out"
    let showScrollNote = false;
    let isMobile = false;
    let startY = 0;
    let touchTimeout: NodeJS.Timeout;
    let isFirstVisit = true; // Track whether this is the first visit

    $: showScrollNote = !isFullscreen && !isMobile;

    // Get bezels from parent component
    let containerHeight = '100%';
    let containerWidth = '100%';

    function updatePrayerStatus() {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        const timeToMinutes = (timeStr: string) => {
            if (!timeStr) return 0;
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };

        // Get all prayers sorted by time
        const prayers = Object.entries(prayerTimes).sort((a, b) => {
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
                nextPrayer = prayer as keyof typeof prayerTimes;
                
                // Current prayer is the previous one or the last one of the day
                if (i > 0) {
                    currentPrayer = prayers[i-1][0] as keyof typeof prayerTimes;
                } else {
                    // If next prayer is the first of the day, current is the last of previous day
                    currentPrayer = prayers[prayers.length-1][0] as keyof typeof prayerTimes;
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
            nextPrayer = prayers[0][0] as keyof typeof prayerTimes; // First prayer of next day
            currentPrayer = prayers[prayers.length-1][0] as keyof typeof prayerTimes; // Last prayer of today
            
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

        const nextPrayerTime = timeToMinutes(prayerTimes[nextPrayer]);
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
        const interval = setInterval(() => {
            updatePrayerStatus();
        }, 60000);
        
        document.documentElement.style.setProperty('--passed-count', passedPrayers.length.toString());
        
        onMount(() => {
            return () => clearInterval(interval); // Cleanup interval on component unmount
        });
    }

    function checkMobile() {
        isMobile = window.innerWidth <= 768;
    }
    
    function handleTouchStart(event: TouchEvent) {
        if (isTransitioning) return;
        startY = event.touches[0].clientY;
    }
    
    function handleTouchMove(event: TouchEvent) {
        if (isTransitioning) return;
        
        const currentY = event.touches[0].clientY;
        const diffY = startY - currentY;
        
        // If swipe up is significant enough (> 50px)
        if (Math.abs(diffY) > 50) {
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
    
    function toggleFullscreen() {
        if (isTransitioning) return;
        
        isTransitioning = true;
        
        // Step 1: Fade out completely
        fadeState = "fading-out";
        
        // Step 2: Wait for fade out to complete, then reposition
        setTimeout(() => {
            fadeState = "hidden";
            
            // Switch layout mode immediately after elements are hidden
            setTimeout(() => {
                isFullscreen = !isFullscreen;
                
                // Step 3: Begin fade in after layout change is complete
                setTimeout(() => {
                    fadeState = "fading-in";
                    
                    // Step 4: Complete
                    setTimeout(() => {
                        fadeState = "visible";
                        isTransitioning = false;
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

    async function initializePrayerTimes() {
        try {
            isLoading = true;
            error = null;
            const data = await getPrayerData();
            if (data) {
                prayerTimes = data.prayerTimes;
                hijriDate = data.hijriDate;
                location = data.location.locationName;
            } else {
                error = 'Failed to fetch prayer times';
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
        initializePrayerTimes();
        checkMobile();
        
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
            window.removeEventListener('wheel', handleScroll);
            window.removeEventListener('resize', checkMobile);
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
        };
    });
</script>

<div class="layout" class:fullscreen={isFullscreen} class:transitioning={isTransitioning} class:initial-load={isInitialLoad}
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
                <div class="status-text">loading prayer times</div>
            </div>
        {:else if error}
            <div class="error">
                <p>{error}</p>
                <button on:click={initializePrayerTimes}>Retry</button>
            </div>
        {:else if currentPrayer}
            <div class="header">
                <p class="hijri">{hijriDate}</p>
                <p class="location">{location}</p>
            </div>
            <div class="next-prayer">
                <div class="countdown">
                    <p class="time">{timeRemaining}</p>
                    <p class="subtitle">until {nextPrayer}</p>
                </div>
            </div>
            <div class="prayer-info">
                <div class="prayer-details">
                    <h2>{currentPrayer}</h2>
                    <p class="time">{prayerTimes[currentPrayer]}</p>
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
                <div class="status-text">loading prayer times</div>
            </div>
        {:else if error}
            <div class="error">
                <p>{error}</p>
                <button on:click={initializePrayerTimes}>Retry</button>
            </div>
        {:else}
            <div class="prayer-grid">
                {#if currentPrayer === 'isha' && !isFullscreen}
                    <div class="prayer-time" data-prayer="midnight" style="--index: 0">
                        <div class="prayer-list-info">
                            {#if isMobile}
                                <p class="prayer-name">midnight</p>
                                <div class="time-display">
                                    <p class="time">{calculateMidnight(prayerTimes.isha, prayerTimes.fajr)}</p>
                                </div>
                            {:else}
                                <div class="time-display">
                                    <p class="time">{calculateMidnight(prayerTimes.isha, prayerTimes.fajr)}</p>
                                </div>
                                <p class="prayer-name">midnight</p>
                            {/if}
                        </div>
                    </div>
                    <div class="prayer-time" data-prayer="tahajjud" style="--index: 1">
                        <div class="prayer-list-info">
                            {#if isMobile}
                                <p class="prayer-name">first third</p>
                                <div class="time-display">
                                    <p class="time">{calculateFirstThird(prayerTimes.isha, prayerTimes.fajr)}</p>
                                </div>
                            {:else}
                                <div class="time-display">
                                    <p class="time">{calculateFirstThird(prayerTimes.isha, prayerTimes.fajr)}</p>
                                </div>
                                <p class="prayer-name">first third</p>
                            {/if}
                        </div>
                    </div>
                    <div class="prayer-time" data-prayer="fajr" style="--index: 2">
                        <div class="prayer-list-info">
                            {#if isMobile}
                                <p class="prayer-name">fajr</p>
                                <div class="time-display">
                                    <p class="time">{prayerTimes.fajr}</p>
                                </div>
                            {:else}
                                <div class="time-display">
                                    <p class="time">{prayerTimes.fajr}</p>
                                </div>
                                <p class="prayer-name">fajr</p>
                            {/if}
                        </div>
                    </div>
                {:else}
                    {#each Object.entries(prayerTimes)
                        .filter(([prayer]) => {
                            if (isFullscreen) return true;
                            
                            // Show only upcoming prayers (not current)
                            const prayers = Object.entries(prayerTimes)
                                .sort((a, b) => {
                                    const timeToMinutes = (timeStr: string) => {
                                        if (!timeStr) return 0;
                                        const [hours, minutes] = timeStr.split(':').map(Number);
                                        return hours * 60 + minutes;
                                    };
                                    return timeToMinutes(a[1]) - timeToMinutes(b[1]);
                                })
                                .map(([p]) => p);
                            
                            const currentIndex = prayers.indexOf(currentPrayer);
                            // Return prayers after current (not including current)
                            return prayers.indexOf(prayer) > currentIndex;
                        })
                        .sort((a, b) => {
                            // Always sort by prayer time
                            const timeToMinutes = (timeStr: string) => {
                                if (!timeStr) return 0;
                                const [hours, minutes] = timeStr.split(':').map(Number);
                                return hours * 60 + minutes;
                            };
                            return timeToMinutes(a[1]) - timeToMinutes(b[1]);
                        }) as [prayer, time], i}
                        <div 
                            class="prayer-time" 
                            class:fullscreen={isFullscreen}
                            data-prayer={prayer}
                            style="--index: {i}"
                        >
                            <div class="prayer-list-info">
                                {#if !isFullscreen}
                                    {#if isMobile}
                                        <p class="prayer-name">{prayer}</p>
                                        <div class="time-display">
                                            <p class="time">{time}</p>
                                        </div>
                                    {:else}
                                        <div class="time-display">
                                            <p class="time">{time}</p>
                                        </div>
                                        <p class="prayer-name">{prayer}</p>
                                    {/if}
                                {:else}
                                    <h2 class="prayer-name">{prayer}</h2>
                                    <p class="time">{time}</p>
                                {/if}
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>
        {/if}
    </div>
    {#if showScrollNote}
        <div class="scroll-note" class:fade-in={showScrollNote} class:fade-out={!showScrollNote}>
            Scroll to see all prayer times
        </div>
    {/if}
    {#if !showScrollNote && !isMobile}
        <div class="scroll-note" class:fade-in={!showScrollNote} class:fade-out={showScrollNote}>
            Scroll again to see the focused view
        </div>
    {/if}
    
    {#if isMobile && isFirstVisit}
        {#if !isFullscreen}
            <div class="swipe-indicator up">
                <div class="arrow"></div>
            </div>
        {:else}
            <div class="swipe-indicator down">
                <div class="arrow"></div>
            </div>
        {/if}
    {/if}
</div>

<style>
    :root {
        --text-opacity: 0.8;
    }
    
    .layout {
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
    
    /* Apply specific prayer backgrounds */
    .current-prayer[data-prayer="fajr"] {
        background: linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d);
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
        justify-content: space-between;
        align-items: center;
        z-index: 1;
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
    }
    
    .layout.mobile .prayer-time:not(.fullscreen) .prayer-list-info {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1.25rem; /* More horizontal padding */
        width: 100%;
        box-sizing: border-box;
    }
    
    .prayer-time.fullscreen .prayer-info, .prayer-list.fullscreen .prayer-list-info {
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem 1.5rem;
        background-color: rgba(0, 0, 0, 0);
        height: 100%;
        width: 100%;
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
    
    .layout.mobile .prayer-time:not(.fullscreen) .time-display {
        margin-bottom: 0;
        width: auto;
        justify-content: flex-end; /* Align to right */
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
    
    .layout.mobile .prayer-time:not(.fullscreen) .prayer-name {
        position: static;
        font-size: 1.5rem;
        text-align: left;
    }
    
    .prayer-time.fullscreen .prayer-name {
        font-size: 2.5rem;
        position: static;
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
        position: absolute;
        bottom: 20px;
        right: 20px;
        background-color: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 10px 15px;
        border-radius: 5px;
        transition: opacity 0.5s ease;
        opacity: 1;
        z-index: 1000;
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
</style>
