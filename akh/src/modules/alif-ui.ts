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
  const $resultElement = $('#result-text');
  $resultElement.removeClass('thinking');
  
  // Add a fade-in effect for the final result with markdown support
  $resultElement.html(`
    <div class="final-response" style="opacity: 0; transition: opacity 0.5s ease-in;">
      ${marked(content, {
        breaks: true,
        gfm: true
      })}
    </div>
  `);
  
  // Trigger fade-in after a small delay
  setTimeout(() => {
    $resultElement.find('.final-response').css('opacity', '1');
  }, 50);
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