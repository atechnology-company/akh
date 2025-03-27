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

    $: showScrollNote = !isFullscreen;

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

    function handleScroll(event: WheelEvent) {
        if (isTransitioning) return;
        
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
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
        
        window.addEventListener('wheel', handleScroll);
        return () => {
            window.removeEventListener('wheel', handleScroll);
        };
    });
</script>

<div class="layout" class:fullscreen={isFullscreen} class:transitioning={isTransitioning} class:initial-load={isInitialLoad}
    class:fade-out={fadeState === "fading-out"} 
    class:hidden={fadeState === "hidden"} 
    class:fade-in={fadeState === "fading-in"} 
    class:visible={fadeState === "visible"}>
    {#if !isFullscreen}
    <div class="current-prayer" class:hidden={isFullscreen} data-prayer={currentPrayer}>
        {#if isLoading}
            <div class="loading">
                <p>Loading prayer times</p>
                <div class="loading-animation">
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                </div>
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
            <div class="loading">
                <p>Loading prayer times</p>
                <div class="loading-animation">
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                </div>
            </div>
        {:else if error}
            <div class="error">
                <p>{error}</p>
                <button on:click={initializePrayerTimes}>Retry</button>
            </div>
        {:else}
            <div class="prayer-grid">
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
                                <div class="time-display">
                                    <p class="time">{time}</p>
                                </div>
                                <p class="prayer-name">{prayer}</p>
                            {:else}
                                <h2 class="prayer-name">{prayer}</h2>
                                <p class="time">{time}</p>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
    {#if showScrollNote}
        <div class="scroll-note" class:fade-in={showScrollNote} class:fade-out={!showScrollNote}>
            Scroll to see all prayer times
        </div>
    {/if}
    {#if !showScrollNote}
        <div class="scroll-note" class:fade-in={!showScrollNote} class:fade-out={showScrollNote}>
            Scroll again to see the focused view
        </div>
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

    .hijri {
        font-size: 2rem;
        color: rgba(255, 255, 255, var(--text-opacity));
        margin: 0;
        font-weight: 300;
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

    .countdown .subtitle {
        font-size: 2.5rem;
        color: rgba(255, 255, 255, var(--text-opacity));
        margin: 1rem 0 0 0;
        font-weight: 300;
        text-transform: lowercase;
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

    .prayer-list-info {
        position: absolute;
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        z-index: 2;
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
        transform: translateZ(0); /* Force GPU acceleration */
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
        scrollbar-width: none; /* Firefox */
        -ms-overflow-style: none; /* IE and Edge */
        transform: translateZ(0); /* Force GPU acceleration */
    }

    .prayer-grid::-webkit-scrollbar {
        display: none; /* Hide scrollbar for Chrome, Safari and Opera */
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
    }

    .prayer-time {
        position: relative;
        overflow: hidden;
    }
    
    /* Fullscreen prayer time styles */
    .prayer-time.fullscreen {
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
        padding: 16px;
        background-color: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(10px);
        height: 100%;
        width: 100%;
    }
    
    .prayer-time.fullscreen .prayer-info, .prayer-list.fullscreen .prayer-list-info {
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        padding: 3rem 4rem;
        background-color: rgba(0, 0, 0, 0);
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
    
    .prayer-time:not(.fullscreen) .time {
        font-size: 8rem;
        line-height: 1;
    }

    .loading {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100%;
        color: rgba(255, 255, 255, 0.7);
        font-size: 2rem;
        font-weight: 300;
        gap: 2rem;
        position: relative;
        z-index: 2;
    }
    
    /* Pulsing dots loading animation */
    .loading-animation {
        display: flex;
        gap: 1rem;
    }
    
    .loading-dot {
        width: 1.2rem;
        height: 1.2rem;
        border-radius: 50%;
        background-color: white;
        animation: pulse 1.5s infinite ease-in-out;
    }
    
    .loading-dot:nth-child(2) {
        animation-delay: 0.2s;
    }
    
    .loading-dot:nth-child(3) {
        animation-delay: 0.4s;
    }
    
    @keyframes pulse {
        0%, 100% { 
            transform: scale(0.5);
            opacity: 0.5;
        }
        50% { 
            transform: scale(1);
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

    .fade-in {
        opacity: 1;
    }

    .fade-out {
        opacity: 0;
    }
</style>
