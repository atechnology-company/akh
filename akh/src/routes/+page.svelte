<script lang="ts">
    import { onMount } from 'svelte';
    import settings from '../components/settings.svelte';
    import qibla from '../components/qibla.svelte';
    import salah from '../components/salah.svelte';
    import mosques from '../components/mosques.svelte';
    import alif from '../components/alif.svelte';

    let pages = [settings, qibla, salah, mosques, alif];
    let currentPageIndex = 0;

    const nextPage = () => {
        currentPageIndex = (currentPageIndex + 1) % pages.length;
    };

    const prevPage = () => {
        currentPageIndex = (currentPageIndex - 1 + pages.length) % pages.length;
    };

    let interval: ReturnType<typeof setInterval>;
    onMount(() => {
        interval = setInterval(nextPage, 5000); // Auto-slide every 5 seconds
        return () => clearInterval(interval);
    });

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
</script>

<style>
    .carousel {
        position: relative;
        width: 100%;
        height: 100vh;
        overflow: hidden;
        touch-action: pan-y pinch-zoom;
    }

    .carousel-content {
        width: 100%;
        height: 100%;
    }
</style>

<div class="carousel" 
    on:touchstart={handleTouchStart} 
    on:touchend={handleTouchEnd}>
    <div class="carousel-content">
        {#if pages[currentPageIndex]}
            <svelte:component this={pages[currentPageIndex]} />
        {/if}
    </div>
</div>