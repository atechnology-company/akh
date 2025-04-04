import * as runtime from '$paraglide-internal-virtual-module:runtime';
import { createI18n } from '@inlang/paraglide-sveltekit';
import * as paraglideMessages from '$paraglide-internal-virtual-module:messages';
import { writable, derived } from 'svelte/store';

// Игнорируем ошибки импорта для virtual module
// @ts-ignore
export const i18n = createI18n(runtime);

// Определяем начальный язык более надежно, приоритет отдаем браузеру
function getInitialLanguage(): string {
  // Сначала пробуем определить по браузеру (изменил порядок приоритета)
  if (typeof window !== 'undefined' && navigator) {
    const browserLang = (navigator.language || 
                         (navigator as any).browserLanguage || 
                         (navigator.languages && navigator.languages[0]) || 
                         'en').split('-')[0];
    console.log('Language from browser:', browserLang);
    
    // Проверяем, поддерживается ли язык
    // @ts-ignore
    if (runtime.isAvailableLanguageTag && runtime.isAvailableLanguageTag(browserLang)) {
      console.log('Using browser language:', browserLang);
      // Устанавливаем язык на runtime тоже
      if (runtime.setLanguageTag) {
        // @ts-ignore
        runtime.setLanguageTag(browserLang);
      }
      return browserLang;
    }
  }
  
  // Вторым пробуем получить язык из runtime API
  // @ts-ignore
  const runtimeTag = runtime.languageTag ? runtime.languageTag() : null;
  
  if (runtimeTag) {
    console.log('Falling back to runtime language:', runtimeTag);
    return runtimeTag;
  }
  
  // По умолчанию возвращаем английский
  console.log('No language detected, defaulting to English');
  return 'en';
}

// Create a reactive store for the current language
export const currentLanguage = writable<string>(getInitialLanguage());

// Update the store when language changes
// @ts-ignore
if (typeof runtime.onSetLanguageTag === 'function') {
  // @ts-ignore
  runtime.onSetLanguageTag((tag: string) => {
    console.log('Language changed to:', tag);
    currentLanguage.set(tag);
  });
}

// Additional translations not in Paraglide
const additionalTranslations = {
  en: {
    greeting: "Assalamualaikum!",
    what_to_learn: "What would you like to learn today?",
    press_enter: "just press enter to search",
    error_occurred: "Error occurred",
    scroll_to_see: "Scroll to see all prayer times",
    scroll_again: "Scroll again to see the focused view",
    swipe_up_hint: "Swipe up to see all prayer times",
    swipe_down_hint: "Go back",
    donate_here: "donate here",
    the_other_button: "the other button",
    qibla_finding: "Finding Qibla direction...",
    qibla_north: "Point your device towards North",
    qibla_error: "Error accessing compass",
    qibla_accuracy: "Compass accuracy is low",
    qibla_permission: "Please allow compass access",
    qibla_title: "Qibla Direction",
    qibla_degrees: "degrees",
    about_title: "About",
    unknown_location: "Location unavailable",
    prayer_times_updated: "Prayer times updated",
    error_updating_prayer_times: "Error updating prayer times",
    scroll_for_more: "Scroll for more"
  },
  ru: {
    greeting: "Ассаляму алейкум!",
    what_to_learn: "Что вы хотели бы узнать сегодня?",
    press_enter: "просто нажмите enter для поиска",
    error_occurred: "Произошла ошибка",
    scroll_to_see: "Прокрутите, чтобы увидеть все время молитв",
    scroll_again: "Прокрутите еще раз, чтобы увидеть фокусированный вид",
    swipe_up_hint: "Проведите вверх, чтобы увидеть все время молитв",
    swipe_down_hint: "Вернуться",
    donate_here: "пожертвовать здесь",
    the_other_button: "другая кнопка",
    qibla_finding: "Поиск направления Киблы...",
    qibla_north: "Направьте устройство на север",
    qibla_error: "Ошибка доступа к компасу",
    qibla_accuracy: "Низкая точность компаса",
    qibla_permission: "Пожалуйста, разрешите доступ к компасу",
    qibla_title: "Направление Киблы",
    qibla_degrees: "градусов",
    about_title: "О приложении",
    unknown_location: "Местоположение недоступно",
    prayer_times_updated: "Время молитв обновлено",
    error_updating_prayer_times: "Ошибка обновления времени молитв",
    scroll_for_more: "Прокрутите для большего"
  },
  id: {
    greeting: "Assalamualaikum!",
    what_to_learn: "Apa yang ingin Anda pelajari hari ini?",
    press_enter: "tekan enter untuk mencari",
    error_occurred: "Terjadi kesalahan",
    scroll_to_see: "Scroll untuk melihat semua waktu sholat",
    scroll_again: "Scroll lagi untuk melihat tampilan fokus",
    swipe_up_hint: "Geser ke atas untuk melihat semua waktu sholat",
    swipe_down_hint: "Kembali",
    donate_here: "donasi di sini",
    the_other_button: "tombol lainnya",
    qibla_finding: "Mencari arah Kiblat...",
    qibla_north: "Arahkan perangkat ke Utara",
    qibla_error: "Kesalahan mengakses kompas",
    qibla_accuracy: "Akurasi kompas rendah",
    qibla_permission: "Izinkan akses kompas",
    qibla_title: "Arah Kiblat",
    qibla_degrees: "derajat",
    about_title: "Tentang",
    unknown_location: "Lokasi tidak tersedia",
    prayer_times_updated: "Waktu sholat diperbarui",
    error_updating_prayer_times: "Gagal memperbarui waktu sholat",
    scroll_for_more: "Gulir untuk lebih banyak"
  },
  zh: {
    greeting: "安赛俩目阿莱库姆!",
    what_to_learn: "今天您想学习什么？",
    press_enter: "按回车键搜索",
    error_occurred: "发生错误",
    scroll_to_see: "滚动查看所有礼拜时间",
    scroll_again: "再次滚动查看聚焦视图",
    swipe_up_hint: "向上滑动查看所有礼拜时间",
    swipe_down_hint: "返回",
    donate_here: "在这里捐赠",
    the_other_button: "另一个按钮",
    qibla_finding: "正在查找朝向麦加的方向...",
    qibla_north: "将设备指向北方",
    qibla_error: "访问指南针时出错",
    qibla_accuracy: "指南针精度低",
    qibla_permission: "请允许访问指南针",
    qibla_title: "朝向麦加的方向",
    qibla_degrees: "度",
    about_title: "关于",
    unknown_location: "位置不可用",
    prayer_times_updated: "礼拜时间已更新",
    error_updating_prayer_times: "更新礼拜时间失败",
    scroll_for_more: "滚动查看更多"
  }
};

