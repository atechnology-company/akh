import { Application, Observable } from '@nativescript/core';

// Create observable view model for binding
const viewModel = new Observable();

// Set WebView URL - use localhost for development, production URL for release
if (__DEV__) {
    viewModel.set('webViewUrl', 'http://10.0.2.2:5173'); // Special Android emulator IP for localhost
} else {
    // For production build, bundle the SvelteKit app and serve locally
    // or use deployed URL
    viewModel.set('webViewUrl', '~/www/index.html');
}

// Set app context
Application.run({ 
    moduleName: 'app-root',
    bindingContext: viewModel 
}); 