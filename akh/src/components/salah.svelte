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
    
    let currentPrayer: keyof typeof prayerTimes = 'fajr';
    let passedPrayers: string[] = [];
    let timeRemaining = '';

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
                currentPrayer = prayer as keyof typeof prayerTimes;
                return;
            }
            passedPrayers.push(prayer);
        }
        
        currentPrayer = 'fajr';
    }

    function updateTimeRemaining() {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        const timeToMinutes = (timeStr: string) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };

        const currentPrayerTime = timeToMinutes(prayerTimes[currentPrayer]);
        let diff = currentPrayerTime - currentTime;
        
        if (diff < 0) {
            diff += 24 * 60; // Add 24 hours if we've wrapped around to next day
        }

        const hours = Math.floor(diff / 60);
        const minutes = diff % 60;
        timeRemaining = `${hours}h ${minutes}m`;
    }

    $: if (prayerTimes.fajr) {
        getCurrentPrayer();
        updateTimeRemaining();
        setInterval(() => {
            getCurrentPrayer();
            updateTimeRemaining();
        }, 60000);
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

<div class="layout">
    <div class="current-prayer">
        {#if currentPrayer}
            <div class="prayer-time current">
                <div class="remaining">
                    <p class="time">{timeRemaining}</p>
                    <p>until</p>
                </div>
                <div class="prayer-info">
                    <p class="time">{prayerTimes[currentPrayer]}</p>
                    <h2>{currentPrayer}</h2>
                </div>
            </div>
        {/if}
    </div>
    
    <div class="prayer-list">
        {#each Object.entries(prayerTimes).filter(([prayer]) => prayer !== currentPrayer) as [prayer, time]}
            <div class="prayer-time {passedPrayers.includes(prayer) ? 'passed' : ''}">
                <p class="time">{time}</p>
                <h2>{prayer}</h2>
            </div>
        {/each}
    </div>
</div>

<style>
    .layout {
        display: grid;
        grid-template-columns: 2fr 1fr;
        min-height: 100vh;
        width: 100%;
        overflow: hidden;
        position: relative;
    }

    .current-prayer {
        position: relative;
        padding: 2rem;
        display: flex;
        background-color: black;
        color: white;
    }

    .prayer-list {
        background-color: #000000;
        overflow-y: auto;
        height: 100vh;
        display: flex;
        flex-direction: column;
    }

    .prayer-time {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background-color: rgb(0, 0, 0);
        text-align: center;
        flex: 1;
        min-height: 20vh;
    }

    .prayer-time.current {
        width: 100%;
        height: 100%;
        display: grid;
        grid-template-rows: 1fr auto;
        padding: 2rem;
        position: relative;
    }

    .prayer-time.active {
        background-color: #000000;
        border: 2px solid #333;
    }

    .prayer-time.passed {
        opacity: 0.7;
    }

    .remaining {
        align-self: center;
        justify-self: start;
        margin-left: 4rem;
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
    }

    .remaining p {
        font-size: 2rem;
        color: #666;
        margin: 0;
    }

    .remaining .time {
        font-size: 8rem;
        font-weight: bold;
        line-height: 1;
        color: white;
        margin: 0;
    }

    .prayer-info {
        position: absolute;
        bottom: 2rem;
        right: 2rem;
        text-align: right;
    }

    .prayer-info h2 {
        font-size: 2rem;
        color: #666;
        margin: 0.5rem 0 0 0;
    }

    .prayer-info .time {
        font-size: 6rem;
        font-weight: bold;
        color: white;
        margin: 0;
        line-height: 1;
    }

    .prayer-list .prayer-time {
        position: relative;
        padding: 2rem 3rem;
        background-color: black;
        min-height: 25vh;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        align-items: flex-start;
    }

    .prayer-list .prayer-time .time {
        font-size: 4rem;
        font-weight: bold;
        color: white;
        margin: 0;
        line-height: 1;
    }

    .prayer-list .prayer-time h2 {
        font-size: 1.5rem;
        color: #666;
        margin: 0.5rem 0 0 0;
    }

    .prayer-list .prayer-time.passed {
        opacity: 0.5;
    }

    .remaining {
        margin-top: 2rem;
        text-align: center;
    }

    .remaining p {
        margin: 0;
        font-size: 1.5rem;
        color: #666;
    }

    .remaining .time {
        font-size: 2.5rem;
        color: #ffffff;
        font-weight: bold;
    }

    .current-prayer h2 {
        font-size: 4rem;
    }

    .current-prayer p {
        font-size: 3rem;
    }

    .prayer-list h2 {
        font-size: 1.5rem;
    }

    .prayer-list p {
        font-size: 1.2rem;
    }

    h2 {
        margin: 0;
        color: #333;
    }

    p {
        margin: 0.5rem 0 0;
        color: #666;
    }

    :global(body) {
        margin: 0;
        padding: 0;
    }
</style>
