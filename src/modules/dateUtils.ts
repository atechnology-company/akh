/**
 * Utility functions for date formatting and calculations
 */

/**
 * Format a date into a readable string
 * @param date The date to format
 * @param format Optional format specification
 * @returns Formatted date string
 */
export function formatDate(date: Date, format: string = 'full'): string {
  switch (format) {
    case 'full':
      return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    case 'short':
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    case 'time':
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    case 'datetime':
      return `${formatDate(date, 'short')} ${formatDate(date, 'time')}`;
    default:
      return date.toLocaleDateString();
  }
}

/**
 * Calculate approximate Hijri date from Gregorian date
 * Note: This is a simple approximation and not accurate for all dates
 * @param date Gregorian date
 * @returns Hijri date string
 */
export function getHijriDate(date: Date = new Date()): string {
  // Simple Hijri date calculation (this is a placeholder - ideally use a proper Hijri calendar library)
  const timestamp = date.getTime();
  const hijriYear = Math.floor((timestamp - 1970) / 31556952000) + 1390; // Rough estimate
  const hijriMonthNames = ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', 'Shaban', 'Ramadan', 'Shawwal', 'Dhu al-Qadah', 'Dhu al-Hijjah'];
  const hijriMonth = hijriMonthNames[Math.floor(((date.getMonth() + 2) % 12))];
  const hijriDay = ((date.getDate() + 15) % 30) || 30;
  return `${hijriDay} ${hijriMonth} ${hijriYear} AH`;
}