import { TextRank } from '../modules/textrank';
import type { 
    Config, 
    SearchResult, 
    Quote, 
    GeminiResponse, 
    Tokenizer, 
    CallbackFunction,
    TopicSection
} from '../types/index';

// Get environment variables from window.__ENV__ or use empty strings as fallback
const config: Config = {
    GOOGLE_API_KEY: (window as any).__ENV__?.GOOGLE_API_KEY || '',
    SEARCH_ENGINE_ID: (window as any).__ENV__?.SEARCH_ENGINE_ID || '',
    GEMINI_API_KEY: (window as any).__ENV__?.GEMINI_API_KEY || '',
    GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    IS_DEV: (window as any).__ENV__?.NODE_ENV === 'development'
};

const ASSISTANT_PROMPT = `You are a helpful AI assistant. Please:
1. ONLY use information provided in the context below
2. If quotes exist, use them exactly as provided with proper attribution
3. If context lacks clear evidence, acknowledge the limitations
4. Present multiple viewpoints when available
5. Clearly distinguish between:
   - Direct quotes from sources
   - Summarized information
   - General guidance based on provided information`;

// Function to detect if text is Arabic
function isArabic(text: string): boolean {
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return arabicRegex.test(text);
}

// List of trusted Islamic websites for search
const TRUSTED_DOMAINS = [
  "islamqa.info",
  "islamweb.net", 
  "binbaz.org.sa",
  "islamhouse.com",
  "salafipublications.com",
  "sahab.net",
  "ajurry.com",
  "alalbany.net",
  "dorar.net",
  "al-athary.net",
  "iswy.co",
  "alifta.gov.sa",
  "ibnothaimeen.com",
  "nawawi.faith",
  "alukah.net",
  "saaid.net",
  "waqfeya.net",
  "tafsir.net",
  "al-badr.net",
  "muslim-library.com",
  "al-feqh.com",
  "islamspirit.com",
  "islamicencyclopedia.org",
  "alrased.net",
  "taimiah.org"
];

// Add domain restriction to searches
function buildSearchQuery(query: string, definitionMode = false): string {
  // For definition queries, add definition terms
  if (definitionMode) {
    return `("meaning" OR "definition" OR "explanation" OR "meaning in islam" OR "definition in islam") ${query}`;
  }
  
  // For regular queries, just clean up and keep the full query for more accurate results
  return query.trim();
}

// Summarize content function - simplified to skip summarization
async function processContent(content: string, quotes: Array<Quote>): Promise<string> {
    try {
        if (!content || typeof content !== 'string') {
            console.error('Invalid content received:', content);
            return '';
        }

        // Skip summarization for all text - just clean and normalize
        let cleanContent = content
            .replace(/\s+/g, ' ')
            .replace(/[\r\n]+/g, '\n')
            .trim();

        // Add quotes if they exist
        if (quotes?.length > 0) {
            cleanContent += '\n\nRelevant Quotes:\n' + 
                quotes.map(q => `"${q.text}" [${q.source}]`).join('\n');
        }

        return cleanContent;

    } catch (error) {
        console.error('Content processing error:', error);
        return content; // Return original content on error
    }
}

// Optimize search queries
async function optimizeQuery(query: string, definitionMode = false) {
    const optimizationPrompt = definitionMode ? 
        `Task: Generate 4 search queries to understand what "${query}" means in Islamic context.
        Rules:
        1. Focus on Islamic meaning and definition of "${query}"
        2. Include variations of terminology
        3. At least 2 queries MUST be in Arabic (use Arabic script)
        4. Make queries diverse to cover different aspects
        5. Keep queries concise and focused

        Format: Write ONLY the finished search queries (not keywords), one per line starting with "-"
        ` :
        `Task: Generate 5 diverse search queries about: "${query}"
        Rules:
        1. Create complete, well-formed search queries (not just keywords)
        2. At least 3 queries MUST be in Arabic language (use Arabic script)
        3. Include Islamic terminology like hadith, quran, fatwa, ruling
        4. For Arabic queries, use terminology like فتوى، حديث، قرآن، تفسير، حكم
        5. Make each query search for a different aspect of the topic
        6. One query should be the original question reformulated clearly

        Format: Write ONLY the finished search queries, one per line starting with "-"
        `;

    try {
        const outputText = await generateWithGemini(optimizationPrompt, [], 2048, 0.7);
        const output = [{ generated_text: outputText }];

        // Extract queries
        const queries: string[] = (output[0] as { generated_text: string }).generated_text
            .split('\n')
            .filter((line: string) => line.trim().startsWith('-'))
            .map((line: string) => line.trim().substring(2).trim())
            .filter((query: string) => query.length > 0 && !query.includes('Example'))
            .slice(0, 5); // Get up to 5 optimized queries
        
        // Add the original query if it's not already included
        if (!queries.includes(query)) {
            queries.unshift(query);
        }
        
        // Return unique queries
        return Array.from(new Set(queries)).slice(0, 6);
    } catch (error) {
        console.error('Query optimization failed:', error);
        return [query];
    }
}

