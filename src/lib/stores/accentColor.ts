import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Default accent color
const DEFAULT_ACCENT = '#ff6600';
const DEFAULT_GRADIENT = 'linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d)';

// Create the stores
export const accentColor = writable(DEFAULT_ACCENT);
export const gradientColor = writable(DEFAULT_GRADIENT);

// Subscribe to changes and update CSS variables
if (browser) {
    accentColor.subscribe(value => {
        document.documentElement.style.setProperty('--accent-color', value);
    });
    
    gradientColor.subscribe(value => {
        document.documentElement.style.setProperty('--gradient-color', value);
    });
} 