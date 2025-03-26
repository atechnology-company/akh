export interface AlifComponentData {
  promptInput: HTMLTextAreaElement | null;
  greeting: HTMLHeadingElement | null;
  typingTip: HTMLDivElement | null;
  loadingOverlay: HTMLDivElement | null;
  resultText: string;
  isInputPage: boolean;
}

export interface HTMLElementEvent<T extends HTMLElement> extends Event {
  target: T;
}

export interface Config {
  GOOGLE_API_KEY: string;
  SEARCH_ENGINE_ID: string;
  GEMINI_API_KEY: string;
  GEMINI_API_URL: string;
  IS_DEV?: boolean;
}

export interface SearchResult {
  title: string;
  content: string;
  quotes: Quote[];
  url: string;
  query: string;
}

export interface Quote {
  text: string;
  source: string;
}

export interface GeminiResponse {
  text: string;
  candidates: {
    content: {
        parts: {
            text: string;
        }[];
    };
}[];
}

export interface Tokenizer {
  decode(tokens: number[]): Promise<string>;
}

export type CallbackFunction = (text: string) => Promise<void>;

export interface PrayerTimes {
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export interface AladhanResponse {
  data: {
    timings: {
      Fajr: string;
      Dhuhr: string;
      Asr: string;
      Maghrib: string;
      Isha: string;
      [key: string]: string;
    }
  }
}