// Search and fetch content with a status callback
export async function searchAndFetchContent(
    originalQuery: string,
    statusCallback: (status: string) => void
): Promise<SearchResult[]> {
    try {
        const optimizedQueries = await optimizeQuery(originalQuery);
        console.log('Optimized queries:', optimizedQueries);

        const webResults: SearchResult[] = [];
        const processedUrls = new Set(); // Track processed URLs
        const quoteRegex = /"([^"]+)"\s*[\[\(]([^\]\)]+)[\]\)]/g;
        const MAX_RESULTS_PER_QUERY = 5; // Maximum results to fetch per query
        const MAX_TOTAL_RESULTS = 15; // Maximum total results to fetch

        for (let queryIndex = 0; queryIndex < optimizedQueries.length; queryIndex++) {
            const query = optimizedQueries[queryIndex];
            statusCallback(`Searching with query ${queryIndex + 1}: "${query}"`);

            // If we've already reached our maximum results, stop searching
            if (webResults.length >= MAX_TOTAL_RESULTS) {
                console.log(`Reached maximum total results (${MAX_TOTAL_RESULTS}). Stopping search.`);
                break;
            }

            try {
                // Direct API call to Google Custom Search
                const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${config.GOOGLE_API_KEY}&cx=${config.SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`;
                const searchResponse = await fetch(searchUrl);
                
                if (!searchResponse.ok) {
                    console.error(`Search response error: ${searchResponse.status} ${searchResponse.statusText}`);
                    const errorText = await searchResponse.text();
                    console.error('Error response:', errorText);
                    continue;
                }

                const searchData = await searchResponse.json();
                if (!searchData.items || searchData.items.length === 0) {
                    console.log(`No results found for query: ${query}`);
                    continue;
                }

                // Try each result, getting up to MAX_RESULTS_PER_QUERY per query
                let resultsFoundForThisQuery = 0;
                
                for (const item of searchData.items) {
                    // If we've reached the limit for this query, move to the next query
                    if (resultsFoundForThisQuery >= MAX_RESULTS_PER_QUERY) {
                        console.log(`Reached maximum results (${MAX_RESULTS_PER_QUERY}) for query: ${query}`);
                        break;
                    }
                    
                    // If we've already processed this URL, skip it
                    if (processedUrls.has(item.link)) {
                        console.log(`Skipping duplicate URL: ${item.link}`);
                        continue;
                    }
                    
                    try {
                        processedUrls.add(item.link); // Add URL to tracked set
                        
                        let content = '';
                        let fetchSuccessful = false;
                        const urlObj = new URL(item.link);
                        
                        // Try to fetch content first
                        try {
                            console.log(`Attempting to fetch content from: ${item.link}`);
                            const html = await fetch(item.link, {
                                method: 'GET',
                                mode: 'cors',
                                headers: {
                                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                                    'Accept-Language': 'en-US,en;q=0.5',
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                    'Cache-Control': 'no-cache',
                                    'Pragma': 'no-cache'
                                }
                            }).then(response => {
                                if (!response.ok) {
                                    throw new Error(`HTTP error! status: ${response.status}`);
                                }
                                return response.text();
                            });

                            if (html) {
                                const doc = new DOMParser().parseFromString(html, 'text/html');
                                const selectors = [
                                    '.content', 'article', 'main', '.entry-content', 
                                    '.post-content', '#content', '.article-content',
                                    '.fatwa-text', '.answer', '.question-answer'
                                ];
                                
                                for (const selector of selectors) {
                                    const element = doc.querySelector(selector);
                                    if (element?.textContent) {
                                        content = element.textContent.trim();
                                        fetchSuccessful = true;
                                        console.log(`Successfully extracted content using selector: ${selector}`);
                                        break;
                                    }
                                }
                            }
                        } catch (error: unknown) {
                            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                            console.log(`Fetch error for ${item.link}, falling back to snippet: ${errorMessage}`);
                            // We'll handle this in the fallback below - don't rethrow
                        }

                        // If fetch failed or didn't find content, use snippet as fallback
                        if (!fetchSuccessful || !content) {
                            console.log(`Using fallback snippet for ${urlObj.hostname}`);
                            
                            if (item.snippet) {
                                content = item.snippet;
                                
                                // Try to enhance with pagemap content if available
                                if (item.pagemap?.metatags?.length > 0) {
                                    const description = item.pagemap.metatags[0]['og:description'] || 
                                                      item.pagemap.metatags[0].description;
                                    if (description && description.length > content.length) {
                                        content = description;
                                    }
                                }
                            } else {
                                // Last resort
                                content = `Information from ${item.title}. Please refer to the source for details.`;
                            }
                        }

                        // Process the content we have (either from fetch or fallback)
                        if (content) {
                            const quotes: Quote[] = [];
                            let match;
                            while ((match = quoteRegex.exec(content)) !== null) {
                                quotes.push({
                                    text: match[1],
                                    source: match[2]
                                });
                            }

                            statusCallback(`Processing content from ${item.title}`);

                            // Use processContent instead of summarizeContent
                            const processedContent = await processContent(content, quotes);
                            statusCallback(`Results from query "${query}":\n${processedContent}\n\n---`);

                            webResults.push({
                                title: item.title,
                                content: processedContent,
                                quotes: quotes,
                                url: item.link,
                                query: query // Store which query found this result
                            });
                            
                            resultsFoundForThisQuery++;
                            
                            // If we've reached the total maximum results, stop processing
                            if (webResults.length >= MAX_TOTAL_RESULTS) {
                                console.log(`Reached maximum total results (${MAX_TOTAL_RESULTS}). Stopping search.`);
                                break;
                            }
                        }
                    } catch (error) {
                        console.error(`Failed to process result ${item.link} for query "${query}":`, error);
                        continue; // Try next result
                    }
                }

                if (resultsFoundForThisQuery === 0) {
                    console.log(`No valid results found for query: ${query}`);
                } else {
                    console.log(`Found ${resultsFoundForThisQuery} results for query: ${query}`);
                }
            } catch (error) {
                console.error(`Failed to search with query "${query}":`, error);
                continue; // Try next query
            }
        }

        // Create final combined content (no summarization)
        if (webResults.length > 0) {
            statusCallback(`Preparing information from ${webResults.length} sources...`);

            const combinedContent = webResults.map(result => 
                `SOURCE: "${result.title}"\nCONTENT:\n${result.content}\n---\n`
            ).join('\n\n');
            
            statusCallback(`Content prepared and ready for analysis.`);
        }

        return webResults;
    } catch (error) {
        console.error('Search failed:', error);
        return [];
    }
}

// Custom text streamer for token handling
class CustomTextStreamer {
    private tokenizer: Tokenizer;
    private text: string;
    private callback: CallbackFunction | null;
    private isDone: boolean;
    private chunks: string[];

    constructor(tokenizer: Tokenizer) {
        this.tokenizer = tokenizer;
        this.text = '';
        this.callback = null;
        this.isDone = false;
        this.chunks = [];
    }

    setCallback(callback: CallbackFunction) {
        this.callback = callback;
    }

    async put(tokens: number[] | Uint32Array | Int32Array | number) {
        try {
            console.log('Received tokens:', tokens);
            
            // Handle different token input formats
            let tokenArray;
            if (tokens instanceof Uint32Array || tokens instanceof Int32Array) {
                tokenArray = Array.from(tokens);
            } else if (Array.isArray(tokens)) {
                tokenArray = tokens.flat(); // Flatten nested arrays
            } else if (typeof tokens === 'number') {
                tokenArray = [tokens];
            } else {
                console.warn('Unexpected token format:', tokens);
                return;
            }

            // Basic validation
            if (!tokenArray.length) {
                console.log('No valid tokens to process');
                return;
            }

            console.log('Processing tokens:', tokenArray);

            try {
                const decoded = await this.tokenizer.decode(tokenArray);
                if (decoded) {
                    this.chunks.push(decoded);
                    this.text = this.chunks.join('');
                    if (this.callback) {
                        await this.callback(this.text);
                    }
                }
            } catch (decodeError) {
                console.error('Decode error:', decodeError);
                // Try individual tokens if batch decode fails
                for (const token of tokenArray) {
                    try {
                        const singleDecoded = await this.tokenizer.decode([token]);
                        if (singleDecoded) {
                            this.chunks.push(singleDecoded);
                        }
                    } catch (e) {
                        console.warn('Failed to decode token:', token);
                    }
                }
                // Update text and callback even if some tokens failed
                this.text = this.chunks.join('');
                if (this.callback) {
                    await this.callback(this.text);
                }
            }
        } catch (error) {
            console.error('Streaming error:', error);
        }
    }

    markDone() {
        this.isDone = true;
        this.text = this.chunks.join('');
        if (this.callback) {
            this.callback(this.text);
        }
    }

    getGeneratedText() {
        return this.chunks.join('');
    }

    end() {
        this.markDone();
    }
}

// Utility function for fetching with retry
async function fetchWithRetry(url: string, options: RequestInit, retries: number = 3): Promise<string> {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const text = await response.text();
            if (!text) throw new Error('Empty response');
            return text;
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error);
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
    }
    throw new Error('All retry attempts failed');
}

// Generate content with Gemini API
export async function generateWithGemini(
    prompt: string, 
    searchResults: SearchResult[] = [], 
    maxTokens: number = 8000,
    temperature: number = 0.1
): Promise<string> {
    try {
        // Safety check - make sure we're in a browser environment
        if (typeof window === 'undefined' || !window.fetch) {
            throw new Error('This function must be executed in a browser environment');
        }

        // Validate prompt
        if (!prompt || typeof prompt !== 'string') {
            console.error('Invalid prompt provided:', prompt);
            throw new Error('Invalid prompt: Must provide a non-empty string');
        }

        console.log('Starting Gemini API call with prompt length:', prompt.length);
        
        // Set up URL and headers
        const apiKey = 'AIzaSyDFqJZ1JPHBJwzAg_-ZLk0QhJm0j9EJTqQ'; // This is a public key
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
        
        // Construct the web results context
        const webResults = searchResults?.filter(r => r.title && r.content) || [];
        
        // Build request body
        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                maxOutputTokens: maxTokens,
                temperature: temperature,
                topP: 0.95,
                topK: 64
            }
        };
        
        // Make the API request with error handling
        console.log('Sending request to Gemini API...');
        const response = await fetch(`${url}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        // Check for successful response
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error response:', response.status, errorText);
            throw new Error(`Error from Gemini API: ${response.status} - ${errorText || response.statusText}`);
        }
        
        // Parse the response data
        const data = await response.json();
        
        // Validate the response structure
        if (!data || !data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
            console.error('Invalid Gemini API response structure (missing candidates):', data);
            throw new Error('Invalid response from Gemini API: No candidates returned');
        }
        
        const firstPart = data.candidates[0]?.content?.parts?.[0];
        
        if (!firstPart || typeof firstPart.text !== 'string') {
            console.error('Invalid Gemini API response structure (no text):', firstPart);
            throw new Error('Invalid response from Gemini API: No text in first part');
        }
        
        return firstPart.text;
    } catch (error) {
        console.error('Error during Gemini API call:', error);
        if (error instanceof Error) {
            throw error;
        } else {
            throw new Error('Unknown error during Gemini API call');
        }
    }
}

