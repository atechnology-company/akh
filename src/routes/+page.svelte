<script lang="ts">
    import { onMount } from 'svelte';
    import { fade, fly, slide } from 'svelte/transition';
    import { tweened } from 'svelte/motion';
    import { cubicOut } from 'svelte/easing';
    import { browser } from '$app/environment';
    import mosques from '../components/mosques.svelte';
    import about from '../components/about.svelte';
    import qibla from '../components/qibla.svelte';
    import salah from '../components/salah.svelte';
    import alif from '../components/alif.svelte';
    import quran from '../components/quran.svelte';
    import { goto } from '$app/navigation';
    import { accentColor, gradientColor } from '$lib/stores/accentColor';
    import { prayerTimesStore, initializePrayerTimes, refreshPrayerTimes } from '../modules/salah';

    // Create separate arrays for desktop and mobile
    let allPages = [about, mosques, qibla, salah, quran, alif];
    let allPageNames = ['ABOUT', 'MOSQUES', 'QIBLA', 'SALAH', 'QURAN', 'ALIF'];
    
    // Dynamically set pages based on device
    $: pages = isMobile ? allPages.filter(page => page !== mosques) : allPages;
    $: pageNames = isMobile ? allPageNames.filter(name => name !== 'MOSQUES') : allPageNames;
    
    let currentPageIndex = 3;
    let previousPageIndex = 2;
    let slideDirection = 1; // 1 = right, -1 = left
    function navigateToMosquesPage() {
        goto('/mosques');
    }
    let currentPrayer: string = 'fajr';
    
    // Store nav button elements and their positions
    let navButtons: HTMLButtonElement[] = [];
    let indicatorPosition = tweened({ left: 0, width: 0 }, {
        duration: 300,
        easing: cubicOut
    });

    // First visit detection for swipe hints
    let isFirstVisit = false;
    let isMobile = false;
    
    // For app switcher effect when swiping
    let isSwiping = false;
    let swipeProgress = 0;
    let swipeTarget = 0;
    
    // Motion/shake detection for page carousel
    let isCarouselMode = false;
    let motionPermissionGranted = false;
    let shakeDetectionActive = false;
    let lastAcceleration = { x: 0, y: 0, z: 0 };
    let shakeThreshold = 8; // Lowered sensitivity for shake detection

    // Subscribe to prayer times to get current prayer
    const unsubscribePrayerTimes = prayerTimesStore.subscribe(value => {
        if (!value) return;
        
        // Get current prayer based on time
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        const timeToMinutes = (timeStr: string) => {
            if (!timeStr) return 0;
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };
        
        // Define prayer order
        const prayers = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
        
        // Find current prayer
        for (let i = 0; i < prayers.length; i++) {
            const prayer = prayers[i];
            const prayerTimeStr = value[prayer as keyof typeof value];
            if (!prayerTimeStr) continue;
            const prayerTime = timeToMinutes(prayerTimeStr);
            
            if (currentTime < prayerTime) {
                // If we're before this prayer, the previous one is current
                currentPrayer = i === 0 ? prayers[prayers.length - 1] : prayers[i - 1];
                console.log(`Page component: Current prayer is ${currentPrayer}`);
                break;
            }
        }
    });

    // Function to load prayer times if they're not already loaded
    async function loadPrayerTimes() {
        if (browser && (!$prayerTimesStore || Object.keys($prayerTimesStore).length === 0)) {
            console.log('Loading prayer times...');
            try {
                await initializePrayerTimes();
                console.log('Prayer times loaded successfully');
                updateColorsBasedOnCurrentPrayer();
            } catch (error) {
                console.error('Failed to load prayer times:', error);
                // Retry after a short delay
                setTimeout(async () => {
                    try {
                        console.log('Retrying prayer times load...');
                        await refreshPrayerTimes();
                        updateColorsBasedOnCurrentPrayer();
                    } catch (e) {
                        console.error('Retry failed:', e);
                    }
                }, 3000);
            }
        } else {
            console.log('Prayer times already loaded');
            updateColorsBasedOnCurrentPrayer();
        }
    }
    
    // Helper function to update colors based on current prayer
    function updateColorsBasedOnCurrentPrayer() {
        if (!currentPrayer) return;
        
        // Update accent color based on current prayer
        const prayerColors = {
            fajr: '#fdbb2d', // Using last color from gradient
            sunrise: '#ffb01f',
            dhuhr: '#0072ff',
            asr: '#ef473a',
            maghrib: '#b42460',
            isha: '#2c5364'
        } as const;

        const prayerGradients = {
            fajr: 'linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d)',
            sunrise: 'linear-gradient(135deg, #FF9500, #ff2d00, #ffb01f)',
            dhuhr: 'linear-gradient(135deg, #8ae068, #0072ff)',
            asr: 'linear-gradient(135deg, #dda65e, #ef473a)',
            maghrib: 'linear-gradient(135deg, #ef473a, #b42460)',
            isha: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)'
        } as const;
        
        // Set the colors immediately in CSS variables
        if (browser) {
            const accentColorValue = prayerColors[currentPrayer as keyof typeof prayerColors] || prayerColors.dhuhr;
            const gradientValue = prayerGradients[currentPrayer as keyof typeof prayerGradients] || prayerGradients.dhuhr;
            
            console.log(`Updating colors for prayer: ${currentPrayer}`);
            console.log(`Accent color: ${accentColorValue}`);
            console.log(`Gradient: ${gradientValue}`);
            
            // Add RGB values for animations
            const hexToRgb = (hex: string) => {
                // Remove the # if present
                hex = hex.replace(/^#/, '');
                
                // Parse as RGB
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                
                return `${r}, ${g}, ${b}`;
            };
            
            document.documentElement.style.setProperty('--accent-color', accentColorValue);
            document.documentElement.style.setProperty('--gradient-color', gradientValue);
            document.documentElement.style.setProperty('--accent-color-rgb', hexToRgb(accentColorValue));
            
            // Extract gradient colors for gradient-color-1, gradient-color-2, etc.
            const extractGradientColors = (gradientString: string): string[] => {
                const hexRegex = /#[0-9A-Fa-f]{6}/g;
                const matches = gradientString.match(hexRegex) || [];
                return matches.slice(0, 3);
            };
            
            const gradientColors = extractGradientColors(gradientValue);
            if (gradientColors.length > 0) {
                document.documentElement.style.setProperty('--gradient-color-1', gradientColors[0] || accentColorValue);
                document.documentElement.style.setProperty('--gradient-color-2', gradientColors[1] || accentColorValue);
                document.documentElement.style.setProperty('--gradient-color-3', gradientColors[2] || accentColorValue);
            }
            
            // Update the stores as well
            accentColor.set(accentColorValue);
            gradientColor.set(gradientValue);
        }
    }

    onMount(() => {
        // Load saved page from localStorage on mount
        const savedPage = localStorage.getItem('akhLastPage');
        if (savedPage !== null) {
            currentPageIndex = parseInt(savedPage);
            previousPageIndex = currentPageIndex;
        }
        updateIndicatorPosition();
        
        // Check if first visit
        isFirstVisit = localStorage.getItem('akhFirstVisit') !== 'false';
        if (isFirstVisit) {
            localStorage.setItem('akhFirstVisit', 'false');
        }
        
        checkMobile();
        window.addEventListener('resize', checkMobile);

        // Setup motion detection for mobile devices - delay to ensure isMobile is set
        setTimeout(() => {
            if (isMobile) {
                console.log('Setting up motion detection on mobile device');
                setupMotionDetection();
            }
        }, 100);

        // Load prayer times after a small delay
        setTimeout(async () => {
            await loadPrayerTimes();
        }, 500);

        return () => {
            window.removeEventListener('resize', checkMobile);
            if (shakeDetectionActive) {
                window.removeEventListener('devicemotion', handleDeviceMotion);
            }
            unsubscribePrayerTimes();
        };
    });

    const setPage = (index: number) => {
        // Ensure index is valid for current page array
        if (index >= 0 && index < pages.length) {
            slideDirection = index > currentPageIndex ? 1 : -1;
            previousPageIndex = currentPageIndex;
            currentPageIndex = index;
            updateIndicatorPosition();
            // Save current page to localStorage
            localStorage.setItem('akhLastPage', currentPageIndex.toString());
        }
    };

    const nextPage = () => {
        slideDirection = 1;
        previousPageIndex = currentPageIndex;
        currentPageIndex = (currentPageIndex + 1) % pages.length;
        updateIndicatorPosition();
        // Save current page to localStorage
        localStorage.setItem('akhLastPage', currentPageIndex.toString());
    };

    const prevPage = () => {
        slideDirection = -1;
        previousPageIndex = currentPageIndex;
        currentPageIndex = (currentPageIndex - 1 + pages.length) % pages.length;
        updateIndicatorPosition();
        // Save current page to localStorage
        localStorage.setItem('akhLastPage', currentPageIndex.toString());
    };

    let touchStartX = 0;
    let touchEndX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    const handleTouchStart = (e: TouchEvent) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
    };
    
    const handleTouchMove = (e: TouchEvent) => {
        if (isMobile) {
            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const deltaX = currentX - touchStartX;
            const deltaY = currentY - touchStartY;
            
            // In carousel mode, always allow swiping
            if (isCarouselMode) {
                const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 20;
                
                if (isHorizontalSwipe) {
                    isSwiping = true;
                    swipeProgress = Math.min(Math.max(deltaX / window.innerWidth, -0.5), 0.5);
                    
                    if (swipeProgress > 0.1) {
                        swipeTarget = (currentPageIndex - 1 + pages.length) % pages.length;
                    } else if (swipeProgress < -0.1) {
                        swipeTarget = (currentPageIndex + 1) % pages.length;
                    } else {
                        swipeTarget = currentPageIndex;
                    }
                }
                return;
            }
            
            // Only trigger swipe animation for horizontal movement in normal mode
            // Ignore vertical movements with a stricter threshold to prevent janky animations
            const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 20;
            
            // Only set swiping state if it's a clear horizontal swipe
            if (isHorizontalSwipe) {
                isSwiping = true;
                
                // Calculate swipe progress as percentage of screen width
                swipeProgress = Math.min(Math.max(deltaX / window.innerWidth, -0.5), 0.5);
                
                // Determine swipe target based on direction
                if (swipeProgress > 0.1) {
                    // Swiping right (prev)
                    swipeTarget = (currentPageIndex - 1 + pages.length) % pages.length;
                } else if (swipeProgress < -0.1) {
                    // Swiping left (next)
                    swipeTarget = (currentPageIndex + 1) % pages.length;
                } else {
                    swipeTarget = currentPageIndex;
                }
            } else {
                // If it's a vertical swipe, reset animation progress
                isSwiping = false;
                swipeProgress = 0;
                swipeTarget = currentPageIndex;
            }
        }
    };

    const handleTouchEnd = (e: TouchEvent) => {
        touchEndX = e.changedTouches[0].clientX;
        const swipeDistance = touchEndX - touchStartX;
        const swipeTime = Date.now() - touchStartTime;
        
        // Handle carousel mode touches
        if (isCarouselMode) {
            // Check if tap was on a page switcher item (let those handle their own clicks)
            const target = e.target as HTMLElement;
            if (target.closest('.carousel-page-item')) {
                // Let the page item click handler deal with this
                isSwiping = false;
                swipeProgress = 0;
                return;
            }
            
            // In carousel mode, use tap zones for quick navigation
            const screenWidth = window.innerWidth;
            const tapZoneWidth = screenWidth / 3; // Divide screen into 3 zones
            
            if (touchEndX < tapZoneWidth) {
                // Left third - go to previous page
                prevPage();
            } else if (touchEndX > screenWidth - tapZoneWidth) {
                // Right third - go to next page
                nextPage();
            } else {
                // Middle third - exit carousel mode
                exitCarouselMode();
            }
            
            isSwiping = false;
            swipeProgress = 0;
            return;
        }
        
        // Normal swipe handling
        if (Math.abs(swipeDistance) > 50) { // minimum swipe distance
            if (swipeDistance > 0) {
                prevPage();
            } else {
                nextPage();
            }
        }
        
        if (isMobile) {
            isSwiping = false;
            swipeProgress = 0;
        }
    };

    let isHeaderVisible = false;

    const showHeader = () => {
        isHeaderVisible = true;
    };

    const hideHeader = () => {
        isHeaderVisible = false;
    };

    function updateIndicatorPosition() {
        if (navButtons[currentPageIndex]) {
            const button = navButtons[currentPageIndex];
            const rect = button.getBoundingClientRect();
            const parentRect = button.parentElement!.getBoundingClientRect();
            
            indicatorPosition.set({
                left: rect.left - parentRect.left,
                width: rect.width
            });
        }
    }
    
    function checkMobile() {
        const wasMobile = isMobile;
        isMobile = window.innerWidth < 768;
        console.log('Mobile check:', { isMobile, width: window.innerWidth });
        
        // If transitioning between mobile and desktop, adjust current page index
        if (wasMobile !== isMobile) {
            // If switching to mobile and current page is mosques, change to a different page
            if (isMobile && allPages[currentPageIndex] === mosques) {
                // Default to salah page when mosque tab is hidden
                const salahIndex = pages.findIndex(page => page === salah);
                if (salahIndex >= 0) {
                    currentPageIndex = salahIndex;
                } else {
                    currentPageIndex = 0; // Fallback to first page
                }
                updateIndicatorPosition();
                localStorage.setItem('akhLastPage', currentPageIndex.toString());
            }
            // If switching to desktop, we don't need to adjust as all tabs are visible
        }
    }

    // Request motion permission and setup shake detection
    async function setupMotionDetection() {
        if (!browser || !isMobile) return;
        
        console.log('Setting up motion detection...');
        
        try {
            // Check if DeviceMotionEvent exists and requires permission (iOS 13+)
            if (typeof DeviceMotionEvent !== 'undefined' && 'requestPermission' in DeviceMotionEvent) {
                console.log('Requesting motion permission for iOS...');
                // For iOS, we need to request permission with user interaction
                // Let's add the event listener first and request permission when user interacts
                motionPermissionGranted = false;
                
                // Add a one-time touch listener to request permission
                const requestPermissionOnTouch = async () => {
                    try {
                        const permission = await (DeviceMotionEvent as any).requestPermission();
                        motionPermissionGranted = permission === 'granted';
                        console.log('Motion permission result:', permission);
                        
                        if (motionPermissionGranted) {
                            window.addEventListener('devicemotion', handleDeviceMotion);
                            shakeDetectionActive = true;
                            console.log('Motion detection activated');
                        }
                    } catch (e) {
                        console.error('Error requesting motion permission:', e);
                    }
                    
                    // Remove this one-time listener
                    document.removeEventListener('touchstart', requestPermissionOnTouch);
                };
                
                document.addEventListener('touchstart', requestPermissionOnTouch, { once: true });
            } else {
                // Android or older iOS - no permission needed
                console.log('Adding motion listener for Android/older iOS...');
                motionPermissionGranted = true;
                window.addEventListener('devicemotion', handleDeviceMotion);
                shakeDetectionActive = true;
                console.log('Motion detection activated');
            }
        } catch (error) {
            console.error('Error setting up motion detection:', error);
        }
    }
    
    // Handle device motion for shake detection
    function handleDeviceMotion(event: DeviceMotionEvent) {
        if (!event.accelerationIncludingGravity || isCarouselMode) return;
        
        const acceleration = event.accelerationIncludingGravity;
        const x = acceleration.x || 0;
        const y = acceleration.y || 0;
        const z = acceleration.z || 0;
        
        // Calculate the magnitude of acceleration change
        const deltaX = Math.abs(x - lastAcceleration.x);
        const deltaY = Math.abs(y - lastAcceleration.y);
        const deltaZ = Math.abs(z - lastAcceleration.z);
        
        const totalDelta = deltaX + deltaY + deltaZ;
        
        // Log motion data for debugging (remove in production)
        if (totalDelta > 5) {
            console.log('Motion detected:', { totalDelta, x, y, z, deltaX, deltaY, deltaZ });
        }
        
        // Detect shake gesture with lower threshold
        if (totalDelta > shakeThreshold) {
            console.log('Shake detected!', totalDelta);
            enterCarouselMode();
        }
        
        lastAcceleration = { x, y, z };
    }
    
    // Enter carousel mode
    function enterCarouselMode() {
        if (isCarouselMode) return;
        
        isCarouselMode = true;
        console.log('Entering carousel mode');
        
        // Haptic feedback if available
        if ('vibrate' in navigator) {
            navigator.vibrate(100);
        }
        
        // Auto-exit after 10 seconds if no interaction
        setTimeout(() => {
            if (isCarouselMode) {
                exitCarouselMode();
            }
        }, 10000);
    }
    
    // Exit carousel mode
    function exitCarouselMode() {
        isCarouselMode = false;
        isSwiping = false;
        swipeProgress = 0;
        console.log('Exiting carousel mode');
    }
    
    // Handle carousel swipe navigation
    function handleCarouselSwipe(direction: 'left' | 'right') {
        if (!isCarouselMode) return;
        
        if (direction === 'left') {
            nextPage();
        } else {
            prevPage();
        }
    }
    
    // Handle carousel tap to select page
    function handleCarouselTap() {
        if (isCarouselMode) {
            exitCarouselMode();
        }
    }
    
    // Handle direct page selection in carousel mode
    function handleCarouselPageSelect(index: number) {
        if (isCarouselMode) {
            setPage(index);
            // Add a small delay before exiting to show the transition
            setTimeout(() => {
                exitCarouselMode();
            }, 200);
        }
    }
