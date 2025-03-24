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
