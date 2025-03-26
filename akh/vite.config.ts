import { paraglide } from '@inlang/paraglide-sveltekit/vite';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	// Load env file based on `mode` in the current working directory.
	// Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
	const env = loadEnv(mode, process.cwd(), '');
	
	return {
		plugins: [
			tailwindcss(),
			sveltekit(),
			paraglide({
				project: './project.inlang',
				outdir: './src/lib/paraglide'
			})
		],
		define: {
			'window.__ENV__': JSON.stringify({
				GOOGLE_API_KEY: env.GOOGLE_API_KEY,
				SEARCH_ENGINE_ID: env.SEARCH_ENGINE_ID,
				GEMINI_API_KEY: env.GEMINI_API_KEY
			})
		}
	};
});