// Function to detect language
function detectLanguage(text: string): string {
    // Russian detection
    const russianRegex = /[\u0400-\u04FF]/;
    if (russianRegex.test(text)) return 'ru';

    // Indonesian detection
    const indonesianWords = ['apa', 'bagaimana', 'dimana', 'kapan', 'siapa', 'mengapa', 'dan', 'atau', 'tetapi', 'karena'];
    const words = text.toLowerCase().split(/\s+/);
    const indonesianCount = words.filter(word => indonesianWords.includes(word)).length;
    if (indonesianCount > 2) return 'id';

    // Mandarin detection
    const mandarinRegex = /[\u4E00-\u9FFF]/;
    if (mandarinRegex.test(text)) return 'zh';

    // Default to English
    return 'en';
}

// Function to detect if a query contains multiple questions/topics
function detectMultiTopicQuery(query: string): boolean {
    // Check for common patterns that indicate multiple questions
    const patterns = [
        // Check for numbered points
        /\d+\s*[\.\)]\s*\w+/i,
        // Check for bullet points
        /[-•*]\s*\w+/i,
        // Check for multiple question marks
        /\?.*\?/i,
        // Check for "and" between potential questions
        /\?.+and.+\?/i,
        // Check for "also" or "what about" indicating additional questions
        /what about|also|additionally|moreover|furthermore/i,
        // Check for separate sentences ending with question marks
        /\?\s+[A-Z]/
    ];
    
    return patterns.some(pattern => pattern.test(query));
}

