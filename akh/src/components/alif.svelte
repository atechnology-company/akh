<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { generateContent } from '../modules/plates-engine';
  import * as AlifUI from '../modules/alif-ui';
  import type { AlifComponentData, TopicSection } from '../types/index';
  import { marked } from 'marked';
  import { t, currentLanguage } from '$lib/i18n';
  import { languageTag } from '$lib/paraglide/runtime';

  let promptInput: HTMLTextAreaElement;
  let greeting: HTMLHeadingElement;
  let typingTip: HTMLDivElement;
  let resultText: string = '';
  let isInputPage: boolean = true;
  let isLoading: boolean = false;
  let isMultiTopic: boolean = false;
  let topicSections: TopicSection[] = [];
  let activeTopicIndex: number = 0;
  let isTransitioning: boolean = false;
  let touchStartY: number = 0;
  let scrollTimeout: NodeJS.Timeout;
  let translatedGreeting: string = '';

  // Subscribe to language changes
  const unsubscribe = currentLanguage.subscribe(lang => {
    // Update greeting text when language changes
    translatedGreeting = t('greeting');
    
    // Update UI if component refs are available
    if (greeting) {
      greeting.innerText = translatedGreeting;
    }
    
    if (typingTip) {
      typingTip.innerText = t('press_enter');
    }
    
    if (promptInput) {
      promptInput.placeholder = t('what_to_learn');
    }
  });

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
    // Get translated greeting
    translatedGreeting = t('greeting');
    
    // Update component data with references
    componentData.promptInput = promptInput;
    componentData.greeting = greeting;
    componentData.typingTip = typingTip;
    
    // Initialize UI
    AlifUI.initializeUI(componentData);
  });
  
  onDestroy(() => {
    // Clean up subscription
    unsubscribe();
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

  function handleTouchStart(event: TouchEvent): void {
    touchStartY = event.touches[0].clientY;
  }

  function handleTouchMove(event: TouchEvent): void {
    if (isTransitioning || !isMultiTopic) return;
    
    const currentY = event.touches[0].clientY;
    const diffY = touchStartY - currentY;
    
    // Significant swipe (> 50px)
    if (Math.abs(diffY) > 50) {
      if (diffY > 0 && activeTopicIndex < topicSections.length - 1) {
        // Swipe up - next topic
        navigateToTopic(activeTopicIndex + 1);
      } else if (diffY < 0 && activeTopicIndex > 0) {
        // Swipe down - previous topic
        navigateToTopic(activeTopicIndex - 1);
      }
      touchStartY = currentY;
    }
  }

  function handleWheel(event: WheelEvent): void {
    if (isTransitioning || !isMultiTopic) return;
    
    clearTimeout(scrollTimeout);
    
    scrollTimeout = setTimeout(() => {
      if (event.deltaY > 0 && activeTopicIndex < topicSections.length - 1) {
        // Scroll down - next topic
        navigateToTopic(activeTopicIndex + 1);
      } else if (event.deltaY < 0 && activeTopicIndex > 0) {
        // Scroll up - previous topic
        navigateToTopic(activeTopicIndex - 1);
      }
    }, 50);
  }

  function navigateToTopic(index: number): void {
    if (isTransitioning) return;
    
    // Validate input
    if (!topicSections || !Array.isArray(topicSections) || topicSections.length === 0) {
      console.error('Cannot navigate: no topic sections available');
      return;
    }
    
    // Clamp index to valid range
    if (index < 0 || index >= topicSections.length) {
      console.error(`Invalid topic index: ${index}. Valid range: 0-${topicSections.length - 1}`);
      index = Math.max(0, Math.min(index, topicSections.length - 1));
    }
    
    isTransitioning = true;
    
    // Fade out current topic
    const resultElement = document.getElementById('result-text');
    if (resultElement) {
      resultElement.style.opacity = '0';
      
      // After fade out, switch topics
      setTimeout(() => {
        activeTopicIndex = index;
        
        // Fade in new topic
        setTimeout(() => {
          if (resultElement) {
            resultElement.style.opacity = '1';
          }
          isTransitioning = false;
        }, 300);
      }, 300);
    } else {
      console.warn('Result element not found in DOM');
      activeTopicIndex = index;
      isTransitioning = false;
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
      isMultiTopic = false;
      topicSections = [];
      activeTopicIndex = 0;
      AlifUI.switchToResultsPage();
      
      // Generate content with status updates
      const response = await generateContent(
        promptInput.value,
        (status: string) => {
          resultText = status;
          AlifUI.updateStatus(status);
        }
      );
      
      // Handle the response based on its type (string or TopicSection[])
      setTimeout(() => {
        if (Array.isArray(response)) {
          isMultiTopic = true;
          topicSections = response;
          // Display first topic immediately
          resultText = topicSections[0].content;
          AlifUI.displayFinalResult(topicSections[0].content);
        } else {
          resultText = response;
          AlifUI.displayFinalResult(response);
        }
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
    isMultiTopic = false;
    topicSections = [];
    activeTopicIndex = 0;
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
    <h1 id="greeting" bind:this={greeting}>{translatedGreeting}</h1>
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

<div id="result-page" class="page" class:active={!isInputPage} 
     on:wheel={handleWheel} 
     on:touchstart={handleTouchStart} 
     on:touchmove={handleTouchMove}>
  <div class="close">
    <button class="back-btn" on:click={goBack} disabled={isLoading}>
      <span class="material-symbols-rounded">close</span>
    </button>
  </div>
  
  {#if isMultiTopic}
    <div class="topic-navigation">
      {#if topicSections && Array.isArray(topicSections)}
        {#each topicSections as section, i}
          {#if section && typeof section === 'object' && section.id && section.title}
            <div class="topic-dot" class:active={i === activeTopicIndex} on:click={() => navigateToTopic(i)}>
              <span class="dot-label">{i + 1}</span>
              <span class="dot-tooltip">{section.title}</span>
            </div>
          {/if}
        {/each}
      {/if}
    </div>
    
    <div class="topic-header">
      <h2>{topicSections && Array.isArray(topicSections) && activeTopicIndex >= 0 && activeTopicIndex < topicSections.length ? (topicSections[activeTopicIndex]?.title || 'Section') : 'Section'}</h2>
      <div class="topic-indicator">
        <span>{activeTopicIndex + 1}/{topicSections && Array.isArray(topicSections) ? topicSections.length : 1}</span>
      </div>
    </div>
  {/if}
  
  <div class="container">
    <div id="result-text" class:multi-topic={isMultiTopic}>
      {#if isMultiTopic}
        {#if topicSections && topicSections.length > 0 && activeTopicIndex >= 0 && activeTopicIndex < topicSections.length}
          {@html marked(topicSections[activeTopicIndex]?.content || 'No content available', { 
            breaks: true, 
            gfm: true
          })}
        {:else}
          <div class="error-message">Error loading content. Please try again.</div>
        {/if}
      {:else if resultText.includes('<div class="quote-container">')}
        {@html marked(resultText, { 
          breaks: true, 
          gfm: true
        })}
      {:else}
        {resultText}
      {/if}
    </div>
    
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
    
    {#if isMultiTopic && !isLoading}
      <div class="swipe-indicators">
        {#if topicSections && Array.isArray(topicSections) && activeTopicIndex > 0}
          <div class="swipe-up" on:click={() => navigateToTopic(activeTopicIndex - 1)}>
            <span class="material-symbols-rounded">expand_less</span>
            <span class="swipe-text">Previous: {(topicSections[activeTopicIndex - 1]?.title || 'Previous Section').substr(0, 30)}{topicSections[activeTopicIndex - 1]?.title?.length > 30 ? '...' : ''}</span>
          </div>
        {/if}
        
        {#if topicSections && Array.isArray(topicSections) && activeTopicIndex < topicSections.length - 1}
          <div class="swipe-down" on:click={() => navigateToTopic(activeTopicIndex + 1)}>
            <span class="swipe-text">Next: {(topicSections[activeTopicIndex + 1]?.title || 'Next Section').substr(0, 30)}{topicSections[activeTopicIndex + 1]?.title?.length > 30 ? '...' : ''}</span>
            <span class="material-symbols-rounded">expand_more</span>
          </div>
        {/if}
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

  .topic-navigation {
    position: fixed;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 15px;
    z-index: 100;
  }

  .topic-dot {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    position: relative;
    transition: all 0.3s ease;
  }

  .topic-dot.active {
    background: #000;
    transform: scale(1.2);
  }

  .dot-label {
    color: rgba(255, 255, 255, 0.8);
    font-size: 12px;
    font-weight: bold;
  }

  .topic-dot.active .dot-label {
    color: #fff8e7;
  }

  .dot-tooltip {
    position: absolute;
    right: 40px;
    background: rgba(0, 0, 0, 0.8);
    color: #fff;
    padding: 5px 10px;
    border-radius: 4px;
    font-size: 14px;
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s ease;
    pointer-events: none;
    white-space: nowrap;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .topic-dot:hover .dot-tooltip {
    opacity: 1;
    visibility: visible;
  }

  .topic-header {
    position: absolute;
    top: 40px;
    left: 80px;
    right: 80px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 5;
  }

  .topic-header h2 {
    margin: 0;
    font-size: 2rem;
    font-weight: 300;
  }

  .topic-indicator {
    background: rgba(0, 0, 0, 0.1);
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 14px;
  }

  #result-text.multi-topic {
    padding-top: 60px;
    transition: opacity 0.3s ease;
  }

  .swipe-indicators {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    pointer-events: none;
  }

  .swipe-up, .swipe-down {
    background: rgba(0, 0, 0, 0.1);
    padding: 10px 20px;
    border-radius: 25px;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    pointer-events: auto;
    transition: all 0.2s ease;
  }

  .swipe-up:hover, .swipe-down:hover {
    background: rgba(0, 0, 0, 0.2);
  }

  .swipe-text {
    font-size: 14px;
  }

  /* Mobile responsiveness for multi-topic display */
  @media (max-width: 768px) {
    .topic-navigation {
      right: 10px;
    }

    .topic-dot {
      width: 25px;
      height: 25px;
    }

    .topic-header {
      left: 60px;
      right: 60px;
      top: 30px;
    }

    .topic-header h2 {
      font-size: 1.5rem;
    }
    
    #result-text.multi-topic {
      padding-top: 80px;
    }
  }

  @media (max-width: 480px) {
    .topic-header {
      left: 50px;
      right: 50px;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }
    
    .topic-header h2 {
      font-size: 1.3rem;
    }
    
    .topic-navigation {
      opacity: 0.5;
    }
    
    .topic-navigation:hover {
      opacity: 1;
    }
    
    #result-text.multi-topic {
      padding-top: 100px;
    }
  }

  /* Add styling for our custom quote format */
  .quote-container {
    margin: 2rem 0;
    padding: 1rem;
    background-color: rgba(0, 0, 0, 0.03);
    border-radius: 8px;
    overflow: hidden;
  }

  .quote-source {
    font-weight: bold;
    margin-bottom: 0.5rem;
    font-size: 0.9em;
    color: #000;
  }

  .quote-text {
    opacity: 0.5;
    font-style: italic;
    padding: 0.5rem 0 0 1.5rem;
    border-left: 3px solid rgba(0, 0, 0, 0.2);
    line-height: 1.6;
  }
</style>
