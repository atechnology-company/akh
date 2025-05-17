// This file injects environment variables into the client-side code for Netlify deployment

exports.handler = async function(event, context) {
  // Get the HTML content from the SvelteKit render function
  const { handler } = require('../.netlify/functions-internal/sveltekit-render.mjs');
  const response = await handler(event, context);
  
  // Only process HTML responses
  const isHtml = response.headers && 
                (response.headers['content-type'] || '').includes('text/html');
  
  if (isHtml && response.body) {
    // Create a script tag with environment variables
    const envScript = `
      <script>
        window.__ENV__ = window.__ENV__ || {};
        window.__ENV__.GOOGLE_API_KEY = "${process.env.GOOGLE_API_KEY || ''}";
        window.__ENV__.SEARCH_ENGINE_ID = "${process.env.SEARCH_ENGINE_ID || ''}";
        window.__ENV__.GEMINI_API_KEY = "${process.env.GEMINI_API_KEY || ''}";
        window.__ENV__.NODE_ENV = "${process.env.NODE_ENV || 'production'}";
      </script>
    `;
    
    // Insert the script tag after the opening head tag
    let html = response.body;
    html = html.replace('<head>', '<head>' + envScript);
    
    // Update the response body
    response.body = html;
    
    // Update content length if it exists
    if (response.headers && response.headers['content-length']) {
      response.headers['content-length'] = Buffer.from(html).length.toString();
    }
  }
  
  return response;
};