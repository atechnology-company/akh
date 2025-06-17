<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { 
        prayerSettingsStore, 
        savePrayerSettings, 
        defaultPrayerSettings,
        type PrayerSettings,
        refreshPrayerTimes
    } from '../modules/salah';
    import { t } from '$lib/i18n';
    import { CALCULATION_METHODS, ASR_METHODS } from '../modules/prayerCalculation';
    import { accentColor, gradientColor } from '$lib/stores/accentColor';
    import { browser } from '$app/environment';
    
    // Create event dispatcher
    const dispatch = createEventDispatcher<{ save: PrayerSettings }>();
    
    // Get settings from store or use defaults
    let settings: PrayerSettings = { ...$prayerSettingsStore };
    let isSaving = false;
    
    // Available calculation methods for dropdown
    const calculationMethods = Object.keys(CALCULATION_METHODS).map(key => ({
        id: key,
        name: key.replace(/_/g, ' ').replace(/\w\S*/g, txt => txt.charAt(0) + txt.substr(1).toLowerCase())
    }));
    
    // Available Asr calculation methods
    const asrMethods = [
        { id: ASR_METHODS.STANDARD, name: 'Standard (Shafii, Maliki, Hanbali)' },
        { id: ASR_METHODS.HANAFI, name: 'Hanafi' }
    ];
    
    // Function to handle settings save
    async function handleSave() {
        isSaving = true;
        
        try {
            // Save settings
            savePrayerSettings(settings);
            
            // Refresh prayer times with new settings
            if (browser) {
                await refreshPrayerTimes();
                console.log("Prayer times refreshed with new settings");
                
                // Force re-apply colors by accessing the variable directly
                if (document && document.documentElement) {
                    // Force browser repaint by temporarily modifying a property
                    document.documentElement.style.setProperty('--force-repaint', '1');
                    setTimeout(() => {
                        document.documentElement.style.removeProperty('--force-repaint');
                    }, 50);
                }
            }
            
            // Dispatch save event
            dispatch('save', settings);
        } catch (error) {
            console.error("Error saving prayer settings:", error);
        } finally {
            isSaving = false;
        }
    }
    
    // Function to reset to defaults
    function resetToDefaults() {
        settings = { ...defaultPrayerSettings };
    }
</script>

