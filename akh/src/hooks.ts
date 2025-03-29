import { i18n } from '$lib/i18n';
import { setLanguageTag, isAvailableLanguageTag } from '$lib/paraglide/runtime';

// Более надежное определение языка браузера с приоритетом над другими источниками
function detectAndSetLanguage() {
  console.log('Detecting browser language...');
  
  // Получаем язык браузера
  let browserLang = 'en';

  if (typeof window !== 'undefined' && navigator) {
    // Проверяем browserLanguage, navigator.language и navigator.languages[0]
    const rawLang = navigator.language || 
                   (navigator as any).browserLanguage || 
                   (navigator.languages && navigator.languages[0]);
    
    browserLang = rawLang ? rawLang.split('-')[0] : 'en';
    console.log('Browser language detected:', browserLang, 'from raw:', rawLang);
  } else {
    console.log('Running in server context, no browser language available');
  }
  
  // Проверяем поддержку языка и устанавливаем его
  if (isAvailableLanguageTag(browserLang)) {
    console.log('Setting language tag to:', browserLang);
    
    // Форсированно устанавливаем язык
    try {
      setLanguageTag(browserLang);
      console.log('Language tag set successfully');
      
      // Если мы в браузере, перезагружаем страницу после смены языка
      if (typeof window !== 'undefined' && window.sessionStorage) {
        // Сохраняем выбранный язык в сессии для сохранения после перезагрузки
        window.sessionStorage.setItem('preferred_language', browserLang);
        console.log('Language preference saved to session storage');
      }
    } catch (e) {
      console.error('Error setting language tag:', e);
    }
  } else {
    // Используем английский, если язык браузера не поддерживается
    console.log('Browser language not supported, defaulting to English');
    setLanguageTag('en');
  }
}

// Запускаем определение языка
detectAndSetLanguage();

// Экспортируем reroute для SvelteKit
export const reroute = i18n.reroute();
