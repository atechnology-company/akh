import $ from 'jquery';
import type { AlifComponentData } from '../types';
import autosize from 'autosize';
import { marked } from 'marked';
import { t } from '$lib/i18n';

// Define type for autosize with update method
type AutosizeType = {
  (elements: HTMLElement | NodeListOf<HTMLElement>): void;
  update: (elements: HTMLElement | NodeListOf<HTMLElement>) => void;
  destroy: (elements: HTMLElement | NodeListOf<HTMLElement>) => void;
};

// Cast autosize to our extended type
const autosizeWithUpdate = autosize as AutosizeType;

/**
 * Initialize the UI elements for the Alif component
 */
export function initializeUI(componentData: AlifComponentData): void {
  if (componentData.promptInput) {
    // Apply autosize to the textarea
    autosizeWithUpdate(componentData.promptInput);
    
    // Force update the autosize calculation
    setTimeout(() => {
      if (componentData.promptInput) {
        autosizeWithUpdate.update(componentData.promptInput);
      }
    }, 100);
    
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
    if (componentData.typingTip) {
      $(componentData.typingTip).html(t('press_enter'));
    }
    // Update autosize when input changes
    autosizeWithUpdate.update(target);
  } else if (componentData.greeting && target.value.length === 0) {
    if (componentData.greeting) $(componentData.greeting).removeClass('hidden');
    $(target).removeClass('modified');
    if (componentData.typingTip) {
      $(componentData.typingTip).html('ALIF is a BETA product, it also uses LLMS and may not always be correct with it\'s information. It\'s also not up to date, and will be updated soon. barakAllah feek.');
    }
    // Update autosize when input is cleared
    autosizeWithUpdate.update(target);
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
  // This function is now a no-op as generation indicator handles status display
  return;
}

/**
 * Display the final result with proper formatting
 */
export function displayFinalResult(content: string): void {
  try {
    const resultElement = document.getElementById('result-text');
    if (!resultElement) {
      console.error('[AlifUI] Result element not found');
      return;
    }

    if (!content) {
      console.error('[AlifUI] No content to display');
      return;
    }
    
    // Make sure the element is visible
    resultElement.classList.remove('hidden');

    // Clean up the content
    let cleanedContent = content.trim();
    
    // Remove any single character at the beginning followed by whitespace or line break
    cleanedContent = cleanedContent.replace(/^([a-zA-Z])\s+/m, '');
    
    // Replace 3 or more consecutive newlines with just 2
    cleanedContent = cleanedContent.replace(/\n{3,}/g, '\n\n');

    // Fix blockquote formatting - process them before markdown conversion
    cleanedContent = cleanedContent.replace(
      /(?:^|\n)>\s*([\s\S]*?)(?:\n\n|\n[^>]|$)/g,
      (match, quoteText) => {
        quoteText = quoteText.trim().replace(/\n>\s*/g, '\n');
        
        // Extract source if present in format [Source]
        let source = '';
        quoteText = quoteText.replace(/\s*\[([^\]]+)\]\s*$/, (_: string, src: string) => {
          source = src;
          return '';
        });
        
        // Extract URL from source if present
        let url = '';
        const urlMatch = source.match(/\bhttps?:\/\/[^\s\]]+\b/);
        if (urlMatch) {
          url = urlMatch[0];
          source = source.replace(url, '').trim();
        }
        
        // Create quote HTML
        return `<div class="quote-container">
          <div class="quote-text">${quoteText}</div>
          <div class="quote-source" ${url ? `data-url="${url}"` : ''}>${source}</div>
        </div>`;
      }
    );
    
    // Helper function to extract real source from text
    function extractRealSource(text: string): { source: string, hasUrl: boolean, url: string } {
      // Check for URL
      const urlRegex = /\bhttps?:\/\/[^\s\]]+\b/;
      const urlMatch = text.match(urlRegex);
      const url = urlMatch ? urlMatch[0] : '';
      let source = text.replace(urlRegex, '').trim();
      
      // Check for scholar pattern like "Shaykh Ibn Taymiyyah in Fatawa Islamiyah"
      // We want to prioritize the document name over the scholar
      const scholarPattern = /(shaykh|sheikh|imam|scholar|ibn|abu)\s+([^,]+)(?:\s+in\s+|\s*,\s*|\s+from\s+)([^,]+)/i;
      const scholarMatch = source.match(scholarPattern);
      
      if (scholarMatch) {
        // Use the document name (group 3) if available
        source = scholarMatch[3].trim();
      }
      
      // Check for Quran chapter pattern like "Surah Al-Baqarah 2:255"
      const quranPattern = /(surah|surat|chapter)\s+(al-[\w-]+|[\w-]+)\s*(?:verse\s*)?(\d+(?::\d+)?)?/i;
      const quranMatch = source.match(quranPattern);
      
      if (quranMatch) {
        // Format as "Surah [Name] [Verse]"
        const surahName = quranMatch[2].trim();
        const verseNum = quranMatch[3] ? quranMatch[3].trim() : '';
        source = `Quran: ${surahName}${verseNum ? ' ' + verseNum : ''}`;
      }
      
      // Check for hadith collection pattern like "Sahih Bukhari 123"
      const hadithPattern = /(sahih|sunan|jami|musnad|muwatta)\s+(al-[\w-]+|[\w-]+)\s*(?:hadith\s*)?(\d+)?/i;
      const hadithMatch = source.match(hadithPattern);
      
      if (hadithMatch) {
        // Format as "Collection [Number]"
        const collection = hadithMatch[1] + ' ' + hadithMatch[2];
        const hadithNum = hadithMatch[3] ? hadithMatch[3].trim() : '';
        source = `${collection}${hadithNum ? ' ' + hadithNum : ''}`;
      }
      
      return { source, hasUrl: !!url, url };
    }
    
    // Process Quran verses - look for curly braces pattern {verse text}
    cleanedContent = cleanedContent.replace(
      /\{([^{}]+)\}/g,
      (match, verseText) => {
        // Check if verse contains Surah reference
        let source = "Quran";
        const surahMatch = verseText.match(/\(([^)]+)\)$/);
        if (surahMatch) {
          source = `Quran: ${surahMatch[1].trim()}`;
          verseText = verseText.replace(/\s*\([^)]+\)$/, '');
        }
        
        return `<div class="quote-container" data-quote-type="quran">
          <div class="quote-text">${verseText.trim()}</div>
          <div class="quote-source">${source}</div>
        </div>`;
      }
    );
    
    // Process "text" [source] format quotes - generic quotes
    cleanedContent = cleanedContent.replace(
      /"([^"]+)"\s*\[([^\]]+)\]/g,
      (match, quoteText, source) => {
        // Extract source and URL info
        const sourceInfo = extractRealSource(source);
        
        // Determine quote type
        let quoteType = "general";
        if (sourceInfo.source.match(/(?:Quran|Surah|Allah)/i)) {
          quoteType = "quran";
        } else if (sourceInfo.source.match(/(?:Sahih|Hadith|Sunan|Musnad|Narrated)/i)) {
          quoteType = "hadith";
        } else if (sourceInfo.source.match(/(?:ruling|fatwa|opinion|ijma)/i)) {
          quoteType = "ruling";
        }
        
        return `<div class="quote-container" data-quote-type="${quoteType}">
          <div class="quote-text">${quoteText}</div>
          <div class="quote-source" ${sourceInfo.hasUrl ? `data-url="${sourceInfo.url}"` : ''}>${sourceInfo.source}</div>
        </div>`;
      }
    );
    
    // Process standalone inline references [source]
    // Any references in square brackets not preceded by a quote mark
    cleanedContent = cleanedContent.replace(
      /(?<!")\[([^\]]+)\]/g,
      (match, source, offset, string) => {
        // Skip if part of a quote or immediately after a quote
        const prevChar = offset > 0 ? string.charAt(offset - 1) : '';
        if (prevChar === '"' || prevChar === '"') return match;
        
        // Extract source and URL info
        const sourceInfo = extractRealSource(source);
        
        return `<span class="inline-reference" ${sourceInfo.hasUrl ? `data-url="${sourceInfo.url}"` : ''}>${sourceInfo.source}</span>`;
      }
    );
    
    // Process quotes with curly quotes - especially for hadith
    cleanedContent = cleanedContent.replace(
      /[""]([^""]+)[""]\s*\[((?:Sahih|Sunan|Jami|Musnad|Muwatta|Reported by|Collected by|Narrated by)[^\]]+)\]/gi,
      (match, quoteText, source) => {
        // Extract source and URL info
        const sourceInfo = extractRealSource(source);
        
        return `<div class="quote-container" data-quote-type="hadith">
          <div class="quote-text">${quoteText.trim()}</div>
          <div class="quote-source" ${sourceInfo.hasUrl ? `data-url="${sourceInfo.url}"` : ''}>${sourceInfo.source}</div>
        </div>`;
      }
    );

    // Special handling for h3: style them consistently
    cleanedContent = cleanedContent.replace(/### (.*?)(?:\n|$)/g, '<h3>$1</h3>\n');
    
    // Use marked to render the markdown with some extra options
    resultElement.innerHTML = marked.parse(cleanedContent, { 
      breaks: true,
      gfm: true
    }) as string;
    
    // Post-process the rendered HTML for quotes
    const blockquotes = resultElement.querySelectorAll('blockquote');
    blockquotes.forEach(blockquote => {
      // Only process if it's not already wrapped in a quote container
      if (!blockquote.closest('.quote-container')) {
        const content = blockquote.innerHTML;
        
        // Create new container structure
        const container = document.createElement('div');
        container.className = 'quote-container';
        
        // Get the source if available (text in square brackets after the quote)
        let sourceText = '';
        let quoteContent = content;
        
        // Look for [source] pattern at the end of the blockquote
        const sourceMatch = content.match(/<p>(.+)<\/p>\s*<p>\[(.+?)\]<\/p>$/);
        if (sourceMatch) {
          quoteContent = sourceMatch[1];
          sourceText = sourceMatch[2];
        }
        
        // Extract source information using our helper function
        const sourceInfo = extractRealSource(sourceText);
        
        // Determine quote type based on source text
        let quoteType = "general";
        if (sourceInfo.source.match(/(?:Quran|Surah|Allah)/i)) {
          quoteType = "quran";
        } else if (sourceInfo.source.match(/(?:Sahih|Hadith|Sunan|Musnad|Narrated)/i)) {
          quoteType = "hadith";
        } else if (sourceInfo.source.match(/(?:ruling|fatwa|opinion|ijma)/i)) {
          quoteType = "ruling";
        }
        
        // Set data attribute for styling
        container.setAttribute('data-quote-type', quoteType);
        
        // Add quote text
        const quoteText = document.createElement('div');
        quoteText.className = 'quote-text';
        quoteText.innerHTML = quoteContent;
        container.appendChild(quoteText);
        
        // Add source if available
        if (sourceInfo.source) {
          const source = document.createElement('div');
          source.className = 'quote-source';
          source.textContent = sourceInfo.source;
          if (sourceInfo.hasUrl) source.setAttribute('data-url', sourceInfo.url);
          container.appendChild(source);
        }
        
        // Replace the blockquote with our container
        blockquote.parentNode?.replaceChild(container, blockquote);
      }
    });
    
    // Add click handlers for quote sources with URLs
    const quoteSources = resultElement.querySelectorAll('.quote-source');
    quoteSources.forEach(source => {
      const url = source.getAttribute('data-url');
      if (url) {
        source.classList.add('clickable');
        source.addEventListener('click', () => {
          window.open(url, '_blank', 'noopener,noreferrer');
        });

        // Find the closest quote container and make the quote text clickable too
        const container = source.closest('.quote-container');
        if (container) {
          const quoteText = container.querySelector('.quote-text');
          if (quoteText) {
            quoteText.classList.add('clickable-title');
            quoteText.addEventListener('click', () => {
              window.open(url, '_blank', 'noopener,noreferrer');
            });
          }
          
          // Also make headings inside quote text clickable
          const quoteHeadings = container.querySelectorAll('h3, h4');
          quoteHeadings.forEach(heading => {
            heading.classList.add('clickable-title');
            heading.addEventListener('click', () => {
              window.open(url, '_blank', 'noopener,noreferrer');
            });
          });
        }
      }
    });
    
    // Also make standalone h3 headings with URLs clickable
    const headings = resultElement.querySelectorAll('h3, h4');
    headings.forEach(heading => {
      // Check if this heading contains a URL
      const headingText = heading.textContent || '';
      const urlMatch = headingText.match(/\bhttps?:\/\/[^\s]+\b/);
      if (urlMatch) {
        const url = urlMatch[0];
        // Create a clean title without the URL
        heading.textContent = headingText.replace(url, '').trim();
        heading.classList.add('clickable-title');
        heading.setAttribute('data-url', url);
        heading.addEventListener('click', () => {
          window.open(url, '_blank', 'noopener,noreferrer');
        });
      }
    });
    
    // Add click handlers for inline references
    const inlineRefs = resultElement.querySelectorAll('.inline-reference');
    inlineRefs.forEach(ref => {
      const url = ref.getAttribute('data-url');
      if (url) {
        ref.addEventListener('click', () => {
          window.open(url, '_blank', 'noopener,noreferrer');
        });
      }
    });
    
    // Fade in
    resultElement.style.opacity = '1';
  } catch (error) {
    console.error('[AlifUI] Error displaying result:', error);
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