// Function to process multi-topic query responses
function organizeTopics(response: string): TopicSection[] {
    // Ensure response is a valid string
    if (response === null || response === undefined) {
        console.error('Received null or undefined response');
        return [{ 
            id: 'error-1', 
            title: 'Error Processing Response', 
            content: 'There was an error processing the AI response. Please try again.' 
        }];
    }
    
    // Convert to string if not already a string
    let responseStr: string;
    try {
        responseStr = String(response);
    } catch (err) {
        console.error('Failed to convert response to string:', err);
        return [{ 
            id: 'error-1', 
            title: 'Error Processing Response', 
            content: 'There was an error processing the AI response. Please try again.' 
        }];
    }

    // Look for headers or key demarcations in the text
    const sections: TopicSection[] = [];
    
    try {
        // First try to identify H1 headings (# Title) which are our primary section breaks
        const headerRegex = /(?:^|\n)(#\s+.+)(?:\n|$)/g;
        let match;
        
        // Find all H1 headers
        const headers: {title: string, index: number}[] = [];
        while ((match = headerRegex.exec(responseStr)) !== null) {
            if (match[1] && typeof match[1] === 'string') {
                headers.push({
                    title: match[1].trim(),
                    index: match.index
                });
            }
        }
        
        // If we found headers, use them to divide the content
        if (headers.length > 0) {
            for (let i = 0; i < headers.length; i++) {
                const currentHeader = headers[i];
                const nextHeader = headers[i+1];
                
                const title = currentHeader.title.replace(/^#\s+/, ''); // Remove # prefix
                const startIndex = currentHeader.index + currentHeader.title.length;
                const endIndex = nextHeader ? nextHeader.index : responseStr.length;
                
                let content = responseStr.substring(startIndex, endIndex).trim();
                
                // Process quotes to proper format for styling
                content = content.replace(/<quote source="([^"]+)">([^<]+)<\/quote>/g, 
                    '<div class="quote-container"><div class="quote-source">**$1**</div><div class="quote-text">$2</div></div>');
                
                sections.push({
                    id: `topic-${i+1}`,
                    title,
                    content
                });
            }
            
            return sections;
        } 
        
        // If no H1 headings were found, check for regular section breaks (## Title)
        const subHeaderRegex = /(?:^|\n)(##\s+.+)(?:\n|$)/g;
        const subHeaders: {title: string, index: number}[] = [];
        
        while ((match = subHeaderRegex.exec(responseStr)) !== null) {
            if (match[1] && typeof match[1] === 'string') {
                subHeaders.push({
                    title: match[1].trim(),
                    index: match.index
                });
            }
        }
        
        if (subHeaders.length > 0) {
            // Use subheaders as sections
            for (let i = 0; i < subHeaders.length; i++) {
                const currentHeader = subHeaders[i];
                const nextHeader = subHeaders[i+1];
                
                if (!currentHeader.title) continue;
                
                const title = currentHeader.title.replace(/^##\s+/, ''); // Remove ## prefix
                const startIndex = currentHeader.index + currentHeader.title.length;
                const endIndex = nextHeader ? nextHeader.index : responseStr.length;
                
                let content = responseStr.substring(startIndex, endIndex).trim();
                
                // Process quotes to proper format for styling
                content = content.replace(/<quote source="([^"]+)">([^<]+)<\/quote>/g, 
                    '<div class="quote-container"><div class="quote-source">**$1**</div><div class="quote-text">$2</div></div>');
                
                sections.push({
                    id: `topic-${i+1}`,
                    title,
                    content
                });
            }
            
            return sections;
        }
        
        // Fallback: If no headings found at all, try to find <quote> tags and process them
        let processedResponse = responseStr;
        processedResponse = processedResponse.replace(/<quote source="([^"]+)">([^<]+)<\/quote>/g, 
            '<div class="quote-container"><div class="quote-source">**$1**</div><div class="quote-text">$2</div></div>');
        
        // Split by double newlines for paragraph-based sections
        const paragraphs = processedResponse.split('\n\n');
        if (paragraphs.length > 3) { // Only use if we have meaningful distinct paragraphs
            // Group paragraphs into logical sections
            const paragraphsPerSection = paragraphs.length <= 6 ? 2 : 3;
            
            // Safe slice implementation to handle potential non-array object
            const safeSlice = (arr: string[], start: number, end?: number): string[] => {
                if (!Array.isArray(arr)) {
                    console.error('Expected array for slice operation, got:', typeof arr);
                    return [];
                }
                try {
                    return arr.slice(start, end);
                } catch (err) {
                    console.error('Error during slice operation:', err);
                    return [];
                }
            };
            
            for (let i = 0; i < paragraphs.length; i += paragraphsPerSection) {
                // Use safe slice implementation
                const sectionParagraphs = safeSlice(paragraphs, i, i + paragraphsPerSection);
                
                // Safely get first sentence
                let title = '';
                if (sectionParagraphs[0]) {
                    const firstSentenceParts = sectionParagraphs[0].split('.');
                    const firstSentence = firstSentenceParts[0] || '';
                    title = firstSentence.length > 50 
                        ? firstSentence.substring(0, 50) + '...' 
                        : firstSentence;
                } else {
                    title = `Section ${Math.floor(i/paragraphsPerSection) + 1}`;
                }
                
                sections.push({
                    id: `topic-${Math.floor(i/paragraphsPerSection) + 1}`,
                    title: title,
                    content: sectionParagraphs.join('\n\n')
                });
            }
        } else {
            // Single section if we can't identify multiple topics
            sections.push({
                id: 'topic-1',
                title: 'Response',
                content: processedResponse
            });
        }
    } catch (error) {
        console.error('Error organizing topics:', error);
        return [{
            id: 'error-1',
            title: 'Error Processing Response', 
            content: 'There was an error processing the response. Please try again.'
        }];
    }
    
    return sections.length ? sections : [{
        id: 'topic-1',
        title: 'Response',
        content: responseStr
    }];
}

