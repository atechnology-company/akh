import adapter from '@sveltejs/adapter-netlify';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			// Use static adapter mode for Netlify
			edge: false,
			split: false,
			
			// Set fallback to SPA mode
			fallback: 'index.html',
			
			// Set the output directory to 'build' to match netlify.toml
			out: 'build'
		})
	}
};

export default config;
