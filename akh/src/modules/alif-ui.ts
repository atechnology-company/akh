import $ from 'jquery';
import type { AlifComponentData } from '../types';
import autosize from 'autosize';
import { marked } from 'marked';
import { t } from '$lib/i18n';

/**
 * Initialize the UI elements for the Alif component
 */
export function initializeUI(componentData: AlifComponentData): void {
  if (componentData.promptInput) {
    autosize(componentData.promptInput);
    componentData.promptInput.focus();
  }
}

/**
 * Handle input changes on the prompt textarea
 */
export function handlePromptInput(
  event: Event, 
  componentData: AlifComponentData
): void {
  const target = event.target as HTMLTextAreaElement;
  
  if (componentData.greeting && target.value.length > 0) {
    if (componentData.greeting) $(componentData.greeting).addClass('hidden');
    $(target).addClass('modified');
    if (componentData.typingTip) $(componentData.typingTip).removeClass('hidden');
  } else if (componentData.greeting && target.value.length === 0) {
    if (componentData.greeting) $(componentData.greeting).removeClass('hidden');
    $(target).removeClass('modified');
    if (componentData.typingTip) $(componentData.typingTip).addClass('hidden');
  }
}

/**
 * Update the UI when switching from input to result page
 */
export function switchToResultsPage(): void {
  $('#input-page').removeClass('active');
  $('#result-page').addClass('active');
}

/**
 * Update the result text with the specified content
 */
export function updateResultText(text: string): void {
  const $resultElement = $('#result-text');
  $resultElement.text(text);
  $resultElement.addClass('thinking');
}

/**
 * Display the final result with proper formatting
 */
export function displayFinalResult(content: string): void {
  try {
    if (!content || typeof content !== 'string') {
      console.error('Invalid content provided to displayFinalResult:', content);
      content = 'Error processing response. Please try again.';
    }
    
    const $resultElement = $('#result-text');
    if (!$resultElement.length) {
      console.error('Result element not found in the DOM');
      return;
    }
    
    $resultElement.removeClass('thinking');
    
    // Process custom quote formats before rendering with markdown
    let processedContent = content;
    
    // Check if content contains the pre-processed quote HTML
    if (!content.includes('<div class="quote-container">')) {
      // Try to detect and process quotes in the special format
      processedContent = content.replace(/<quote source="([^"]+)">([^<]+)<\/quote>/g, 
        '<div class="quote-container"><div class="quote-source">**$1**</div><div class="quote-text">$2</div></div>');
    }
    
    // Add a fade-in effect for the final result with enhanced markdown support
    $resultElement.html(`
      <div class="final-response" style="opacity: 0; transition: opacity 0.5s ease-in;">
        ${marked(processedContent, {
          breaks: true,
          gfm: true
        })}
      </div>
    `);
    
    // Apply additional styling for quotes if needed
    $resultElement.find('.quote-source').css({
      'font-weight': 'bold',
      'margin-bottom': '0.5rem',
      'font-size': '0.9em',
      'color': '#000'
    });
    
    $resultElement.find('.quote-text').css({
      'opacity': '0.5',
      'font-style': 'italic',
      'padding': '0.5rem 0 0 1.5rem',
      'border-left': '3px solid rgba(0, 0, 0, 0.2)',
      'line-height': '1.6'
    });
    
    $resultElement.find('.quote-container').css({
      'margin': '2rem 0',
      'padding': '1rem',
      'background-color': 'rgba(0, 0, 0, 0.03)',
      'border-radius': '8px',
      'overflow': 'hidden'
    });
    
    // Trigger fade-in after a small delay
    setTimeout(() => {
      $resultElement.find('.final-response').css('opacity', '1');
    }, 50);
  } catch (error) {
    console.error('Error in displayFinalResult:', error);
    const $resultElement = $('#result-text');
    if ($resultElement.length) {
      $resultElement.html('<div class="error-message">Error displaying response. Please try again.</div>');
    }
  }
}

/**
 * Display an error message
 */
export function displayError(errorMessage: string): void {
  const $resultElement = $('#result-text');
  $resultElement.removeClass('thinking');
  $resultElement.html(`<div class="error-message">${t('error_occurred')}: ${errorMessage}</div>`);
}

/**
 * Update status during the generation process
 */
export function updateStatus(text: string): void {
  const $resultElement = $('#result-text');
  
  if (!$resultElement.length) return;

  const existingContent = $resultElement.html();
  if (existingContent) {
    $resultElement.html(`
      <div class="previous-status">${existingContent}</div>
      <div class="current-status">${text}</div>
    `);
  } else {
    $resultElement.html(`<div class="current-status">${text}</div>`);
  }
  
  const resultElement = $resultElement[0];
  if (resultElement) {
    resultElement.scrollTop = resultElement.scrollHeight;
  }
} 