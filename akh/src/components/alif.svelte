<script lang="ts">
  import { onMount } from 'svelte';
  import { generateContent } from '../modules/plates-engine';
  import * as AlifUI from '../modules/alif-ui';
  import type { AlifComponentData } from '../types/index';
  import { marked } from 'marked';
  import { t } from '$lib/i18n';

  let promptInput: HTMLTextAreaElement;
  let greeting: HTMLHeadingElement;
  let typingTip: HTMLDivElement;
  let resultText: string = '';
  let isInputPage: boolean = true;
  let isLoading: boolean = false;

  // Create component data object for passing to UI functions
  const componentData: AlifComponentData = {
    promptInput: null,
    greeting: null,
    typingTip: null,
    resultText: '',
    isInputPage: true,
    loadingOverlay: null
  };

  onMount(() => {
    // Update component data with references
    componentData.promptInput = promptInput;
    componentData.greeting = greeting;
    componentData.typingTip = typingTip;
    
    // Initialize UI
    AlifUI.initializeUI(componentData);
  });

  function handleInput(event: Event): void {
    AlifUI.handlePromptInput(event, componentData);
  }

  function handleKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitPrompt();
    }
  }

  async function submitPrompt(): Promise<void> {
    if (!promptInput?.value.trim()) return;
    
    try {
      // First switch pages and show loading state
      isInputPage = false;
      componentData.isInputPage = false;
      isLoading = true;
      resultText = 'Searching for relevant information...';
      AlifUI.switchToResultsPage();
      
      // Generate content with status updates
      const response = await generateContent(
        promptInput.value,
        (status: string) => {
          resultText = status;
          AlifUI.updateStatus(status);
        }
      );
      
      // Display final result after a small delay to ensure transition is complete
      setTimeout(() => {
        resultText = response;
        AlifUI.displayFinalResult(response);
        isLoading = false;
      }, 100);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      resultText = `Sorry, something went wrong: ${errorMessage}`;
      AlifUI.displayError(errorMessage);
      console.error('Error:', error);
      isLoading = false;
    }
  }

  function goBack(): void {
    isInputPage = true;
    componentData.isInputPage = true;
    setTimeout(() => {
      if (promptInput) {
        promptInput.focus();
      }
    }, 0);
  }

  async function renderMarkdown(text: string): Promise<string> {
    return marked(text, {
      breaks: true,
      gfm: true
    });
  }
</script>

<div id="input-page" class="page" class:active={isInputPage}>
  <div class="container">
    <h1 id="greeting" bind:this={greeting}>{t('greeting')}</h1>
    <textarea
      bind:this={promptInput}
      id="prompt-input"
      placeholder={t('what_to_learn')}
      on:input={handleInput}
      on:keypress={handleKeyPress}
      disabled={isLoading}
    ></textarea>
  </div>
  <div id="typing-tip" class="hidden" bind:this={typingTip}>
    {t('press_enter')}
  </div>
</div>

