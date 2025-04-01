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
            <input 
                type="checkbox" 
                id="useAutoDetect" 
                bind:checked={settings.useAutoDetect}
            />
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
    }
    
    .settings-group {
        margin-bottom: 20px;
        background-color: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 15px;
    }
    
    .settings-group h3 {
        margin-top: 0;
        margin-bottom: 15px;
        font-weight: 500;
        font-size: 1.2rem;
        color: var(--accent-color);
        padding-bottom: 8px;
    }
    
    .setting-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
    }
    
    .setting-row label {
        font-size: 1rem;
        color: rgba(255, 255, 255, 0.8);
    }
    
    .setting-row input[type="number"] {
        width: 70px;
        background-color: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        color: white;
        padding: 8px;
        font-size: 0.9rem;
    }
    
    .setting-row input[type="checkbox"] {
        width: 20px;
        height: 20px;
        accent-color: var(--accent-color);
        appearance: none;
        -webkit-appearance: none;
        background-color: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        position: relative;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    
    .setting-row input[type="checkbox"]:checked {
        background-color: var(--accent-color);
        border-color: var(--accent-color);
        box-shadow: 0 0 2px var(--accent-color);
    }
    
    .setting-row input[type="checkbox"]:checked::after {
        content: "✓";
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        font-size: 0.9rem;
    }
    
    .setting-row select {
        background-color: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        color: white;
        padding: 8px;
        width: 200px;
        font-size: 0.9rem;
    }
    
    .setting-row select option {
        background-color: #2d2d2d;
        color: white;
    }
    
    .button-group {
        display: flex;
        justify-content: space-between;
        margin-top: 20px;
    }
    
    .save-button, .reset-button {
        padding: 10px 20px;
        border-radius: 4px;
        font-size: 1rem;
        cursor: pointer;
        position: relative;
        background-size: 200% 100%;
        transition: all 0.3s ease;
    }
    
    .save-button {
        border: none;
        color: white;
        background-size: 200% 100%;
        background-position: 0% center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        background-image: var(--gradient-color, linear-gradient(135deg, var(--gradient-color-1, #8ae068), var(--gradient-color-2, #0072ff)));
    }
    
    .reset-button {
        background-color: transparent;
        color: var(--accent-color);
        border: 1px solid var(--accent-color);
        background-image: linear-gradient(135deg, 
            var(--accent-color) 0%,
            var(--accent-color) 100%
        );
        background-clip: text;
        -webkit-background-clip: text;
    }
    
    .save-button:hover, .reset-button:hover {
        text-decoration: none;
    }
    
    .save-button:hover {
        transform: translateY(-2px);
        animation: saveButtonPulse 1.2s ease-in-out 0.15s;
        animation-fill-mode: forwards;
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
    
    .reset-button:hover {
        color: transparent;
        border-color: transparent;
        background-image: linear-gradient(135deg, 
            var(--accent-color) 0%,
            var(--gradient-color-1, var(--accent-color)) 20%, 
            var(--gradient-color-2, var(--accent-color)) 40%,
            var(--accent-color) 60%,
            var(--gradient-color-1, var(--accent-color)) 80%,
            var(--accent-color) 100%
        );
        animation: buttonGradientPulse 1.2s ease-in-out 0.15s;
        animation-fill-mode: forwards;
    }
    
    .save-button:disabled, .reset-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
        filter: grayscale(0.5);
        animation: none;
    }
    
    @keyframes buttonGradientPulse {
        0% {
            background-position: 0% center;
            color: transparent;
        }
        50% {
            background-position: 100% center;
            color: transparent;
        }
        100% {
            background-position: 0% center;
            color: var(--accent-color);
        }
    }
    
    :global(:root) {
        --accent-color-rgb: 0, 114, 255;
    }
</style> 