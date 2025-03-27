<script lang="ts">
    import { onMount } from 'svelte';
    import { fade, fly, slide } from 'svelte/transition';
    import { tweened } from 'svelte/motion';
    import { cubicOut } from 'svelte/easing';
    import about from '../components/about.svelte';
    import qibla from '../components/qibla.svelte';
    import salah from '../components/salah.svelte';
    import alif from '../components/alif.svelte';

    let pages = [about, qibla, salah, alif];
    let pageNames = ['ABOUT', 'QIBLA', 'SALAH', 'ALIF'];
    let currentPageIndex = 2;
    let previousPageIndex = 2;
    let slideDirection = 1; // 1 = right, -1 = left
    
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

    // Update indicator position based on active button
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
        isMobile = window.innerWidth <= 768;
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
        
        return () => {
            window.removeEventListener('resize', checkMobile);
        };
    });

    const setPage = (index: number) => {
        slideDirection = index > currentPageIndex ? 1 : -1;
        previousPageIndex = currentPageIndex;
        currentPageIndex = index;
        updateIndicatorPosition();
        // Save current page to localStorage
        localStorage.setItem('akhLastPage', currentPageIndex.toString());
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
    let touchStartTime = 0;

    const handleTouchStart = (e: TouchEvent) => {
        touchStartX = e.touches[0].clientX;
        touchStartTime = Date.now();
        if (isMobile) {
            isSwiping = true;
            swipeProgress = 0;
        }
    };
    
    const handleTouchMove = (e: TouchEvent) => {
        if (isMobile && isSwiping) {
            const currentX = e.touches[0].clientX;
            const deltaX = currentX - touchStartX;
            
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
        }
    };

    const handleTouchEnd = (e: TouchEvent) => {
        touchEndX = e.changedTouches[0].clientX;
        const swipeDistance = touchEndX - touchStartX;
        const swipeTime = Date.now() - touchStartTime;
        
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
</script>

<svelte:head>
    <link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;700&family=Chivo+Mono:wght@400;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=close" /></svelte:head>

<style>
    :global(body) {
        margin: 0;
        padding: 0;
        background: #000000;
    }

    .header-trigger {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 60px;
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
        width: 98%;
        height: 98vh;
        margin: 1vh auto;
        overflow: hidden;
        touch-action: pan-y pinch-zoom;
        background: #000000;
        color: white;
        border-radius: 8px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
            width: 98%;
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
        transform: translateZ(0); /* Force GPU acceleration */
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
    
    /* App switcher styles for mobile */
    .app-switcher {
        position: absolute;
        bottom: 10px;
        left: 0;
        width: 100%;
        height: 60px;
        display: flex;
        justify-content: center;
        align-items: center;
        background: linear-gradient(to bottom, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.5));
        z-index: 10;
        opacity: 0;
        transition: opacity 0.3s ease;
    }
    
    .app-switcher.swiping {
        opacity: 1;
    }
    
    .app-switcher-items {
        display: flex;
        gap: 30px;
        height: 100%;
        align-items: center;
    }
    
    .app-switcher-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        transition: transform 0.3s ease, opacity 0.3s ease;
        opacity: 0.5;
    }
    
    .app-switcher-item.active {
        opacity: 1;
        transform: scale(1.2);
    }
    
    .app-switcher-item.target {
        opacity: 0.8;
        transform: scale(1.1);
    }
    
    .app-switcher-label {
        font-family: 'Chivo Mono', monospace;
        font-size: 0.8rem;
        margin-top: 5px;
        display: block;
    }
    
    .page-indicator {
        width: 50px;
        height: 4px;
        background: white;
        border-radius: 2px;
    }
    
    /* Scale the current page when swiping */
    .swiping-active .full {
        transition: transform 0.3s ease;
        transform: scale(0.85) translateZ(0);
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
    <div class="brand">akh</div>
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

<div class="carousel {isHeaderVisible ? 'header-visible' : ''} {isSwiping ? 'swiping-active' : ''}" 
    on:touchstart={handleTouchStart} 
    on:touchmove={handleTouchMove}
    on:touchend={handleTouchEnd}>
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
                style="will-change: transform, opacity; transform: scale({isSwiping ? 0.85 : 1}) translateZ(0) translateX({isSwiping ? swipeProgress * 100 : 0}px);">
                <svelte:component this={pages[currentPageIndex]} />
            </div>
        {/key}
    </div>
    
    {#if isMobile && isFirstVisit}
        <div class="swipe-indicator left" data-hint="Previous">
            <div class="arrow"></div>
        </div>
        <div class="swipe-indicator right" data-hint="Next">
            <div class="arrow"></div>
        </div>
    {/if}
    
    {#if isMobile}
        <div class="app-switcher {isSwiping ? 'swiping' : ''}">
            <div class="app-switcher-items">
                {#each pageNames as name, i}
                    <div class="app-switcher-item {i === currentPageIndex ? 'active' : ''} {i === swipeTarget && isSwiping ? 'target' : ''}">
                        <div class="page-indicator"></div>
                        <div class="app-switcher-label">{name}</div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>