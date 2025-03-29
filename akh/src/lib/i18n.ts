import * as runtime from '$paraglide-internal-virtual-module:runtime';
import { createI18n } from '@inlang/paraglide-sveltekit';
import * as paraglideMessages from '$paraglide-internal-virtual-module:messages';

export const i18n = createI18n(runtime);

// Additional translations not in Paraglide
const additionalTranslations = {
  en: {
    what_to_learn: "What would you like to learn today?",
    press_enter: "just press enter to search",
    error_occurred: "Error occurred",
    scroll_to_see: "Scroll to see all prayer times",
    scroll_again: "Scroll again to see the focused view",
    swipe_up_hint: "Swipe up to see all prayer times",
    swipe_down_hint: "Go back"
  },
  ru: {
    what_to_learn: "Что вы хотели бы узнать сегодня?",
    press_enter: "просто нажмите enter для поиска",
    error_occurred: "Произошла ошибка",
    scroll_to_see: "Прокрутите, чтобы увидеть все время молитв",
    scroll_again: "Прокрутите еще раз, чтобы увидеть фокусированный вид",
    swipe_up_hint: "Проведите вверх, чтобы увидеть все время молитв",
    swipe_down_hint: "Вернуться"
  },
  id: {
    what_to_learn: "Apa yang ingin Anda pelajari hari ini?",
    press_enter: "tekan enter untuk mencari",
    error_occurred: "Terjadi kesalahan",
    scroll_to_see: "Scroll untuk melihat semua waktu sholat",
    scroll_again: "Scroll lagi untuk melihat tampilan fokus",
    swipe_up_hint: "Geser ke atas untuk melihat semua waktu sholat",
    swipe_down_hint: "Kembali"
  },
  zh: {
    what_to_learn: "今天您想学习什么？",
    press_enter: "按回车键搜索",
    error_occurred: "发生错误",
    scroll_to_see: "滚动查看所有礼拜时间",
    scroll_again: "再次滚动查看聚焦视图",
    swipe_up_hint: "向上滑动查看所有礼拜时间",
    swipe_down_hint: "返回"
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
    first_third: "First Third"
  },
  ru: {
    fajr: "Фаджр",
    dhuhr: "Зухр",
    asr: "Аср",
    maghrib: "Магриб",
    isha: "Иша",
    midnight: "Полночь",
    first_third: "Первая треть"
  },
  id: {
    fajr: "Subuh",
    dhuhr: "Dzuhur",
    asr: "Ashar",
    maghrib: "Maghrib",
    isha: "Isya",
    midnight: "Tengah Malam",
    first_third: "Sepertiga Malam"
  },
  zh: {
    fajr: "晨礼",
    dhuhr: "晌礼",
    asr: "晡礼",
    maghrib: "昏礼",
    isha: "宵礼",
    midnight: "午夜",
    first_third: "夜三分之一"
  }
};

// Create a translation function that handles both Paraglide and custom translations
export const t = (key: string): string => {
  const lang = runtime.languageTag ? runtime.languageTag() : 'en';
  
  // Handle nested keys like "prayer_names.fajr"
  const parts = key.split('.');
  if (parts.length > 1 && parts[0] === 'prayer_names') {
    const prayerName = parts[1];
    return prayerNames[lang as keyof typeof prayerNames]?.[prayerName as keyof (typeof prayerNames)['en']] || prayerName;
  }
  
  // For regular keys, check if the key exists in paraglide
  const messageFunction = paraglideMessages && typeof paraglideMessages === 'object' ? (paraglideMessages as any)[key] : null;
  if (typeof messageFunction === 'function') {
    return messageFunction();
  }
  
  // Check additional translations
  const additional = additionalTranslations[lang as keyof typeof additionalTranslations]?.[key as keyof (typeof additionalTranslations)['en']];
  if (additional) {
    return additional;
  }
  
  // If not found, return the key itself
  return key;
};
