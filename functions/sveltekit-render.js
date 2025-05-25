// .netlify/functions-internal/handler.js or .mjs depending on your setup

// Import the handler using ESM syntax
import { handler } from '../.netlify/functions-internal/sveltekit-render.js';

export { handler as default };