// Update the generateContent function
export async function generateContent(
    input: string,
    statusCallback: (status: string) => void
): Promise<string | TopicSection[]> {
    if (typeof window === 'undefined') {
        throw new Error('generateContent must be run in browser context');
    }

    // Validate inputs
    if (!input || typeof input !== 'string') {
        throw new Error('Invalid input: Input must be a non-empty string');
    }
    
    if (typeof statusCallback !== 'function') {
        console.warn('Invalid statusCallback provided: Using default console logger');
        statusCallback = (msg) => console.log('Status:', msg);
    }

    console.log('Starting content generation for:', input);
    const trimmedInput = input.trim();
    if (!trimmedInput) {
        throw new Error('Empty input provided');
    }

    const isMultiTopic = detectMultiTopicQuery(trimmedInput);
    console.log('Is multi-topic query:', isMultiTopic);

    try {
        // Detect language from input
        const detectedLanguage = detectLanguage(trimmedInput);
        console.log('Detected language:', detectedLanguage);
        
        statusCallback('Searching for relevant information');
        
        const webResults = await searchAndFetchContent(trimmedInput, statusCallback);
        console.log('Web results gathered:', webResults.length);
        
        if (!webResults || !Array.isArray(webResults) || webResults.length === 0) {
            throw new Error('No relevant information found');
        }

        // Send all content to Gemini without summarization
        const webContext = webResults
            .map(result => 
                `SOURCE: "${result.title}"\nCONTENT:\n${result.content}\n---\n`
            ).join('\n');

        // Generate response using Gemini with enhanced instructions
        // Modify the prompt to encourage more elaboration and detail
        const promptBase = isMultiTopic ? 
            `You are a helpful AI assistant specializing in Islamic knowledge. The user has asked a question with multiple topics or aspects. Please respond in the same language as the input question.
            
For each topic or aspect of the question, create a dedicated section with a clear heading.

Context from Islamic sources:
${webContext}

Question: ${trimmedInput}

Instructions:
1. Use ONLY information provided in the context above
2. If quotes exist, use them exactly as provided with proper attribution
3. If context lacks clear evidence, acknowledge the limitations
4. Present multiple viewpoints when available
5. Clearly distinguish between:
   - Direct quotes from sources
   - Summarized information
   - General guidance based on provided information
6. IMPORTANT: Elaborate in detail on each point - provide thorough explanations
7. Organize your response with clear headings (use markdown ## format) for each topic or aspect
8. For each topic, provide extensive explanation with examples where possible
9. Include relevant context and nuance for each point

STRICT FORMATTING RULES (MUST FOLLOW EXACTLY):
- Use "# " (H1) for EACH main section heading - this is critical for proper display
- Each H1 heading creates a completely separate scrollable section
- Scholar names and reference details MUST be placed at the top of each section in bold format using ** ** 
- Format direct quotes EXACTLY as follows (use this precise syntax):
  <quote source="Source Name (Book/Reference)">Quoted text goes here verbatim</quote>
- Sources must always be placed inside the source attribute, NEVER within the quote text
- Make each section comprehensive and able to stand alone without needing to read other sections
- For non-quote paragraphs, use standard markdown formatting
- Break long text into readable paragraphs

Begin Response:` :
            `You are a helpful AI assistant specializing in Islamic knowledge. Please respond in the same language as the input question.

Context from Islamic sources:
${webContext}

Question: ${trimmedInput}

Instructions:
1. Use ONLY information provided in the context above
2. If quotes exist, use them exactly as provided with proper attribution
3. If context lacks clear evidence, acknowledge the limitations
4. Present multiple viewpoints when available
5. IMPORTANT: Elaborate in detail - provide thorough explanations with examples
6. Include relevant historical context where helpful

STRICT FORMATTING RULES (MUST FOLLOW EXACTLY):
- Use headings and subheadings to organize your response
- Format direct quotes EXACTLY as follows (use this precise syntax): 
  <quote source="Source Name (Book/Reference)">Quoted text goes here verbatim</quote>
- All quotes will be displayed with 50% opacity and indented
- Sources must always be placed inside the source attribute, NEVER within the quote text
- For non-quote paragraphs, use standard markdown formatting
- Break long text into readable paragraphs

Begin Response:`;

        statusCallback('Formulating detailed response...');
        const response = await generateWithGemini(promptBase, webResults);

        if (!response || typeof response !== 'string' || response.trim() === '') {
            throw new Error('Empty or invalid response from Gemini');
        }

        console.log('Response complete. Length:', response.length);
        
        // For multi-topic queries, process the response into sections
        if (isMultiTopic) {
            const sections = organizeTopics(response);
            if (!sections || !Array.isArray(sections) || sections.length === 0) {
                throw new Error('Failed to organize response into sections');
            }
            console.log('Organized into sections:', sections.length);
            return sections;
        }
        
        return response;
        
    } catch (error) {
        let errorMessage = 'An unknown error occurred';
        if (error instanceof Error) {
            errorMessage = error.message || errorMessage; 
        } else if (typeof error === 'string') {
            errorMessage = error;
        }
        console.error('Error details:', error);
        throw new Error(errorMessage);
    }
}

// For backward compatibility
export async function generateThoughts(input: string): Promise<void> {
    if (typeof window === 'undefined') {
        throw new Error('generateThoughts must be run in browser context');
    }
    
    console.log('Calling legacy generateThoughts function');
    const resultElement = document.getElementById('result-text');
    
    try {
        if (!input.trim()) {
            alert('hey! you forgot to write something :|');
            return;
        }
        
        const response = await generateContent(
            input,
            (status) => {
                if (resultElement) {
                    resultElement.innerHTML = status;
                }
            }
        );
        
        if (resultElement) {
            resultElement.innerHTML = `<div class="final-response">${response}</div>`;
            resultElement.classList.remove('thinking');
        }
    } catch (error) {
        if (resultElement) {
            resultElement.classList.remove('thinking');
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
            resultElement.innerHTML = `<div class="error-message">Error occurred: ${errorMessage}</div>`;
        }
        console.error('Error in generateThoughts:', error);
    }
}
