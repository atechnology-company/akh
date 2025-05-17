// This file is used by Netlify to render the SvelteKit app
// It also injects environment variables into the client-side code

exports.handler = async function(event, context) {
  // Use a relative path instead of absolute path
  const svelteKitModule = await import('./sveltekit-render.mjs');
  return svelteKitModule.handler(event, context);
};