</script>

<style>
    :global(:root) {
        --accent-color: #0072ff; /* Default to dhuhr color */
        --gradient-color: linear-gradient(135deg, #8ae068, #0072ff); /* Default to dhuhr gradient */
        --gradient-color-1: #8ae068;
        --gradient-color-2: #0072ff;
        --gradient-color-3: #0072ff;
    }

    :global(body) {
        margin: 0;
        padding: 0;
        background: #000000;
    }

    .material-icons {
        font-family: 'Material Icons';
        font-weight: normal;
        font-style: normal;
        font-size: 24px;  /* Preferred icon size */
        display: inline-block;
        line-height: 1;
        text-transform: none;
        letter-spacing: normal;
        word-wrap: normal;
        white-space: nowrap;
        direction: ltr;

        /* Support for all WebKit browsers. */
        -webkit-font-smoothing: antialiased;
        /* Support for Safari and Chrome. */
        text-rendering: optimizeLegibility;

        /* Support for Firefox. */
        -moz-osx-font-smoothing: grayscale;

        /* Support for IE. */
        font-feature-settings: 'liga';
    }

    .header-trigger {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 30px;
        z-index: 99;
        background: transparent;
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem 2rem;
        background: rgba(0, 0, 0, 0.95);
        position: fixed;
        top: 0;
        width: 100%;
        z-index: 100;
        color: white;
        transform: translateY(-100%);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(8px);
    }

    .header.visible {
        transform: translateY(0);
    }

    .brand {
        font-family: 'Onest', sans-serif;
        font-size: 1.5rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .brand-logo {
        width: 24px;
        height: 24px;
    }

    .nav-section {
        display: flex;
        gap: 1rem;
        position: relative;
    }

    .nav-button {
        padding: 0.5rem 1rem;
        cursor: pointer;
        border: none;
        background: none;
        color: white;
        font-family: 'Chivo Mono', monospace;
        font-size: 0.9rem;
        opacity: 0.5;
        transition: opacity 0.3s ease;
        border-bottom: none;
    }

    .nav-button.active {
        font-weight: bold;
        opacity: 1;
    }
    
    .nav-indicator {
        position: absolute;
        bottom: -2px;
        height: 2px;
        background-color: white;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .carousel {
        position: relative;
        width: calc(100vw - 2vh); /* how did i not think of this before? tf */
        height: 98vh;
        margin: 1vh auto;
        overflow: hidden;
        touch-action: pan-y pinch-zoom;
        background: #000000;
        color: white;
        border-radius: 8px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: 2;
    }
    
    .carousel.carousel-mode {
        transform: scale(0.8);
        border: 2px solid rgba(255, 255, 255, 0.3);
        box-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
    }

    .carousel.header-visible {
        margin-top: calc(1vh + 60px);
        height: calc(98vh - 60px);
    }

    @media (max-width: 768px) {
        .header {
            display: none;
        }
        .carousel {
            width: calc(100vw - 2vh);
            height: 98vh;
            margin: 1vh auto;
            border-radius: 8px;
        }
        .carousel.header-visible {
            margin-top: 1vh;
            height: 98vh;
        }
    }

    .carousel-content {
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
    }

    .full {
        width: 100%;
        height: 100%;
        position: absolute;
        top: 0;
        left: 0;
        overflow: hidden;
        transform: translateZ(0);
    }
    
    /* Swipe indicator styles - similar to salah.svelte */
    .swipe-indicator {
        position: absolute;
        width: 50px;
        height: 50px;
        top: 50%;
        opacity: 0.8;
        z-index: 1000;
        pointer-events: none;
        animation: pulse 2s infinite ease-in-out;
    }
    
    .swipe-indicator.left {
        left: 20px;
        animation: bounceLeft 2s infinite ease-in-out;
    }
    
    .swipe-indicator.right {
        right: 20px;
        animation: bounceRight 2s infinite ease-in-out;
    }
    
    .swipe-indicator .arrow {
        width: 15px;
        height: 15px;
        border-right: 3px solid white;
        border-bottom: 3px solid white;
        display: block;
        position: absolute;
        left: 50%;
        top: 50%;
        filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.7));
    }
    
    .swipe-indicator.left .arrow {
        transform: translate(-25%, -50%) rotate(135deg); /* Point left */
    }
    
    .swipe-indicator.right .arrow {
        transform: translate(-75%, -50%) rotate(-45deg); /* Point right */
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
    
    .swipe-indicator.left::after {
        content: "Previous"; 
        left: 40px;
        top: 50%;
        transform: translateY(-50%);
    }
    
    .swipe-indicator.right::after {
        content: "Next";
        right: 40px;
        top: 50%;
        transform: translateY(-50%);
    }
    
    @keyframes bounceLeft {
        0%, 100% {
            transform: translateX(0);
            opacity: 0.7;
        }
        50% {
            transform: translateX(-5px);
            opacity: 1;
        }
    }
    
    @keyframes bounceRight {
        0%, 100% {
            transform: translateX(0);
            opacity: 0.7;
        }
        50% {
            transform: translateX(5px);
            opacity: 1;
        }
    }
    
    @keyframes pulse {
        0%, 100% {
            opacity: 0.4;
            transform: scale(0.95);
        }
        50% {
            opacity: 0.8;
            transform: scale(1.05);
        }
    }
    
    .swiping-active .full {
        transition: transform 0.3s ease;
    }

    .mobile-logo {
        position: fixed;
        top: 15px;
        right: 15px;
        width: 28px;
        height: 28px;
        z-index: 1002;
        opacity: 0;
        transition: opacity 0.3s ease;
        filter: drop-shadow(0 0 5px rgba(0, 0, 0, 0.5));
    }
    
    .mobile-logo.swiping {
        opacity: 0.7;
    }
    
    .mobile-logo.carousel {
        opacity: 0.9;
    }
    
    /* Carousel mode styles - redesigned to match app switcher */
    .carousel-mode-logo {
        position: fixed;
        top: 15px;
        right: 15px;
        width: 28px;
        height: 28px;
        z-index: 1002;
        opacity: 0;
        transition: opacity 0.3s ease;
        filter: drop-shadow(0 0 5px rgba(0, 0, 0, 0.5));
    }
    
    .carousel-mode-logo.visible {
        opacity: 0.9;
    }
    
    .carousel-mode-indicator {
        position: fixed;
        top: 20px;
        left: 20px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 6px 12px;
        border-radius: 15px;
        font-family: 'Chivo Mono', monospace;
        font-size: 0.7rem;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s ease;
        backdrop-filter: blur(10px);
    }
    
    .carousel-mode-indicator.visible {
        opacity: 1;
    }
    
    .page-switcher {
        position: fixed;
        left: 0;
        bottom: 0;
        width: 100%;
        height: 80px;
        display: flex;
        justify-content: center;
        align-items: center;
        background: linear-gradient(to bottom, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.7));
        z-index: 1001;
        opacity: 0;
        transition: opacity 0.3s ease;
        backdrop-filter: blur(10px);
    }
    
    .page-switcher.visible {
        opacity: 1;
    }
    
    .page-items {
        display: flex;
        gap: 25px;
        height: 100%;
        align-items: center;
        padding: 10px 0;
    }
    
    .page-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        transition: transform 0.3s ease, opacity 0.3s ease;
        opacity: 0.6;
        cursor: pointer;
        padding: 5px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.1);
        min-width: 60px;
    }
    
    .page-item.active {
        opacity: 1;
        transform: scale(1.15);
        background: rgba(255, 255, 255, 0.2);
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
    }
    
    .page-item:hover {
        opacity: 0.8;
        transform: scale(1.05);
    }
    
    .page-icon {
        width: 40px;
        height: 6px;
        background: white;
        border-radius: 3px;
        margin-bottom: 8px;
        transition: all 0.3s ease;
    }
    
    .page-item.active .page-icon {
        background: var(--accent-color, white);
        box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
    }
    
    .page-label {
        font-family: 'Chivo Mono', monospace;
        font-size: 0.7rem;
        color: white;
        text-align: center;
        font-weight: 500;
        text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
    }
    
    .carousel-mode .full {
        transform: scale(0.85) translateZ(0);
        border-radius: 15px;
        overflow: hidden;
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
    }
    
    /* Carousel tap zones - less prominent now */
    .carousel-tap-zones {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        z-index: 1001;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
    }
    
    .carousel-tap-zones.visible {
        opacity: 0.3;
    }
    
    .tap-zone {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.05);
        border: 1px dashed rgba(255, 255, 255, 0.2);
        margin: 20px;
        border-radius: 10px;
        font-size: 1rem;
        color: white;
        text-shadow: 0 0 10px rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(2px);
    }
    
    .tap-zone.left::before {
        content: "←";
    }
    
    .tap-zone.center::before {
        content: "✕";
    }
    
    .tap-zone.right::before {
        content: "→";
    }
