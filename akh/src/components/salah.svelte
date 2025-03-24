<script lang="ts">
    import { onMount } from 'svelte';
    import { getPrayerTimes } from '../modules/salah';
    
    let prayerTimes: { fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string } = {
        fajr: '',
        dhuhr: '',
        asr: '',
        maghrib: '',
        isha: ''
    };
    
    let currentPrayer = '';
    let passedPrayers: string[] = [];

    function getCurrentPrayer() {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        const timeToMinutes = (timeStr: string) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };

        const prayers = Object.entries(prayerTimes);
        passedPrayers = [];

        for (let i = 0; i < prayers.length; i++) {
            const [prayer, time] = prayers[i];
            const prayerMinutes = timeToMinutes(time);
            
            if (currentTime < prayerMinutes) {
                currentPrayer = prayer;
                return;
            }
            passedPrayers.push(prayer);
        }
        
        currentPrayer = 'fajr';
    }

    $: if (prayerTimes.fajr) {
        getCurrentPrayer();
        setInterval(getCurrentPrayer, 60000);
        document.documentElement.style.setProperty('--passed-count', passedPrayers.length.toString());
    }

    onMount(async () => {
        try {
            const result = await getPrayerTimes();
            if (result) {
                prayerTimes = result;
            } else {
                console.error('getPrayerTimes returned undefined');
            }
        } catch (error) {
            console.error('Error getting location:', error);
        }
    });
</script>

<div class="container">
    {#each Object.entries(prayerTimes) as [prayer, time]}
        <div class="prayer-time {prayer === currentPrayer ? 'current' : ''} {passedPrayers.includes(prayer) ? 'passed' : ''}">
            <h2>{prayer}</h2>
            <p>{time}</p>
        </div>
    {/each}
</div>

<style>
    .container {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        width: 100%;
        gap: 1px;
        background-color: #f0f0f0;
        position: relative;
        padding-top: calc(20vh * var(--passed-count, 0));
    }

    .prayer-time {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background-color: white;
        padding: 1rem;
        text-align: center;
        transition: all 0.5s ease-in-out;
        height: 20vh;
        position: relative;
    }

    .prayer-time.current {
        height: 60vh;
        background-color: #f8f8f8;
        z-index: 1;
    }

    .prayer-time.current h2 {
        font-size: 6rem;
    }

    .prayer-time.current p {
        font-size: 4.5rem;
    }

    .prayer-time.passed {
        opacity: 0.7;
    }

    h2 {
        margin: 0;
        font-size: 2rem;
        color: #333;
        transition: font-size 0.3s ease;
    }

    p {
        margin: 0.5rem 0 0;
        font-size: 1.5rem;
        color: #666;
        transition: font-size 0.3s ease;
    }
</style>
