import adapter from '@sveltejs/adapter-netlify';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			// Split the edge function into multiple smaller functions
			split: true,
			
			// Configure function options
			edge: false, // Use regular Netlify Functions instead of Edge Functions
			
			// Configure function runtime - exclude large libraries from bundle
			externals: [
				'@huggingface/transformers',
				'@nativescript/core',
				'@nativescript/geolocation',
				'marked'
			],
			
			// Function output directory
			functionDirectory: 'functions',
			
			// Set the output directory to 'build' to match netlify.toml
			out: 'build'
		})
	}
};

export default config;
