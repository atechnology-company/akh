<script>
    import { onMount } from "svelte";
    import axios from "axios";
    import * as appSettings from "@nativescript/core/application-settings";
    import location from "App.svelte";

    let prayerTimes = {};
    let error = "";

    onMount(async () => {
      try {
        const response = await axios.get(
          `https://api.aladhan.com/v1/timings?latitude=${location.latitude}&longitude=${location.longitude}&method=2`
        );

        prayerTimes = response.data.data.timings;
        appSettings.setString("prayerTimes", JSON.stringify(prayerTimes));
      } catch (err) {
        error = "Failed to fetch prayer times or location. Loading saved times.";
        const savedTimes = appSettings.getString("prayerTimes", "{}");
        prayerTimes = JSON.parse(savedTimes);
      }
    });
  </script>

  <template>
    <Page>
      <ActionBar title="Prayer Times" />
      <ScrollView>
        <StackLayout>
          {#if error}
            <Label text={error} class="error" />
          {:else}
            <Label text="Fajr: {prayerTimes.Fajr}" />
            <Label text="Dhuhr: {prayerTimes.Dhuhr}" />
            <Label text="Asr: {prayerTimes.Asr}" />
            <Label text="Maghrib: {prayerTimes.Maghrib}" />
            <Label text="Isha: {prayerTimes.Isha}" />
          {/if}
        </StackLayout>
      </ScrollView>
    </Page>
  </template>

  <style scoped>
    .error {
      color: red;
    }
  </style>
