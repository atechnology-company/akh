<script lang="ts">
    import { onMount } from 'svelte';
    import { getPrayerTimes } from '$modules/salah';
    let prayerTimes: { fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string } = {
        fajr: '',
        dhuhr: '',
        asr: '',
        maghrib: '',
        isha: ''
    };

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
  <div class="prayer-time">
    <h2>Fajr</h2>
    <p>{prayerTimes.fajr}</p>
  </div>
  <div class="prayer-time">
    <h2>Dhuhr</h2>
    <p>{prayerTimes.dhuhr}</p>
  </div>
  <div class="prayer-time">
    <h2>Asr</h2>
    <p>{prayerTimes.asr}</p>
  </div>
  <div class="prayer-time">
    <h2>Maghrib</h2>
    <p>{prayerTimes.maghrib}</p>
  </div>
  <div class="prayer-time">
    <h2>Isha</h2>
    <p>{prayerTimes.isha}</p>
  </div>
</div>

<style>
  .container {
    display: grid;
    grid-template-rows: repeat(5, 1fr);
    min-height: 100vh;
    width: 100%;
    gap: 1px;
    background-color: #f0f0f0;
  }

  .prayer-time {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background-color: white;
    padding: 1rem;
    text-align: center;
  }

  h2 {
    margin: 0;
    font-size: 2rem;
    color: #333;
  }

  p {
    margin: 0.5rem 0 0;
    font-size: 1.5rem;
    color: #666;
  }
</style>
