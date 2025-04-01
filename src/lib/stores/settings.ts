import { writable } from 'svelte/store';
import { CalculationMethod, HighLatitudeRule, Madhab } from 'adhan';
import { ASR_METHODS } from '../constants';

export interface Settings {
    calculationMethod: keyof typeof CalculationMethod;
    asrMethod: string;
    highLatitudeRule: keyof typeof HighLatitudeRule;
    madhab: keyof typeof Madhab;
    adjustments: {
        fajr: number;
        sunrise: number;
        dhuhr: number;
        asr: number;
        maghrib: number;
        isha: number;
    };
    notifications: {
        enabled: boolean;
        sound: boolean;
        volume: number;
        prayerNotifications: {
            fajr: boolean;
            sunrise: boolean;
            dhuhr: boolean;
            asr: boolean;
            maghrib: boolean;
            isha: boolean;
        };
    };
}

export const settings = writable<Settings>({
    calculationMethod: 'MuslimWorldLeague',
    asrMethod: ASR_METHODS.STANDARD,
    highLatitudeRule: 'MiddleOfTheNight',
    madhab: 'Shafi',
    adjustments: {
        fajr: 0,
        sunrise: 0,
        dhuhr: 0,
        asr: 0,
        maghrib: 0,
        isha: 0
    },
    notifications: {
        enabled: true,
        sound: true,
        volume: 0.5,
        prayerNotifications: {
            fajr: true,
            sunrise: true,
            dhuhr: true,
            asr: true,
            maghrib: true,
            isha: true
        }
    }
}); 