</style>

<div class="header-trigger"
    on:mouseenter={showHeader}
    on:mouseleave={hideHeader}
    role="button"
    tabindex="0">
</div>

<div class="header {isHeaderVisible ? 'visible' : ''}"
    on:mouseenter={showHeader}
    on:mouseleave={hideHeader}
    role="banner">
    <div class="brand"><img src="/favicon.png" alt="akh logo" class="brand-logo" />akh</div>
    <div class="nav-section">
        {#each pageNames as name, i}
            <button 
                class="nav-button {currentPageIndex === i ? 'active' : ''}"
                on:click={() => setPage(i)}
                bind:this={navButtons[i]}
            >
                {name}
            </button>
        {/each}
        {#if $indicatorPosition}
            <div class="nav-indicator" style="left: {$indicatorPosition.left}px; width: {$indicatorPosition.width}px;"></div>
        {/if}
    </div>
</div>

<div class="carousel {isHeaderVisible ? 'header-visible' : ''} {isSwiping ? 'swiping-active' : ''} {isCarouselMode ? 'carousel-mode' : ''}" 
    on:touchstart={handleTouchStart} 
    on:touchmove={handleTouchMove}
    on:touchend={handleTouchEnd}>
    
    {#if isMobile}
        <img src="/favicon.png" alt="akh logo" class="mobile-logo {isSwiping ? 'swiping' : ''} {isCarouselMode ? 'carousel' : ''}" />
    {/if}
    
    <!-- Carousel mode indicator (top left, only in carousel mode) -->
    <div class="carousel-mode-indicator {isCarouselMode ? 'visible' : ''}">
        Carousel Mode
    </div>
    
    <!-- Carousel tap zones -->
    <div class="carousel-tap-zones {isCarouselMode ? 'visible' : ''}">
        <div class="tap-zone left"></div>
        <div class="tap-zone center"></div>
        <div class="tap-zone right">        </div>
    </div>
    
    <!-- Page switcher (bottom) - visible during both swiping and carousel mode -->
    <div class="page-switcher {isSwiping || isCarouselMode ? 'visible' : ''}">
        <div class="page-items">
            {#each pageNames as name, i}
                <div class="page-item {i === currentPageIndex ? 'active' : ''}" 
                     on:click={() => isCarouselMode ? handleCarouselPageSelect(i) : setPage(i)}
                     role="button"
                     tabindex="0">
                    <div class="page-icon"></div>
                    <div class="page-label">{name}</div>
                </div>
            {/each}
        </div>
    </div>
    
    <div class="carousel-content">
        {#key currentPageIndex}
            <div class="full" 
                in:fly={{ 
                    x: slideDirection * 500, 
                    duration: 300, 
                    opacity: 0,
                    easing: cubicOut
                }}
                out:fly={{ 
                    x: -slideDirection * 500, 
                    duration: 300, 
                    opacity: 0,
                    easing: cubicOut
                }}
                style="will-change: transform, opacity; transform: scale({isSwiping || isCarouselMode ? 0.85 : 1}) translateZ(0) translateX({isSwiping ? swipeProgress * 100 : 0}px);">
                <svelte:component this={pages[currentPageIndex]} />
            </div>
        {/key}
    </div>
    
    {#if isMobile && isFirstVisit && !isCarouselMode}
        <div class="swipe-indicator left" data-hint="Previous">
            <div class="arrow"></div>
        </div>
        <div class="swipe-indicator right" data-hint="Next">
            <div class="arrow"></div>
        </div>
    {/if}
</div>