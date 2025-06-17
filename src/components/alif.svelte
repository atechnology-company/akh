<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as PlatesEngine from '../modules/plates-engine';
  import * as AlifUI from '../modules/alif-ui';
  import type { AlifComponentData, TopicSection } from '../types/index';
  import { marked } from 'marked';
  import { t, currentLanguage } from '$lib/i18n';
  import autosize from 'autosize';
  import { goto } from '$app/navigation';
  import ApiKeyModal from './apiKeyModal.svelte';

  // Define type for autosize with update method
  type AutosizeType = {
    (elements: HTMLElement | NodeListOf<HTMLElement>): void;
    update: (elements: HTMLElement | NodeListOf<HTMLElement>) => void;
    destroy: (elements: HTMLElement | NodeListOf<HTMLElement>) => void;
  };

  // Cast autosize to our extended type
  const autosizeWithUpdate = autosize as AutosizeType;

  let promptInput: HTMLTextAreaElement;
  let greeting: HTMLHeadingElement;
  let typingTip: HTMLDivElement;
  let resultText = '';
  let isInputPage = true;
  let isLoading = false;
  let isMultiTopic = false;
  let topicSections: TopicSection[] = [];
  let activeTopicIndex = 0;
  let isTransitioning = false;
  let touchStartY = 0;
  let scrollTimeout: NodeJS.Timeout;
  let translatedGreeting = '';
  let topScrollIndicator: HTMLDivElement;
  let bottomScrollIndicator: HTMLDivElement;

  // API key management
  let showApiKeyModal = false;
  let savedGeminiApiKey = '';
  let savedGoogleApiKey = '';
  
  // Settings navigation - open local settings modal instead of navigating away
  function navigateToSettings() {
    // Instead of navigating to external page, open the API key modal
    openApiKeyModal();
  }
  
  // Create component data object for passing to UI functions
  const componentData: AlifComponentData = {
    promptInput: null,
    greeting: null,
    typingTip: null,
    resultText: '',
    isInputPage: true,
    loadingOverlay: null
  };
  
  // Function to open API key modal
  function openApiKeyModal() {
    // Try to get saved API keys from localStorage
    const storedGeminiApiKey = localStorage.getItem('gemini_api_key') || '';
    const storedGoogleApiKey = localStorage.getItem('google_api_key') || '';
    savedGeminiApiKey = storedGeminiApiKey;
    savedGoogleApiKey = storedGoogleApiKey;
    showApiKeyModal = true;
  }
  
  // Function to handle API key save from modal
  function handleApiKeySave(event: CustomEvent<{gemini: string, google: string}>) {
    const apiKeys = event.detail;
    
    if (apiKeys.gemini) {
      localStorage.setItem('gemini_api_key', apiKeys.gemini);
      savedGeminiApiKey = apiKeys.gemini;
      
      // Update the config in plates-engine
      if (typeof window !== 'undefined') {
        PlatesEngine.updateApiKey(savedGeminiApiKey);
      }
    }
    
    if (apiKeys.google) {
      localStorage.setItem('google_api_key', apiKeys.google);
      savedGoogleApiKey = apiKeys.google;
      // TODO: Update Google API usage when implemented
    }
    
    showApiKeyModal = false;
  }
  
  // Function to handle modal close
  function handleApiKeyModalClose() {
    showApiKeyModal = false;
  }

  // Subscribe to language changes
  const unsubscribe = currentLanguage.subscribe(lang => {
    translatedGreeting = t('greeting');
    if (greeting) greeting.innerText = translatedGreeting;
    if (typingTip) typingTip.innerText = t('press_enter');
    if (promptInput) promptInput.placeholder = t('what_to_learn');
  });

  onMount(() => {
    translatedGreeting = t('greeting');
    
    // Update component data with references
    componentData.promptInput = promptInput;
    componentData.greeting = greeting;
    componentData.typingTip = typingTip;

    // Initialize UI and apply autosize
    AlifUI.initializeUI(componentData);
    
    if (promptInput) {
      setTimeout(() => autosizeWithUpdate.update(promptInput), 100);
    }
    
    // Add event listener for quote sources
    document.addEventListener('click', handleQuoteSourceClick);
    
    // Add scroll listener for indicators
    const resultElement = document.getElementById('result-text');
    if (resultElement) {
      resultElement.addEventListener('scroll', handleResultScroll);
    }
  });
  
  onDestroy(() => {
    unsubscribe();
    if (promptInput) autosizeWithUpdate.destroy(promptInput);
    document.removeEventListener('click', handleQuoteSourceClick);
    
    const resultElement = document.getElementById('result-text');
    if (resultElement) {
      resultElement.removeEventListener('scroll', handleResultScroll);
    }
  });

  function handleInput(event: Event): void {
    AlifUI.handlePromptInput(event, componentData);
    if (promptInput) autosizeWithUpdate.update(promptInput);
  }

  function handleKeyPress(event: KeyboardEvent): void {
    if (isInputPage && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitPrompt();
    }
  }

  // Handle keyboard navigation for sections
  function handleKeyDown(event: KeyboardEvent): void {
    if (!isInputPage && isMultiTopic && !isLoading && !isTransitioning) {
      if (event.key === 'ArrowUp' && activeTopicIndex > 0) {
        event.preventDefault();
        navigateToTopic(activeTopicIndex - 1);
      } else if (event.key === 'ArrowDown' && activeTopicIndex < topicSections.length - 1) {
        event.preventDefault();
        navigateToTopic(activeTopicIndex + 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        navigateToTopic(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        navigateToTopic(topicSections.length - 1);
      } else if (/^\d$/.test(event.key) && parseInt(event.key) > 0) {
        const targetIndex = parseInt(event.key) - 1;
        if (targetIndex < topicSections.length) {
          event.preventDefault();
          navigateToTopic(targetIndex);
        }
      }
    }
  }

  function handleTouchStart(event: TouchEvent): void {
    touchStartY = event.touches[0].clientY;
  }

  function handleTouchMove(event: TouchEvent): void {
    if (isTransitioning || !isMultiTopic) return;
    
    const currentY = event.touches[0].clientY;
    const diffY = touchStartY - currentY;
    
    if (Math.abs(diffY) > 50) {
      const resultElement = document.getElementById('result-text');
      if (!resultElement) return;
      
      const isAtBottom = Math.abs(resultElement.scrollHeight - resultElement.scrollTop - resultElement.clientHeight) < 50;
      const isAtTop = resultElement.scrollTop === 0;
      
      if (diffY > 0 && isAtBottom && activeTopicIndex < topicSections.length - 1) {
        // Swiping up (moving finger up) and at bottom - go to next section
        navigateToTopic(activeTopicIndex + 1);
      } else if (diffY < 0 && isAtTop && activeTopicIndex > 0) {
        // Swiping down (moving finger down) and at top - go to previous section
        navigateToTopic(activeTopicIndex - 1);
      }
      touchStartY = currentY;
    }
  }

  function handleWheel(event: WheelEvent): void {
    if (isTransitioning || !isMultiTopic) return;
    
    clearTimeout(scrollTimeout);
    
    scrollTimeout = setTimeout(() => {
      const resultElement = document.getElementById('result-text');
      if (!resultElement) return;
      
      const isAtBottom = Math.abs(resultElement.scrollHeight - resultElement.scrollTop - resultElement.clientHeight) < 50;
      const isAtTop = resultElement.scrollTop === 0;
      
      if (event.deltaY > 0 && isAtBottom && activeTopicIndex < topicSections.length - 1) {
        // Scrolling down and at bottom - go to next section
        navigateToTopic(activeTopicIndex + 1);
      } else if (event.deltaY < 0 && isAtTop && activeTopicIndex > 0) {
        // Scrolling up and at top - go to previous section
        navigateToTopic(activeTopicIndex - 1);
      }
    }, 50);
  }

  function navigateToTopic(index: number): void {
    if (isTransitioning || !topicSections?.length) return;
    
    // Clamp index to valid range
    index = Math.max(0, Math.min(index, topicSections.length - 1));
    
    // Don't do anything if already on this index
    if (index === activeTopicIndex) return;
    
    isTransitioning = true;
    
    const resultElement = document.getElementById('result-text');
    if (resultElement) {
      resultElement.style.opacity = '0';
      
      setTimeout(() => {
        activeTopicIndex = index;
        
        if (topicSections[activeTopicIndex]) {
          // Clean up content
          let content = topicSections[activeTopicIndex].content;
          content = content.replace(/^([a-zA-Z])\s+/, '')
                          .trim()
                          .replace(/\n{3,}/g, '\n\n');
          
          resultText = content;
          // Use AlifUI for proper formatting
          AlifUI.displayFinalResult(resultText);
        }
        
        setTimeout(() => {
          if (resultElement) resultElement.scrollTop = 0;
          
          // Reset scroll indicators
          if (topScrollIndicator) topScrollIndicator.style.opacity = '0.7';
          if (bottomScrollIndicator) bottomScrollIndicator.style.opacity = '0.7';
          
          setTimeout(() => {
            if (resultElement) resultElement.style.opacity = '1';
            isTransitioning = false;
          }, 100);
        }, 100);
      }, 300);
    } else {
      activeTopicIndex = index;
      isTransitioning = false;
    }
  }

  async function submitPrompt(): Promise<void> {
    if (!promptInput?.value?.trim() || isLoading) return;
    
    const prompt = promptInput.value.trim();
    
    // Initialize loading state
    isLoading = true;
    isInputPage = false;
    isMultiTopic = false;
    topicSections = [];
    activeTopicIndex = 0;
    resultText = t('thinking');
    
    // Switch to results page
    AlifUI.switchToResultsPage();
    
    // Update for multi-phase loading messages
    const phases = [t('searching'), t('analyzing'), t('organizing')];
    let phaseIndex = 0;
    
    // Show different loading messages
    const loadingInterval = setInterval(() => {
      phaseIndex = (phaseIndex + 1) % phases.length;
      resultText = phases[phaseIndex];
      // Don't update #result-text at all, just update the status-text in the generation indicator
    }, 3000);
    
    try {
      // Set #result-text to be empty during generation
      const resultElement = document.getElementById('result-text');
      if (resultElement) {
        resultElement.innerHTML = '';
      }
      
      // Call the generation function with progress updates
      const response = await PlatesEngine.generateContent(
        prompt,
        (status) => {
          resultText = status;
          // Only update the status-text in the generation indicator
        }
      );
      
      clearInterval(loadingInterval);
      
      // Process the response
      processResponse(response);
      
      isLoading = false;
    } catch (error) {
      clearInterval(loadingInterval);
      console.error('Error generating response:', error);
      resultText = t('error_message');
      AlifUI.displayFinalResult(resultText);
      isLoading = false;
    }
  }

  function goBack(): void {
    isInputPage = true;
    componentData.isInputPage = true;
    isMultiTopic = false;
    topicSections = [];
    activeTopicIndex = 0;
    
    // Clear the input field
    if (promptInput) {
      promptInput.value = '';
    }
    
    setTimeout(() => {
      if (promptInput) {
        promptInput.focus();
        autosizeWithUpdate.update(promptInput);
      }
    }, 0);
  }

  // Handle clicks on quote sources with URLs
  function handleQuoteSourceClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    
    // Handle quote sources
    if (target?.classList.contains('quote-source')) {
      const url = target.getAttribute('data-url');
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    
    // Handle quote source items (from multiple sources container)
    if (target?.classList.contains('quote-source-item')) {
      const url = target.getAttribute('data-url');
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    
    // Handle inline references
    if (target?.classList.contains('inline-reference')) {
      const url = target.getAttribute('data-url');
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
  }

  // Process plain text response to extract H3 sections
  function processH3Sections(text: string): TopicSection[] {
    if (!text) return [{ id: 'topic-1', title: 'Response', content: text }];
    
    const sections: TopicSection[] = [];
    
    // Find all H3 headings
    const h3Regex = /(?:^|\n)(###\s*[^\n]+)(?:\n|$)/g;
    const matches: {title: string, index: number}[] = [];
    let lastIndex = -1;
    
    let match;
    while ((match = h3Regex.exec(text)) !== null) {
      if (match.index > lastIndex && match[1]) {
        matches.push({
          title: match[1].trim(),
          index: match.index
        });
        lastIndex = match.index;
      }
    }
    
    if (matches.length > 0) {
      // Process sections based on H3 headers
      for (let i = 0; i < matches.length; i++) {
        const currentMatch = matches[i];
        const nextMatch = matches[i+1];
        
        const title = currentMatch.title.replace(/^###\s*/, '');
        const startIndex = currentMatch.index + currentMatch.title.length;
        const endIndex = nextMatch ? nextMatch.index : text.length;
        
        // Extract content excluding the H3 header itself
        let content = text.substring(startIndex, endIndex).trim();
        
        // Remove any duplicate H3 header that might be inside the content
        content = content.replace(new RegExp(`^###\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm'), '');
        
        // Process quotes
        content = processQuotes(content);
        
        sections.push({
          id: `topic-${i+1}`,
          title,
          content
        });
      }
    } else {
      // No H3 headings found, treat as single section
      sections.push({
        id: 'topic-1',
        title: 'Response',
        content: processQuotes(text)
      });
    }
    
    return sections;
  }

  // Extract function to process quotes
  function processQuotes(content: string): string {
    let processedContent = content;
    
    // Standard quote format - "text" [source]
    const standardQuoteRegex = /"([^"]+)"\s*\[([^\]]+)\]/g;
    let quoteMatch;
    
    while ((quoteMatch = standardQuoteRegex.exec(content)) !== null) {
      const [fullMatch, quoteText, source] = quoteMatch;
      
      // Extract URL if present
      const urlPattern = /https?:\/\/[^\s\]]+/;
      const urlMatch = source.match(urlPattern);
      const url = urlMatch ? urlMatch[0] : '';
      const cleanSource = source.replace(urlPattern, '').trim();
      
      // Replace with HTML
      const replacement = `<div class="quote-container">
        <div class="quote-text">${quoteText}</div>
        <div class="quote-source" ${url ? `data-url="${url}"` : ''}>${cleanSource}</div>
      </div>`;
      
      processedContent = processedContent.replace(fullMatch, replacement);
    }
    
    // Custom <quote> format
    const customQuoteRegex = /<quote source="([^"]+)">([^<]+)<\/quote>/g;
    while ((quoteMatch = customQuoteRegex.exec(content)) !== null) {
      const [fullMatch, source, quoteText] = quoteMatch;
      
      // Extract URL if present
      const urlPattern = /\((https?:\/\/[^)]+)\)/;
      const urlMatch = source.match(urlPattern);
      const url = urlMatch ? urlMatch[1] : '';
      const cleanSource = source.replace(/\s*\(https?:\/\/[^)]+\)\s*/, '').trim();
      
      // Replace with HTML
      const replacement = `<div class="quote-container">
        <div class="quote-text">${quoteText}</div>
        <div class="quote-source" ${url ? `data-url="${url}"` : ''}>${cleanSource}</div>
      </div>`;
      
      processedContent = processedContent.replace(fullMatch, replacement);
    }

    // In-text reference - simple pattern [source] 
    // but only if NOT preceded by a quote mark
    const inlineReferenceRegex = /(?<!")\[([^\]]+)\]/g;
    
    while ((quoteMatch = inlineReferenceRegex.exec(content)) !== null) {
      const [fullMatch, source] = quoteMatch;
      
      // Skip if this is immediately after a quote (already processed)
      const prevChar = content.charAt(quoteMatch.index - 1);
      if (prevChar === '"' || prevChar === '"') continue;
      
      // Extract URL if present
      const urlPattern = /https?:\/\/[^\s\]]+/;
      const urlMatch = source.match(urlPattern);
      const url = urlMatch ? urlMatch[0] : '';
      const cleanSource = source.replace(urlPattern, '').trim();
      
      // Replace with inline reference HTML
      const replacement = `<span class="inline-reference" ${url ? `data-url="${url}"` : ''}>${cleanSource}</span>`;
      
      processedContent = processedContent.replace(fullMatch, replacement);
    }
    
    // Process multiple consecutive URL sources in brackets (like in the example)
    // Only if they're not already processed
    const multipleBracketSourcesRegex = /\[([^\]]+?)(\]\s*\[[^\]]+?)+\]/g;
    const bracketSourcesRegex = /\[([^\]]+?)\]/g;

    // Find all multi-bracket patterns
    let multiMatch;
    while ((multiMatch = multipleBracketSourcesRegex.exec(content)) !== null) {
      const fullMultiMatch = multiMatch[0];
      
      // If this is part of a quote, skip it (already processed)
      const prevChar = content.charAt(multiMatch.index - 1);
      if (prevChar === '"' || prevChar === '"') continue;
      
      // Create wrapper for all sources
      let sourcesHtml = '<div class="quote-sources-container">';
      
      // Extract individual sources
      let bracketMatch;
      const sourceText = fullMultiMatch;
      while ((bracketMatch = bracketSourcesRegex.exec(sourceText)) !== null) {
        const sourceContent = bracketMatch[1];
        
        // Extract URL if present
        const urlPattern = /https?:\/\/[^\s\]]+/;
        const urlMatch = sourceContent.match(urlPattern);
        const url = urlMatch ? urlMatch[0] : '';
        const cleanSource = sourceContent.replace(urlPattern, '').trim();
        
        // Add source div
        sourcesHtml += `<div class="quote-source-item" ${url ? `data-url="${url}"` : ''}>${cleanSource}</div>`;
      }
      
      sourcesHtml += '</div>';
      
      // Replace in the content
      processedContent = processedContent.replace(fullMultiMatch, sourcesHtml);
    }
    
    return processedContent;
  }

  // Function to process response data and create sections from it
  function processResponse(response: string | TopicSection[]): void {
    if (Array.isArray(response)) {
      // Response is already processed into sections
      topicSections = response;
      
      if (topicSections.length > 0) {
        // Process overview/introduction - special handling
        if (topicSections.length > 1 && 
            (topicSections[0].title.toLowerCase().includes('introduction') || 
             topicSections[0].title.toLowerCase().includes('overview'))) {
          
          // Merge intro with next section and don't include the overview title
          if (topicSections.length > 1) {
            const introContent = topicSections[0].content;
            // Skip adding intro title since we want to remove "Overview"
            
            // Add intro content to beginning of second section with fancy styling
            topicSections[1].content = `
              <div class="introduction-container">
                <div class="introduction-content">${introContent}</div>
              </div>
              <hr class="section-divider">
              ${topicSections[1].content}
            `;
            
            // Remove intro section
            topicSections = topicSections.slice(1);
          }
        }
        
        isMultiTopic = topicSections.length > 1;
        activeTopicIndex = 0;
        
        // Display the first topic section content
        if (topicSections[0]?.content) {
          resultText = topicSections[0].content;
          AlifUI.displayFinalResult(resultText);
        } else {
          resultText = 'No content available.';
          AlifUI.displayFinalResult(resultText);
        }
      } else {
        isMultiTopic = false;
        resultText = 'No content returned.';
        AlifUI.displayFinalResult(resultText);
      }
    } else {
      // Response is a string, not sections
      resultText = response;
      isMultiTopic = false;
      AlifUI.displayFinalResult(resultText);
    }
  }

  function handleResultScroll(event: Event): void {
    if (!isMultiTopic || isLoading || !topScrollIndicator || !bottomScrollIndicator) return;
    
    const resultElement = event.target as HTMLElement;
    if (!resultElement) return;
    
    const scrollTop = resultElement.scrollTop;
    const scrollHeight = resultElement.scrollHeight;
    const clientHeight = resultElement.clientHeight;
    
    // Show/hide top indicator based on scroll position
    if (scrollTop > 100) {
      topScrollIndicator.style.opacity = '0';
    } else {
      topScrollIndicator.style.opacity = '0.7';
    }
    
    // Show/hide bottom indicator based on scroll position
    if (scrollHeight - scrollTop - clientHeight > 100) {
      bottomScrollIndicator.style.opacity = '0.7';
    } else {
      bottomScrollIndicator.style.opacity = '0';
    }
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
  {#if isLoading}
    <div class="loading-overlay">
      <div class="loading-text">{resultText}</div>
      <div class="loading-spinner"></div>
    </div>
  {/if}
  <div id="typing-tip" class="typing-indicator" bind:this={typingTip}>
    ALIF is a BETA product, it also uses LLMS and may not always be correct with it's information. It's also not up to date, and will be updated soon. barakAllah feek.
  </div>
  <button class="settings-button" on:click={navigateToSettings} aria-label="Settings">
    <span class="material-symbols-rounded">settings</span>
  </button>
</div>

<div id="result-page" class="page" class:active={!isInputPage} 
     on:wheel={handleWheel} 
     on:touchstart={handleTouchStart} 
     on:touchmove={handleTouchMove}
     on:keydown={handleKeyDown}
     tabindex={!isInputPage ? 0 : -1}>
  <div class="close">
    <button class="back-btn" on:click={goBack} disabled={isLoading} aria-label="Close response and return to input">
      <span class="material-symbols-rounded">arrow_back</span>
    </button>
  </div>
  
  {#if isMultiTopic}
    <div class="topic-navigation">
      {#if topicSections && Array.isArray(topicSections)}
        {#each topicSections as section, i}
          {#if section && typeof section === 'object' && section.title}
            <div 
              class="topic-dot" 
              class:active={i === activeTopicIndex} 
              on:click={() => navigateToTopic(i)} 
              role="button" 
              tabindex="0"
              aria-label="Navigate to topic {i+1}: {section.title}"
            >
              <span class="dot-label">{i + 1}</span>
              <span class="dot-tooltip">{section.title}</span>
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  {/if}
  
  <div class="container">
    {#if isMultiTopic && !isLoading}
      <div class="section-title-header">
        <h2 class="section-title">
          {topicSections[activeTopicIndex]?.title || 'Section'}
        </h2>
      </div>
    {/if}
    
    <div id="result-text" class:multi-topic={isMultiTopic} class:with-sections={isMultiTopic} class:hidden={isLoading}>
      <!-- Content will be rendered by AlifUI.displayFinalResult -->
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
      
      <div class="content-placeholder">
        <div class="placeholder-title"></div>
        <div class="placeholder-paragraph">
          <div class="placeholder-line"></div>
          <div class="placeholder-line"></div>
          <div class="placeholder-line"></div>
          <div class="placeholder-line"></div>
        </div>
        <div class="placeholder-quote"></div>
        <div class="placeholder-paragraph">
          <div class="placeholder-line"></div>
          <div class="placeholder-line"></div>
          <div class="placeholder-line"></div>
        </div>
        <div class="placeholder-title small"></div>
        <div class="placeholder-paragraph">
          <div class="placeholder-line"></div>
          <div class="placeholder-line"></div>
          <div class="placeholder-line"></div>
          <div class="placeholder-line"></div>
        </div>
      </div>
    {/if}
    
    {#if isMultiTopic && !isLoading}
      <div class="swipe-indicators">
        {#if topicSections && Array.isArray(topicSections) && activeTopicIndex > 0}
          <div class="swipe-up" on:click={() => navigateToTopic(activeTopicIndex - 1)}
               role="button" tabindex="0" aria-label="Navigate to previous section">
            <span class="material-symbols-rounded">expand_circle_up</span>
            <span class="swipe-text">Previous: {(topicSections[activeTopicIndex - 1]?.title || 'Previous Section').substr(0, 30)}{topicSections[activeTopicIndex - 1]?.title?.length > 30 ? '...' : ''}</span>
          </div>
        {/if}
        
        {#if topicSections && Array.isArray(topicSections) && activeTopicIndex < topicSections.length - 1}
          <div class="swipe-down" on:click={() => navigateToTopic(activeTopicIndex + 1)}
               role="button" tabindex="0" aria-label="Navigate to next section">
            <span class="swipe-text">Next: {(topicSections[activeTopicIndex + 1]?.title || 'Next Section').substr(0, 30)}{topicSections[activeTopicIndex + 1]?.title?.length > 30 ? '...' : ''}</span>
            <span class="material-symbols-rounded">expand_circle_down</span>
          </div>
        {/if}
      </div>
      
      <div class="scroll-indicator top" class:hidden={activeTopicIndex === 0} bind:this={topScrollIndicator}>
        <div class="scroll-arrow">
          <span class="material-symbols-rounded">arrow_upward</span>
        </div>
        <div class="scroll-text">Scroll to top to go to previous section</div>
      </div>
      
      <div class="scroll-indicator bottom" class:hidden={activeTopicIndex === topicSections.length - 1} bind:this={bottomScrollIndicator}>
        <div class="scroll-text">Scroll to bottom to go to next section</div>
        <div class="scroll-arrow">
          <span class="material-symbols-rounded">arrow_downward</span>
        </div>
      </div>
    {/if}

    {#if isMultiTopic && !isLoading}
      <div class="topic-indicator-label" style="position: fixed; top: 20px; right: 60px; background: rgba(0,0,0,0.1); padding: 5px 10px; border-radius: 20px; font-size: 14px; z-index: 10;">
        <span>{activeTopicIndex + 1}/{topicSections.length}</span>
      </div>
    {/if}
  </div>
</div>

{#if showApiKeyModal}
  <ApiKeyModal 
    showModal={showApiKeyModal}
    geminiApiKey={savedGeminiApiKey}
    googleApiKey={savedGoogleApiKey}
    on:save={handleApiKeySave} 
    on:close={handleApiKeyModalClose} 
  />
{/if}

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
  
  .typing-indicator {
    position: absolute;
    bottom: 3vh;
    left: 20px;
    font-size: 14px;
    color: #999;
    padding: 8px 12px;
    animation: fadeInUp 0.3s ease-out;
  }
  
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
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
    margin: 0 auto 0 40px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: left;
    padding-top: 80px;
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
    display: none !important;
  }

  /* Input styles */
  #prompt-input {
    position: absolute;
    top: 45%;
    left: 0;
    transform: translateY(0);
    transition: all 0.5s ease;
    font-family: 'Onest', sans-serif;
    width: 90%;
    max-width: 90%;
    padding: 15px;
    background: transparent;
    border: none;
    color: #000;
    font-size: 3rem;
    margin-bottom: 20px;
    resize: vertical;
    display: block;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
    max-height: 60vh;
    overflow-y: auto;
  }

  #prompt-input:focus {
    outline: none;
  }

  #prompt-input.modified {
    top: 50%;
    transform: translateY(-50%);
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

  /* Back button */
  .close {
    position: absolute;
    top: 0;
    left: 0;
    margin: 40px 0 0 40px;
    z-index: 10;
  }

  .back-btn {
    background: rgba(0, 0, 0, 0.05);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    padding: 10px;
    color: #000;
    width: 45px;
    height: 45px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }
  
  .back-btn:hover {
    background: rgba(0, 0, 0, 0.1);
    transform: scale(1.05);
  }
  
  .back-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Result text */
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
    transition: opacity 0.3s ease;
  }

  /* Make headings larger and more prominent */
  :global(#result-text h3) {
    font-size: 3rem;
    margin-top: 2rem;
    margin-bottom: 1.5rem;
    font-weight: 600;
    color: #000;
    border-bottom: 2px solid rgba(0, 0, 0, 0.1);
    padding-bottom: 0.5rem;
  }

  :global(#result-text h4) {
    font-size: 2.5rem;
    margin-top: 1.5rem;
    margin-bottom: 1rem;
    font-weight: 500;
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

  #result-text.multi-topic {
    padding-top: 20px;
    transition: opacity 0.3s ease;
    overflow-y: auto;
    height: calc(100vh - 100px);
  }
  
  #result-text.with-sections {
    height: calc(100vh - 140px);
    padding-top: 20px;
    padding-bottom: 80px;
    opacity: 1;
  }

  /* Topic navigation */
  .topic-navigation {
    position: fixed;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 15px;
    z-index: 100;
    background: rgba(255, 248, 231, 0.5);
    padding: 10px 5px;
    border-radius: 30px;
    backdrop-filter: blur(5px);
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
    border: 1px solid rgba(0, 0, 0, 0.1);
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
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
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

  /* Swipe indicators */
  .swipe-indicators {
    position: fixed;
    left: 20px;
    bottom: 20px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    pointer-events: none;
    z-index: 50;
    max-width: 300px;
  }

  .swipe-up, .swipe-down {
    background: rgba(0, 0, 0, 0.1);
    padding: 8px 16px;
    border-radius: 25px;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    pointer-events: auto;
    transition: all 0.2s ease;
    backdrop-filter: blur(5px);
    max-width: 80%;
  }

  .swipe-up:hover, .swipe-down:hover {
    background: rgba(0, 0, 0, 0.2);
    transform: scale(1.05);
  }

  .swipe-text {
    font-size: 14px;
    max-width: calc(100% - 30px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Loading animation */
  .generation-indicator {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    z-index: 100;
    background: linear-gradient(to top, rgba(255, 248, 231, 1) 0%, rgba(255, 248, 231, 0.95) 40%, rgba(255, 248, 231, 0.7) 80%, rgba(255, 248, 231, 0) 100%);
    padding: 2rem;
    pointer-events: none;
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

  .status-text {
    font-family: 'Onest', sans-serif;
    font-size: 1.4rem;
    color: #000;
    opacity: 0.8;
    text-align: center;
    max-width: 600px;
    line-height: 1.4;
  }

  /* Content placeholder */
  .content-placeholder {
    position: relative;
    width: 100%;
    max-width: 95%;
    margin: 0 auto;
    padding: 2rem;
    height: auto;
    z-index: 1;
    margin-bottom: 150px;
    margin-top: 20px;
    min-height: 60vh;
    display: flex;
    flex-direction: column;
  }
  
  .placeholder-title,
  .placeholder-line,
  .placeholder-quote {
    background: linear-gradient(
      to right,
      rgba(0, 0, 0, 0.05) 8%,
      rgba(0, 0, 0, 0.08) 18%,
      rgba(0, 0, 0, 0.05) 33%
    );
    background-size: 2000px 100%;
    animation: placeholder-shimmer 2s linear infinite;
    border-radius: 4px;
    margin-bottom: 1rem;
  }
  
  .placeholder-title {
    height: 2.5rem;
    width: 60%;
    margin-bottom: 2rem;
  }
  
  .placeholder-title.small {
    height: 2rem;
    width: 40%;
    margin-top: 2rem;
  }
  
  .placeholder-paragraph {
    margin-bottom: 2rem;
  }
  
  .placeholder-line {
    height: 1.2rem;
    margin-bottom: 0.8rem;
    width: 100%;
  }
  
  .placeholder-line:nth-child(even) {
    width: 92%;
  }
  
  .placeholder-line:nth-child(3) {
    width: 97%;
  }
  
  .placeholder-line:last-child {
    width: 85%;
  }
  
  .placeholder-quote {
    height: 8rem;
    margin: 2rem 0;
    border-radius: 8px;
    border-left: 4px solid rgba(0, 0, 0, 0.1);
  }

  /* Quote styling */
  :global(.quote-container) {
    margin: 2rem 0;
    padding: 1.5rem;
    background-color: rgba(0, 0, 0, 0.03);
    border-radius: 12px;
    border-left: 5px solid rgba(0, 0, 0, 0.2);
    overflow: hidden;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }
  
  :global(.quote-container:hover) {
    background-color: rgba(0, 0, 0, 0.05);
    transform: translateX(2px);
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.08);
  }
  
  /* Special styling for different quote types */
  :global(.quote-container[data-quote-type="quran"]) {
    background-color: rgba(0, 70, 0, 0.03);
    border-left: 5px solid rgba(0, 70, 0, 0.3);
  }
  
  :global(.quote-container[data-quote-type="quran"] .quote-source) {
    background-color: rgba(0, 70, 0, 0.08);
    color: rgba(0, 70, 0, 0.9);
  }
  
  :global(.quote-container[data-quote-type="ruling"]) {
    background-color: rgba(70, 0, 0, 0.03);
    border-left: 5px solid rgba(70, 0, 0, 0.3);
  }
  
  :global(.quote-container[data-quote-type="ruling"] .quote-source) {
    background-color: rgba(70, 0, 0, 0.08);
    color: rgba(70, 0, 0, 0.9);
  }
  
  :global(.quote-container[data-quote-type="hadith"]) {
    background-color: rgba(0, 0, 70, 0.03);
    border-left: 5px solid rgba(0, 0, 70, 0.3);
  }
  
  :global(.quote-container[data-quote-type="hadith"] .quote-source) {
    background-color: rgba(0, 0, 70, 0.08);
    color: rgba(0, 0, 70, 0.9);
  }
  
  :global(.quote-source) {
    font-weight: 500;
    margin-top: 1rem;
    padding: 6px 12px;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 8px;
    display: inline-block;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.9em;
    border-left: 3px solid rgba(0, 0, 0, 0.1);
  }
  
  :global(.quote-source[data-url]) {
    text-decoration: none;
    padding-right: 30px;
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>');
    background-repeat: no-repeat;
    background-position: right 10px center;
    background-size: 14px;
  }
  
  :global(.quote-source:hover) {
    background-color: rgba(0, 0, 0, 0.1);
    transform: translateX(2px);
  }
  
  :global(.quote-text) {
    font-style: italic;
    line-height: 1.6;
    position: relative;
    display: block;
    transition: color 0.2s ease;
    margin-bottom: 0.8rem;
    font-size: 1.1em;
    color: rgba(0, 0, 0, 0.8);
    padding-left: 5px;
  }
  
  :global(.quote-text.clickable-title) {
    text-decoration: none;
    padding-right: 0;
  }
  
  :global(.quote-text.clickable-title:after) {
    display: none;
  }
  
  :global(.quote-text.clickable-title:hover) {
    color: rgba(0, 0, 0, 0.7);
  }

  :global(.quote-sources-container) {
    margin: 1rem 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.5rem;
    background-color: rgba(0, 0, 0, 0.02);
    border-radius: 8px;
    border-left: 3px solid rgba(0, 0, 0, 0.1);
  }

  :global(.quote-source-item) {
    font-size: 0.9em;
    display: inline-flex;
    align-items: center;
    background: rgba(0, 0, 0, 0.05);
    padding: 4px 10px;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  :global(.quote-source-item:hover) {
    background: rgba(0, 0, 0, 0.1);
  }

  :global(.quote-source-item[data-url]) {
    padding-right: 28px;
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>');
    background-repeat: no-repeat;
    background-position: right 8px center;
    background-size: 12px;
  }
  
  /* Ensure blockquotes are styled like quotes */
  :global(blockquote) {
    margin: 2rem 0;
    padding: 1.5rem;
    background-color: rgba(0, 0, 0, 0.03);
    border-radius: 12px;
    border-left: 5px solid rgba(0, 0, 0, 0.2);
    font-style: italic;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }

  /* Introduction styling */
  .introduction-container {
    background-color: rgba(0, 0, 0, 0.035);
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 2rem;
    border-left: 4px solid rgba(0, 0, 0, 0.15);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }

  .introduction-title {
    font-weight: 600;
    font-size: 1.2em;
    margin-bottom: 0.8rem;
    color: rgba(0, 0, 0, 0.8);
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }

  .introduction-content {
    font-style: italic;
    line-height: 1.6;
    color: rgba(0, 0, 0, 0.7);
  }

  .section-divider {
    border: none;
    height: 1px;
    background: rgba(0, 0, 0, 0.1);
    margin: 2.5rem 0;
  }

  /* Animations */
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
  
  @keyframes placeholder-shimmer {
    0% { background-position: -1000px 0; }
    100% { background-position: 1000px 0; }
  }

  /* Media queries */
  @media (max-width: 768px) {
    .container {
      margin: 0 20px 0 20px;
      width: auto;
      padding-top: 60px;
    }

    #prompt-input, #prompt-input.modified {
      font-size: 2rem;
      width: 90%;
      max-width: 90%;
    }

    #prompt-input.modified {
      font-size: 4rem;
    }

    #result-text {
      height: calc(100vh - 60px);
      font-size: 1.5rem;
      padding: 1rem;
    }

    :global(#result-text h3) {
      font-size: 2.3rem;
    }

    :global(#result-text h4) {
      font-size: 1.8rem;
    }

    #typing-tip {
      margin-left: 20px;
      margin-bottom: 20px;
      font-size: 1.2em;
    }

    .close {
      margin: 20px 0 0 20px;
    }

    .topic-navigation {
      right: 10px;
      padding: 5px 3px;
    }
    
    .swipe-indicators {
      bottom: 10px;
    }
    
    .swipe-up, .swipe-down {
      padding: 6px 12px;
      max-width: 90%;
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
    #prompt-input, #prompt-input.modified {
      font-size: 1.5rem;
    }

    #prompt-input.modified {
      font-size: 3rem;
    }

    #result-text {
      font-size: 1.2rem;
      padding: 0.8rem;
    }

    :global(#result-text h3) {
      font-size: 1.8rem;
    }
    
    :global(#result-text h4) {
      font-size: 1.5rem;
    }
    
    #result-text.with-sections {
      padding-top: 20px;
      padding-bottom: 60px;
    }
    
    .topic-navigation {
      padding: 5px 2px;
    }
    
    .topic-dot {
      width: 25px;
      height: 25px;
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

  /* Clickable titles */
  :global(.clickable-title) {
    cursor: pointer;
    position: relative;
    display: inline-block;
    padding-right: 24px;
    text-decoration: underline;
    text-decoration-style: dotted;
    text-underline-offset: 3px;
    transition: all 0.2s ease;
  }
  
  :global(.clickable-title:after) {
    content: '';
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>');
    background-repeat: no-repeat;
    background-position: center;
    background-size: contain;
  }
  
  :global(.clickable-title:hover) {
    color: rgba(0, 0, 0, 0.7);
  }

  /* Section title header */
  .section-title-header {
    position: relative;
    top: 0;
    left: 0;
    right: 0;
    padding: 10px 0 20px 0;
    background: transparent;
    z-index: 50;
    margin-bottom: 20px;
    pointer-events: none;
    text-align: left;
  }

  .section-title {
    font-size: 3.5rem;
    font-weight: 600;
    color: #000;
    margin: 0;
    padding: 0;
    line-height: 1.2;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    opacity: 0.9;
  }
  
  @media (max-width: 768px) {
    .section-title {
      font-size: 2.5rem;
    }
  }
  
  @media (max-width: 480px) {
    .section-title {
      font-size: 2rem;
    }
  }

  /* Scroll indicators */
  .scroll-indicator {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.05);
    padding: 8px 16px;
    border-radius: 25px;
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 30;
    pointer-events: none;
    transition: all 0.3s ease;
    opacity: 0.7;
    backdrop-filter: blur(5px);
  }
  
  .scroll-indicator.top {
    top: 100px;
  }
  
  .scroll-indicator.bottom {
    bottom: 20px;
  }
  
  .scroll-text {
    font-size: 14px;
    color: rgba(0, 0, 0, 0.7);
    font-weight: 500;
  }
  
  .scroll-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .scroll-indicator.top .scroll-arrow,
  .scroll-indicator.bottom .scroll-arrow {
    animation: bounce 2s infinite;
  }
  
  @keyframes bounce {
    0%, 20%, 50%, 80%, 100% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(-10px);
    }
    60% {
      transform: translateY(-5px);
    }
  }
  
  @media (max-width: 768px) {
    .scroll-indicator {
      padding: 6px 12px;
      max-width: 90%;
    }
    
    .scroll-text {
      font-size: 12px;
    }
    
    .scroll-indicator.top {
      top: 80px;
    }
  }
  
  @media (max-width: 480px) {
    .scroll-indicator {
      padding: 5px 10px;
    }
    
    .scroll-text {
      font-size: 11px;
    }
    
    .scroll-indicator.top {
      top: 70px;
    }
  }

  /* In-text reference styling */
  :global(.inline-reference) {
    display: inline-flex;
    align-items: center;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 20px;
    padding: 3px 10px;
    margin: 0 3px;
    font-size: 0.8em;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    border-left: 3px solid rgba(0, 0, 0, 0.1);
  }
  
  :global(.inline-reference:hover) {
    background: rgba(0, 0, 0, 0.1);
    transform: translateY(-1px);
  }
  
  :global(.inline-reference[data-url]) {
    padding-right: 25px;
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>');
    background-repeat: no-repeat;
    background-position: right 8px center;
    background-size: 12px;
  }
  
  /* For mobile screens, make them wrap */
  @media (max-width: 480px) {
    :global(.inline-reference) {
      white-space: normal;
      display: inline-block;
    }
  }
  
  /* Settings button */
  .settings-button {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.1);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    z-index: 100;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  }
  
  .settings-button:hover {
    background: rgba(0, 0, 0, 0.2);
    transform: scale(1.1);
  }
  
  .settings-icon {
    font-size: 24px;
  }
  
  @media (max-width: 768px) {
    .settings-button {
      width: 45px;
      height: 45px;
      bottom: 15px;
      right: 15px;
    }
  }
  
  @media (max-width: 480px) {
    .settings-button {
      width: 40px;
      height: 40px;
      bottom: 10px;
      right: 10px;
    }
    
    .settings-icon {
      font-size: 20px;
    }
  }
</style>