<div id="result-page" class="page" class:active={!isInputPage}>
  <div class="close">
    <button class="back-btn" on:click={goBack} disabled={isLoading}>
      <span class="material-symbols-rounded">close</span>
    </button>
  </div>
  <div class="container">
    <div id="result-text">{resultText}</div>
    {#if isLoading}
      <div class="generation-indicator">
        <div class="galaxy-loader">
          <div class="crescent-moon"></div>
          <div class="star star-1"></div>
          <div class="star star-2"></div>
          <div class="star star-3"></div>
          <div class="star star-4"></div>
          <div class="star star-5"></div>
        </div>
        <div class="status-text">{resultText}</div>
      </div>
    {/if}
  </div>
</div>

<style>
  :global(.material-symbols-rounded) {
    font-family: 'Material Symbols Rounded';
    font-weight: normal;
    font-style: normal;
    font-size: 24px;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    display: inline-block;
    white-space: nowrap;
    word-wrap: normal;
    direction: ltr;
    -webkit-font-smoothing: antialiased;
  }

  #input-page, #result-page {
    margin: 0;
    padding: 0;
    font-family: 'Onest', sans-serif;
    background: #fff8e7;
    color: #000;
    min-height: 100vh;
    overflow: hidden;
  }

  .page {
    height: 100vh;
    width: 100vw;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.5s ease-in-out;
    position: absolute;
    top: 0;
    left: 0;
  }

  .page.active {
    opacity: 1;
    pointer-events: auto;
  }

  .container {
    position: relative;
    min-width: 95%;
    margin: 0 auto;
    height: 100vh;
    margin-left: 40px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: left;
    padding-top: 80px; /* Space for the close button */
    overflow: hidden;
  }

  #greeting {
    position: absolute;
    top: 35%;
    left: 0;
    opacity: 1;
    visibility: visible;
    transition: opacity 0.5s ease, visibility 0.5s ease;
    font-size: 200%;
  }

  .hidden {
    opacity: 0 !important;
    visibility: hidden !important;
  }

  #prompt-input {
    position: absolute;
    top: 45%;
    left: 0;
    transform: translateY(0);
    transition: all 0.5s ease;
    font-family: 'Onest', sans-serif;
    width: 100%;
    padding: 15px;
    background: transparent;
    border: none;
    color: #000;
    font-size: 3rem;
    margin-bottom: 20px;
    resize: vertical;
    display: inline-block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  #prompt-input:focus {
    outline: none;
  }

  #prompt-input.modified {
    top: 50%;
    transform: translateY(-50%);
    display: block;
    white-space: normal;
    width: 100%;
    resize: vertical;
    font-size: 7rem;
  }

  #typing-tip {
    position: absolute;
    bottom: 0;
    left: 0;
    margin-left: 40px;
    margin-bottom: 40px;
    font-size: 1.5em;
    color: #666;
    transition: all 0.5s;
  }

  .close {
    position: absolute;
    top: 0;
    left: 0;
    margin-left: 40px;
    margin-top: 40px;
    z-index: 10;
  }

  .back-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 8px;
    color: #000;
    font-size: 1.5em;
  }

  #result-text {
    flex: 1;
    width: 100%;
    height: calc(100vh - 80px);
    overflow-y: auto;
    padding: 2rem;
    font-size: 2rem;
    line-height: 1.6;
    color: #000;
    position: relative;
  }

  #result-text::-webkit-scrollbar {
    width: 8px;
  }

  #result-text::-webkit-scrollbar-track {
    background: #fff8e7;
  }

  #result-text::-webkit-scrollbar-thumb {
    background: #000;
    border-radius: 4px;
  }

  #result-text::-webkit-scrollbar-thumb:hover {
    background: #333;
  }

  .final-response {
    width: 100%;
    max-width: 100%;
  }

  .final-response h1,
  .final-response h2,
  .final-response h3,
  .final-response h4,
  .final-response h5,
  .final-response h6 {
    margin-top: 2em;
    margin-bottom: 1em;
    font-weight: 700;
  }

  .final-response p {
    margin-bottom: 1.5em;
  }

  .final-response ul,
  .final-response ol {
    margin-bottom: 1.5em;
    padding-left: 2em;
  }

  .final-response li {
    margin-bottom: 0.5em;
  }

  .final-response blockquote {
    border-left: 4px solid #000;
    padding-left: 1em;
    margin: 1.5em 0;
    font-style: italic;
  }

  .final-response code {
    background: #000;
    color: #fff8e7;
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-family: 'Chivo Mono', monospace;
  }

  .final-response pre {
    background: #000;
    color: #fff8e7;
    padding: 1em;
    border-radius: 4px;
    overflow-x: auto;
    margin: 1.5em 0;
  }

  .final-response pre code {
    background: none;
    padding: 0;
  }

  .generation-indicator {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
    z-index: 100;
    background: linear-gradient(to top, rgba(255, 248, 231, 1) 0%, rgba(255, 248, 231, 0.95) 40%, rgba(255, 248, 231, 0.7) 80%, rgba(255, 248, 231, 0) 100%);
    padding: 4rem 2rem;
  }

  .galaxy-loader {
    position: relative;
    width: 100px;
    height: 100px;
    display: flex;
    justify-content: center;
    align-items: center;
    animation: galaxy-rotate 12s infinite linear;
  }

  .crescent-moon {
    position: absolute;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: transparent;
    box-shadow: 15px 15px 0 0 #000;
    animation: moon-pulse 3s infinite ease-in-out;
    transform-origin: 25% 25%;
  }

  .star {
    position: absolute;
    background-color: #000;
    clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
    opacity: 0.8;
    animation: twinkle 3s infinite ease-in-out;
  }

  .star-1 {
    width: 12px;
    height: 12px;
    top: 10px;
    left: 50%;
    animation-delay: 0s;
  }

  .star-2 {
    width: 10px;
    height: 10px;
    top: 50%;
    right: 10px;
    animation-delay: 0.3s;
  }

  .star-3 {
    width: 14px;
    height: 14px;
    bottom: 10px;
    left: 50%;
    animation-delay: 0.6s;
  }

  .star-4 {
    width: 8px;
    height: 8px;
    top: 50%;
    left: 10px;
    animation-delay: 0.9s;
  }

  .star-5 {
    width: 16px;
    height: 16px;
    top: 30px;
    right: 30px;
    animation-delay: 1.2s;
  }

  @keyframes galaxy-rotate {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @keyframes moon-pulse {
    0%, 100% { 
      transform: scale(0.9);
      opacity: 0.85;
    }
    50% { 
      transform: scale(1.1);
      opacity: 1;
    }
  }

  @keyframes twinkle {
    0%, 100% { 
      transform: scale(0.5);
      opacity: 0.5;
    }
    50% { 
      transform: scale(1.3);
      opacity: 1;
    }
  }

  .status-text {
    font-family: 'Onest', sans-serif;
    font-size: 1.4rem;
    color: #000;
    opacity: 0.8;
    text-align: center;
    max-width: 600px;
    line-height: 1.4;
  }

  /* Mobile responsiveness */
  @media (max-width: 768px) {
    .container {
      margin-left: 20px;
      margin-right: 20px;
      width: auto;
      padding-top: 60px;
    }

    #prompt-input {
      font-size: 2rem;
    }

    #prompt-input.modified {
      font-size: 4rem;
    }

    #result-text {
      height: calc(100vh - 60px);
      font-size: 1.5rem;
      padding: 1rem;
    }

    #typing-tip {
      margin-left: 20px;
      margin-bottom: 20px;
      font-size: 1.2em;
    }

    .close {
      margin-left: 20px;
      margin-top: 20px;
    }

    .generation-indicator {
      padding: 3rem 1.5rem;
    }
    
    .galaxy-loader {
      width: 80px;
      height: 80px;
    }
    
    .crescent-moon {
      width: 50px;
      height: 50px;
    }
    
    .star-1 { width: 10px; height: 10px; }
    .star-2 { width: 8px; height: 8px; }
    .star-3 { width: 12px; height: 12px; }
    .star-4 { width: 7px; height: 7px; }
    .star-5 { width: 14px; height: 14px; }
    
    .status-text {
      font-size: 1.2rem;
      max-width: 400px;
    }
  }

  @media (max-width: 480px) {
    #prompt-input {
      font-size: 1.5rem;
    }

    #prompt-input.modified {
      font-size: 3rem;
    }

    #result-text {
      font-size: 1.2rem;
      padding: 0.8rem;
    }

    .generation-indicator {
      padding: 2rem 1rem;
    }
    
    .galaxy-loader {
      width: 60px;
      height: 60px;
    }
    
    .crescent-moon {
      width: 40px;
      height: 40px;
    }
    
    .star-1 { width: 8px; height: 8px; }
    .star-2 { width: 6px; height: 6px; }
    .star-3 { width: 10px; height: 10px; }
    .star-4 { width: 5px; height: 5px; }
    .star-5 { width: 12px; height: 12px; }
    
    .status-text {
      font-size: 1rem;
      max-width: 300px;
    }
  }
</style>
