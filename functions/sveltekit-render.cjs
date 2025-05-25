// This file is used by Netlify to render the SvelteKit app
// It also injects environment variables into the client-side code

// Use CommonJS syntax for Netlify Functions
exports.handler = async function(event, context) {
  try {
    // The path to the handler might change depending on your build
    const { handler } = require('../build/handler.js');
    return await handler(event, context);
  } catch (error) {
    console.error('Error in sveltekit-render.js:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
};
