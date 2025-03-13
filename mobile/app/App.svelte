<frame>
    <settings />
    <qibla />
    <salah />
    <mosques />
</frame>

<script lang="ts">
    import * as geolocation from "@nativescript/geolocation";

    import settings from './components/settings.svelte';
    import qibla from './components/qibla.svelte';
    import salah from './components/salah.svelte';
    import mosques from './components/mosques.svelte';

    if (!geolocation.isEnabled()) {
      await geolocation.enableLocationRequest();
    }

    export const location = await geolocation.getCurrentLocation({
      desiredAccuracy: 3,
      updateDistance: 10,
      maximumAge: 20000,
      timeout: 20000,
    });
</script>
