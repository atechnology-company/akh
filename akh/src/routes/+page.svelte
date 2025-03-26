<script lang="ts">
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';
    import settings from '../components/settings.svelte';
    import qibla from '../components/qibla.svelte';
    import salah from '../components/salah.svelte';
    import mosques from '../components/mosques.svelte';
    import alif from '../components/alif.svelte';

    let pages = [settings, qibla, salah, mosques, alif];
    let pageNames = ['SETTINGS', 'QIBLA', 'SALAH', 'MOSQUES', 'ALIF'];
    let currentPageIndex = 2;

    const setPage = (index: number) => {
        currentPageIndex = index;
    };

    const nextPage = () => {
        currentPageIndex = (currentPageIndex + 1) % pages.length;
    };

    const prevPage = () => {
        currentPageIndex = (currentPageIndex - 1 + pages.length) % pages.length;
    };

    let touchStartX = 0;
    let touchEndX = 0;

    const handleTouchStart = (e: TouchEvent) => {
        touchStartX = e.touches[0].clientX;
    };

    const handleTouchEnd = (e: TouchEvent) => {
        touchEndX = e.changedTouches[0].clientX;
        const swipeDistance = touchEndX - touchStartX;
        
        if (Math.abs(swipeDistance) > 50) { // minimum swipe distance
            if (swipeDistance > 0) {
                prevPage();
            } else {
                nextPage();
            }
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
    }

    .nav-button {
        padding: 0.5rem 1rem;
        cursor: pointer;
        border: none;
        background: none;
        color: white;
        font-family: 'Chivo Mono', monospace;
        font-size: 0.9rem;
    }

    .nav-button.active {
        font-weight: bold;
        border-bottom: 2px solid white;
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
    }
</style>

<div class="header-trigger"
    on:mouseenter={showHeader}
    on:mouseleave={hideHeader}>
</div>

<div class="header {isHeaderVisible ? 'visible' : ''}"
    on:mouseenter={showHeader}
    on:mouseleave={hideHeader}>
    <div class="brand">akh</div>
    <div class="nav-section">
        {#each pageNames as name, i}
            <button 
                class="nav-button {currentPageIndex === i ? 'active' : ''}"
                on:click={() => setPage(i)}
            >
                {name}
            </button>
        {/each}
    </div>
</div>

<div class="carousel {isHeaderVisible ? 'header-visible' : ''}" 
    on:touchstart={handleTouchStart} 
    on:touchend={handleTouchEnd}>
    <div class="carousel-content">
        {#if pages[currentPageIndex]}
            <div in:fade={{ duration: 300, delay: 100 }} out:fade={{ duration: 300 }}>
                <svelte:component this={pages[currentPageIndex]} />
            </div>
        {/if}
    </div>
</div>