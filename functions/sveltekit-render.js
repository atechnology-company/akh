// This file is used by Netlify to render the SvelteKit app
// It also injects environment variables into the client-side code

exports.handler = require('../.netlify/functions-internal/sveltekit-render.mjs').handler;
