<script lang="ts">
    import location from "App.svelte";

    const KAABA = {
      latitude: 21.422487,
      longitude: 39.826206
    };

    let qiblaAngle = 0;
    let screenCenterX: number;
    let screenCenterY: number;

    function calculateQiblaAngle(lat1: number, lon1: number): number {
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (KAABA.latitude * Math.PI) / 180;
        const Δλ = ((KAABA.longitude - lon1) * Math.PI) / 180;

        const y = Math.sin(Δλ);
        const x = Math.cos(φ1) * Math.tan(φ2) - Math.sin(φ1) * Math.cos(Δλ);

        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    onMount(() => {
        const rect = document.body.getBoundingClientRect();
        screenCenterX = rect.width / 2;
        screenCenterY = rect.height / 2;

        qiblaAngle = calculateQiblaAngle(location.latitude, location.longitude);
    });

    const lineLength = 200;

    $: endX = screenCenterX + lineLength * Math.sin(qiblaAngle * Math.PI / 180);
    $: endY = screenCenterY - lineLength * Math.cos(qiblaAngle * Math.PI / 180);
</script>

<div class="container">
    <svg class="qibla-compass" width="100%" height="100%">
        <line
            x1={screenCenterX}
            y1={screenCenterY}
            x2={endX}
            y2={endY}
            stroke="green"
            stroke-width="2"
        />
        <circle
            cx={screenCenterX}
            cy={screenCenterY}
            r="4"
            fill="red"
        />
    </svg>
    <div class="info">
        <p>Qibla Angle: {Math.round(qiblaAngle)}°</p>
        <p>Your Location: {location.latitude.toFixed(4)}°, {location.longitude.toFixed(4)}°</p>
    </div>
</div>

<style>
    .container {
        width: 100vw;
        height: 100vh;
        position: relative;
        background-color: #1a1a1a;
    }

    .qibla-compass {
        position: absolute;
        top: 0;
        left: 0;
    }

    .info {
        position: absolute;
        bottom: 20px;
        left: 20px;
        color: white;
        font-family: monospace;
    }
</style>