// Prayer names in different languages
const prayerNames = {
  en: {
    fajr: "Fajr",
    dhuhr: "Dhuhr",
    asr: "Asr",
    maghrib: "Maghrib",
    isha: "Isha",
    midnight: "Midnight",
    first_third: "First Third",
    last_third: "Last Third",
    sunrise: "Sunrise",
    sunset: "Sunset"
  },
  ru: {
    fajr: "Фаджр",
    dhuhr: "Зухр",
    asr: "Аср",
    maghrib: "Магриб",
    isha: "Иша",
    midnight: "Полночь",
    first_third: "Первая треть ночи",
    last_third: "Последняя треть ночи",
    sunrise: "Восход",
    sunset: "Закат"
  },
  id: {
    fajr: "Subuh",
    dhuhr: "Dzuhur",
    asr: "Ashar",
    maghrib: "Maghrib",
    isha: "Isya",
    midnight: "Tengah Malam",
    first_third: "Sepertiga Awal Malam",
    last_third: "Sepertiga Akhir Malam",
    sunrise: "Matahari Terbit",
    sunset: "Matahari Terbenam"
  },
  zh: {
    fajr: "晨礼",
    dhuhr: "晌礼",
    asr: "晡礼",
    maghrib: "昏礼",
    isha: "宵礼",
    midnight: "午夜",
    first_third: "夜间第一个三分之一",
    last_third: "夜间最后三分之一",
    sunrise: "日出",
    sunset: "日落"
  }
};

// Create a translation function that handles both Paraglide and custom translations
export const t = (key: string): string => {
  // Get current language more reliably
  const lang = getInitialLanguage();
  console.log(`Translating key "${key}" with language "${lang}"`);
  
  // Handle nested keys like "prayer_names.fajr"
  const parts = key.split('.');
  if (parts.length > 1 && parts[0] === 'prayer_names') {
    const prayerName = parts[1];
    // Handle the case where first-third is passed instead of first_third
    const normalizedPrayerName = prayerName === 'first-third' ? 'first_third' : 
                                prayerName === 'last-third' ? 'last_third' : prayerName;
    return prayerNames[lang as keyof typeof prayerNames]?.[normalizedPrayerName as keyof (typeof prayerNames)['en']] || prayerName;
  }
  
  // Normalize keys with hyphens to underscores for prayer time names
  const normalizedKey = key === 'first-third' ? 'first_third' : 
                        key === 'last-third' ? 'last_third' : key;
  
  // For regular keys, first check our additionalTranslations
  const additional = additionalTranslations[lang as keyof typeof additionalTranslations]?.[normalizedKey as keyof (typeof additionalTranslations)['en']];
  if (additional) {
    return additional;
  }
  
  // Add fallback translations for these common keys that have problems
  if (key === 'loading_prayer_times') {
    return lang === 'ru' ? 'загрузка времени молитв' : 
           lang === 'id' ? 'memuat waktu sholat' :
           lang === 'zh' ? '加载礼拜时间' : 'loading prayer times';
  }
  
  if (key === 'until') {
    return lang === 'ru' ? 'до' : 
           lang === 'id' ? 'sampai' :
           lang === 'zh' ? '直到' : 'until';
  }
  
  if (key === 'retry') {
    return lang === 'ru' ? 'Повторить' : 
           lang === 'id' ? 'Coba lagi' :
           lang === 'zh' ? '重试' : 'Retry';
  }
  
  if (key === 'error_fetching') {
    return lang === 'ru' ? 'Не удалось получить время молитв' : 
           lang === 'id' ? 'Gagal mengambil waktu sholat' :
           lang === 'zh' ? '获取礼拜时间失败' : 'Failed to fetch prayer times';
  }
  
  if (key === 'unknown_error') {
    return lang === 'ru' ? 'Произошла неизвестная ошибка' : 
           lang === 'id' ? 'Terjadi kesalahan yang tidak diketahui' :
           lang === 'zh' ? '发生未知错误' : 'An unknown error occurred';
  }
  
  // Then check if the key exists in paraglide
  try {
    // @ts-ignore
    const messageFunction = paraglideMessages && typeof paraglideMessages === 'object' ? (paraglideMessages as any)[key] : null;
    if (typeof messageFunction === 'function') {
      return messageFunction();
    }
  } catch (e) {
    console.warn(`Error accessing paraglide message for key "${key}":`, e);
  }
  
  // If not found, return the key itself
  return key;
};

// Create a reactive translation function that updates when language changes
export const tStore = (key: string) => {
  return derived(currentLanguage, ($currentLanguage) => {
    return t(key);
  });
};
