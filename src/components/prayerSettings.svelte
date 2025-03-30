<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { 
        prayerSettingsStore, 
        savePrayerSettings, 
        defaultPrayerSettings,
        type PrayerSettings
    } from '../modules/salah';
    import { t } from '$lib/i18n';
    import { CALCULATION_METHODS, ASR_METHODS } from '../modules/prayerCalculation';
    
    // Create event dispatcher
    const dispatch = createEventDispatcher<{ save: PrayerSettings }>();
    
    // Get settings from store or use defaults
    let settings: PrayerSettings = { ...$prayerSettingsStore };
    
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
    function handleSave() {
        // Save settings
        savePrayerSettings(settings);
        
        // Dispatch save event
        dispatch('save', settings);
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
        <button class="reset-button" on:click={resetToDefaults}>Reset to Defaults</button>
        <button class="save-button" on:click={handleSave}>Save Settings</button>
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
        color: rgba(255, 255, 255, 0.9);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
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
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        color: white;
        padding: 8px;
        font-size: 0.9rem;
    }
    
    .setting-row input[type="checkbox"] {
        width: 20px;
        height: 20px;
        accent-color: #4CAF50;
    }
    
    .setting-row select {
        background-color: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
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
        border: none;
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    
    .save-button {
        background-color: #4CAF50;
        color: white;
    }
    
    .save-button:hover {
        background-color: #45a049;
        transform: translateY(-2px);
    }
    
    .reset-button {
        background-color: transparent;
        color: rgba(255, 255, 255, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.3);
    }
    
    .reset-button:hover {
        background-color: rgba(255, 255, 255, 0.1);
    }
</style> 