import { i18n } from '$lib/i18n';
import { setLanguageTag, isAvailableLanguageTag } from '$lib/paraglide/runtime';

// Более надежное определение языка браузера с приоритетом над другими источниками
function detectAndSetLanguage() {
  console.log('Detecting browser language...');
  
  // Получаем язык браузера
  let browserLang = 'en';

  if (typeof window !== 'undefined' && navigator) {
    // Check browser language, navigator.language and navigator.languages[0]
    const rawLang = navigator.language || 
                   (navigator as unknown).browserLanguage || 
                   (navigator.languages && navigator.languages[0]);
    
    browserLang = rawLang ? rawLang.split('-')[0] : 'en';
    console.log('Browser language detected:', browserLang, 'from raw:', rawLang);
  } else {
    console.log('Running in server context, no browser language available');
  }
  
  // Check if language is supported and set it
  if (isAvailableLanguageTag(browserLang)) {
    console.log('Setting language tag to:', browserLang);
    
    // Force set the language
    try {
      setLanguageTag(browserLang);
      console.log('Language tag set successfully');
      
      // If in browser, reload page after language change
      if (typeof window !== 'undefined' && window.sessionStorage) {
        // Save selected language in session for persistence after reload
        window.sessionStorage.setItem('preferred_language', browserLang);
        console.log('Language preference saved to session storage');
      }
    } catch (e) {
      console.error('Error setting language tag:', e);
    }
  } else {
    // Use English if browser language is not supported
    console.log('Browser language not supported, defaulting to English');
    setLanguageTag('en');
  }
}

// Start language detection
detectAndSetLanguage();

// Export reroute for SvelteKit
export const reroute = i18n.reroute();