<div class="prayer-settings">
    <div class="settings-group">
        <h3>Calculation Method</h3>
        <div class="setting-row">
            <label for="useAutoDetect">Auto-detect based on location</label>
            <div class="slider-container">
                <input 
                    type="checkbox" 
                    id="useAutoDetect" 
                    bind:checked={settings.useAutoDetect}
                    class="slider-input"
                />
                <label for="useAutoDetect" class="slider">
                    <span class="slider-thumb"></span>
                </label>
            </div>
        </div>
        
        {#if !settings.useAutoDetect}
            <div class="setting-row">
                <label for="method">Method</label>
                <select id="method" bind:value={settings.method}>
                    {#each calculationMethods as method}
                        <option value={method.id}>{method.name}</option>
                    {/each}
                </select>
            </div>
        {/if}
        
        <div class="setting-row">
            <label for="asrMethod">Asr Calculation</label>
            <select id="asrMethod" bind:value={settings.asrMethod}>
                {#each asrMethods as method}
                    <option value={method.id}>{method.name}</option>
                {/each}
            </select>
        </div>
    </div>
    
    <div class="settings-group">
        <h3>Adjustments (minutes)</h3>
        <div class="setting-row">
            <label for="fajr-adjustment">Fajr</label>
            <input 
                type="number" 
                id="fajr-adjustment" 
                bind:value={settings.adjustments.fajr} 
                min="-60" 
                max="60"
            />
        </div>
        
        <div class="setting-row">
            <label for="dhuhr-adjustment">Dhuhr</label>
            <input 
                type="number" 
                id="dhuhr-adjustment" 
                bind:value={settings.adjustments.dhuhr} 
                min="-60" 
                max="60"
            />
        </div>
        
        <div class="setting-row">
            <label for="asr-adjustment">Asr</label>
            <input 
                type="number" 
                id="asr-adjustment" 
                bind:value={settings.adjustments.asr} 
                min="-60" 
                max="60"
            />
        </div>
        
        <div class="setting-row">
            <label for="maghrib-adjustment">Maghrib</label>
            <input 
                type="number" 
                id="maghrib-adjustment" 
                bind:value={settings.adjustments.maghrib} 
                min="-60" 
                max="60"
            />
        </div>
        
        <div class="setting-row">
            <label for="isha-adjustment">Isha</label>
            <input 
                type="number" 
                id="isha-adjustment" 
                bind:value={settings.adjustments.isha} 
                min="-60" 
                max="60"
            />
        </div>
    </div>
    
    <div class="button-group">
        <button class="reset-button" on:click={resetToDefaults} disabled={isSaving}>Reset to Defaults</button>
        <button class="save-button" on:click={handleSave} disabled={isSaving}>
            {#if isSaving}
                Saving...
            {:else}
                Save Settings
            {/if}
        </button>
    </div>
</div>

<style>
    .prayer-settings {
        color: white;
        font-family: "Onest", sans-serif;
        padding: 20px;
    }
    
    .settings-group {
        margin-bottom: 24px;
        background: rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(10px);
        border-radius: 16px;
        padding: 20px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    }
    
    .settings-group h3 {
        margin-top: 0;
        margin-bottom: 20px;
        font-weight: 600;
        font-size: 1.3rem;
        color: var(--accent-color);
        padding-bottom: 10px;
        border-bottom: 2px solid rgba(var(--accent-color-rgb, 0, 114, 255), 0.3);
    }
    
    .setting-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding: 8px 0;
    }
    
    .setting-row label {
        font-size: 1rem;
        color: rgba(255, 255, 255, 0.9);
        font-weight: 500;
    }
    
    .setting-row input[type="number"] {
        width: 80px;
        background: rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(10px);
        border: 2px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        color: white;
        padding: 10px 12px;
        font-size: 0.95rem;
        transition: all 0.3s ease;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    }
    
    .setting-row input[type="number"]:focus {
        outline: none;
        border-color: var(--accent-color);
        box-shadow: 0 0 0 3px rgba(var(--accent-color-rgb, 0, 114, 255), 0.3);
        background: rgba(255, 255, 255, 0.12);
        transform: translateY(-1px);
    }
    
    .setting-row input[type="number"]:hover:not(:focus) {
        border-color: rgba(var(--accent-color-rgb, 0, 114, 255), 0.5);
        background: rgba(255, 255, 255, 0.10);
        transform: translateY(-0.5px);
    }
    
    .slider-container {
        position: relative;
        display: inline-block;
    }
    
    .slider-input {
        opacity: 0;
        width: 0;
        height: 0;
        position: absolute;
    }
    
    .slider {
        position: relative;
        display: inline-block;
        width: 52px;
        height: 28px;
        background: rgba(255, 255, 255, 0.08);
        border: 2px solid rgba(255, 255, 255, 0.2);
        border-radius: 28px;
        cursor: pointer;
        transition: all 0.3s ease;
        backdrop-filter: blur(10px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    }
    
    .slider-thumb {
        position: absolute;
        content: "";
        height: 20px;
        width: 20px;
        left: 2px;
        top: 2px;
        background: white;
        transition: all 0.3s ease;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    
    .slider-input:checked + .slider {
        background: var(--gradient-color, linear-gradient(135deg, var(--accent-color), var(--accent-color)));
        border-color: var(--accent-color);
        box-shadow: 0 0 0 3px rgba(var(--accent-color-rgb, 0, 114, 255), 0.3);
    }
    
    .slider-input:checked + .slider .slider-thumb {
        transform: translateX(24px);
    }
    
    .slider:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
    }
    
    .setting-row select {
        background: rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(10px);
        border: 2px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        color: white;
        padding: 10px 12px;
        width: 220px;
        font-size: 0.95rem;
        transition: all 0.3s ease;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    }
    
    .setting-row select:focus {
        outline: none;
        border-color: var(--accent-color);
        box-shadow: 0 0 0 3px rgba(var(--accent-color-rgb, 0, 114, 255), 0.3);
        background: rgba(255, 255, 255, 0.12);
        transform: translateY(-1px);
    }
    
    .setting-row select:hover:not(:focus) {
        border-color: rgba(var(--accent-color-rgb, 0, 114, 255), 0.5);
        background: rgba(255, 255, 255, 0.10);
        transform: translateY(-0.5px);
    }
    
    .setting-row select option {
        background: #2d2d2d;
        color: white;
        padding: 8px;
    }
    
    .button-group {
        display: flex;
        justify-content: space-between;
        margin-top: 30px;
        gap: 16px;
    }
    
    .save-button, .reset-button {
        padding: 12px 24px;
        border-radius: 12px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        position: relative;
        background-size: 200% 100%;
        transition: all 0.3s ease;
        border: none;
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    }
    
    .save-button {
        color: white;
        background: var(--gradient-color, linear-gradient(135deg, var(--accent-color), var(--accent-color)));
        background-size: 200% 100%;
        background-position: 0% center;
    }
    
    .reset-button {
        background: rgba(255, 255, 255, 0.08);
        color: var(--accent-color);
        border: 2px solid var(--accent-color);
    }
    
    .save-button:hover, .reset-button:hover {
        text-decoration: none;
        transform: translateY(-2px);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
    }
    
    .save-button:hover {
        animation: saveButtonPulse 1.2s ease-in-out;
    }
    
    .reset-button:hover {
        color: white;
        background: var(--gradient-color, linear-gradient(135deg, var(--accent-color), var(--accent-color)));
        animation: resetButtonSlide 0.3s ease-in-out;
    }
    
    @keyframes resetButtonSlide {
        0% {
            background-position: -100% center;
        }
        100% {
            background-position: 0% center;
        }
    }
    
    @keyframes saveButtonPulse {
        0% {
            background-position: 0% center;
        }
        50% {
            background-position: 100% center;
        }
        100% {
            background-position: 0% center;
        }
    }
    
    .save-button:disabled, .reset-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
        filter: grayscale(0.5);
        animation: none;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    }
    
    :global(:root) {
        --accent-color-rgb: 0, 114, 255;
    }
</style> 