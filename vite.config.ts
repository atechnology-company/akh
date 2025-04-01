import { paraglide } from '@inlang/paraglide-sveltekit/vite';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import path from 'path';
import fs from 'fs';

export default defineConfig(({ mode }) => {
	// Load env file based on `mode` in the current working directory.
	// Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
	const env = loadEnv(mode, process.cwd(), '');
	
	// Custom plugin to handle paraglide virtual modules
	const paraglideVirtualModulePlugin: Plugin = {
		name: 'paraglide-virtual-module-plugin',
		resolveId(id) {
			if (id === '$paraglide-internal-virtual-module:runtime' || 
				id === '$paraglide-internal-virtual-module:runtime.js') {
				return id;
			}
			if (id === '$paraglide-internal-virtual-module:messages' ||
				id === '$paraglide-internal-virtual-module:messages.js') {
				return id;
			}
			return null;
		},
		load(id) {
			try {
				if (id === '$paraglide-internal-virtual-module:runtime' || 
					id === '$paraglide-internal-virtual-module:runtime.js') {
					// Provide runtime module implementation directly
					return `
// Mock Paraglide runtime module
export const sourceLanguageTag = 'en';
export const availableLanguageTags = ['en', 'ru', 'id', 'zh'];

let _currentLanguageTag = 'en';

export function languageTag() { return _currentLanguageTag; }
export function setLanguageTag(tag) { 
	if (availableLanguageTags.includes(tag)) {
		_currentLanguageTag = tag;
	}
}
export function getLanguageTag() { return _currentLanguageTag; }
export function isAvailableLanguageTag(tag) {
	return availableLanguageTags.includes(tag);
}

// RTL languages would include Arabic, Hebrew, etc.
const rtlLanguages = [];
export const isRtl = rtlLanguages.includes(_currentLanguageTag);
export const textDirection = isRtl ? 'rtl' : 'ltr';
`;
				}
				if (id === '$paraglide-internal-virtual-module:messages' ||
					id === '$paraglide-internal-virtual-module:messages.js') {
					// Provide empty messages module with basic functionality
					return `
// Mock Paraglide messages module
export const hello = () => "Hello";
export const welcome = () => "Welcome";
`;
				}
			} catch (err) {
				console.error(`Error loading paraglide module: ${err}`);
			}
			return null;
		}
	};
	
	return {
		plugins: [
			tailwindcss(),
			sveltekit(),
			paraglide({
				project: './project.inlang',
				outdir: './src/lib/paraglide'
			}),
			paraglideVirtualModulePlugin
		],
		define: {
			'window.__ENV__': JSON.stringify({
				GOOGLE_API_KEY: env.GOOGLE_API_KEY,
				SEARCH_ENGINE_ID: env.SEARCH_ENGINE_ID,
				GEMINI_API_KEY: env.GEMINI_API_KEY,
				NODE_ENV: mode
			})
		},
		// Expose environment variables to the client
		envPrefix: ['VITE_'],
		build: {
			minify: 'terser',
			terserOptions: {
				compress: {
					drop_console: true,
				},
			},
			rollupOptions: {
				output: {
					manualChunks: {
						sveltekit: ['@sveltejs/kit', 'svelte']
					}
				}
			}
		}
	};
});
