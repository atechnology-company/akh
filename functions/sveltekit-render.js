// This file is used by Netlify to render the SvelteKit app
// It also injects environment variables into the client-side code

exports.handler = async function(event, context) {
  const svelteKitModule = await import('/var/.netlify/functions-internal/sveltekit-render.mjs');
  return svelteKitModule.handler(event, context);
};
