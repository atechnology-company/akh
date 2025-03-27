import { pipeline, TextStreamer } from '@huggingface/transformers';
import { TextRank } from '../modules/textrank';
import type { 
    Config, 
    SearchResult, 
    Quote, 
    GeminiResponse, 
    Tokenizer, 
    CallbackFunction 
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

let summarizer: any;

// Initialize the pipeline and assign generator globally
export async function initializePipeline() {
    try {
        console.log('Initializing summarizer model');
        summarizer = await pipeline(
            "summarization",
            "Xenova/bart-large-cnn", // Smaller BART model
            { 
                dtype: "fp32",
                device: "webgpu"
            }
        );
        console.log('Summarizer initialized');
    } catch (error) {
        console.error('Factory failed to start:', error);
        throw error;
    }
}

// Only initialize if we're in the browser
if (typeof window !== 'undefined') {
    initializePipeline();
}

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

// Summarize content function 
async function summarizeContent(content: string, quotes: Array<Quote>): Promise<string> {
    try {
        if (!content || typeof content !== 'string') {
            console.error('Invalid content received:', content);
            return '';
        }

        // Skip summarization for Arabic text
        if (isArabic(content)) {
            console.log('Arabic text detected, skipping summarization');
            if (quotes?.length > 0) {
                return content + '\n\nRelevant Quotes:\n' + 
                    quotes.map(q => `"${q.text}" [${q.source}]`).join('\n');
            }
            return content;
        }

        // Clean and normalize content
        let cleanContent = content
            .replace(/\s+/g, ' ')
            .replace(/[\r\n]+/g, '\n')
            .trim();

        console.log('Clean content length:', cleanContent.length);

        let summarized = '';
        if (summarizer) {
            const summary = await summarizer(cleanContent, {
                max_length: 256,
                min_length: 30,
                do_sample: false
            });
            
            if (summary?.[0]?.summary_text) {
                summarized = summary[0].summary_text;
            }
        }

        if (!summarized) {
            // Fallback to TextRank
            const textRank = new TextRank();
            summarized = textRank.summarize(content, 3) || content;
        }

        if (quotes?.length > 0) {
            summarized += '\n\nRelevant Quotes:\n' + 
                quotes.map(q => `"${q.text}" [${q.source}]`).join('\n');
        }

        return summarized;

    } catch (error) {
        console.error('Summarization error:', error);
        const textRank = new TextRank();
        return textRank.summarize(content, 3) || content;
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
        const outputText = await generateWithGemini(optimizationPrompt, 0.7);
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

                            statusCallback(`Summarizing content from ${item.title}`);

                            const summarizedContent = await summarizeContent(content, quotes);
                            statusCallback(`Results from query "${query}":\n${summarizedContent}\n\n---`);

                            webResults.push({
                                title: item.title,
                                content: summarizedContent,
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

        // Create final combined summary
        if (webResults.length > 0) {
            statusCallback(`Creating final summary from ${webResults.length} sources...`);

            const combinedContent = webResults.map(result => 
                `Source [via "${result.query}"]: ${result.title}\n${result.content}`
            ).join('\n\n');
            
            const finalSummary = await summarizeContent(
                combinedContent, 
                webResults.flatMap(result => result.quotes)
            );

            statusCallback(`Final Combined Summary:\n${finalSummary}`);
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
export async function generateWithGemini(prompt: string, temperature: number = 0.7): Promise<string> {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': config.GEMINI_API_KEY
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: temperature,
                topK: 40,
                topP: 0.8,
                maxOutputTokens: 2048
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content || !data.candidates[0].content.parts || data.candidates[0].content.parts.length === 0) {
        throw new Error('Invalid or empty response from Gemini API');
    }
    
    return data.candidates[0].content.parts[0].text;
}

// Main generation function that uses the status callback
export async function generateContent(
    input: string,
    statusCallback: (status: string) => void
): Promise<string> {
    if (typeof window === 'undefined') {
        throw new Error('generateContent must be run in browser context');
    }

    console.log('Starting content generation for:', input);
    const trimmedInput = input.trim();
    if (!trimmedInput) {
        throw new Error('Empty input provided');
    }

    try {
        statusCallback('Searching for relevant information');
        
        const webResults = await searchAndFetchContent(trimmedInput, statusCallback);
        console.log('Web results gathered:', webResults.length);
        
        if (webResults.length === 0) {
            throw new Error('No relevant information found');
        }

        // Limit and structure web context
        const webContext = webResults
            .slice(0, 3) // Limit to top 3 results
            .map(result => 
                `SOURCE: "${result.title}"\nCONTENT:\n${result.content}\n---\n`
            ).join('\n');

        // First phase: Generate organized summary with better structure
        console.log('Starting organization phase...');
        const summaryPrompt = `${ASSISTANT_PROMPT}s

Task: Organize and summarize the following Islamic information into clear sections.

Sources:
${webContext}

Output Format:
1. Key point in English with digestible explanation
2. evidence from sources, no need for links, just the book or scholar and the content.

Use markdown formatting.

Begin Summary:`;
        
        statusCallback('Processing information...');
        const organizedSummary = await generateWithGemini(summaryPrompt, 0.3);

        if (!organizedSummary) {
            throw new Error('Failed to generate summary');
        }

        console.log('Organization phase complete. Length:', organizedSummary.length);
        statusCallback('Organizing Information:\n\n' + organizedSummary);

        // Second phase: Generate final response using Gemini
        console.log('Starting response phase...');
        const finalPrompt = `${ASSISTANT_PROMPT}

Context:
${organizedSummary}

Question: ${trimmedInput}

Provide a structured response following the format above.`;

        statusCallback('Formulating response...');
        const finalResponse = await generateWithGemini(finalPrompt, 0.7);

        if (!finalResponse) {
            throw new Error('Failed to generate response');
        }

        console.log('Response phase complete. Length:', finalResponse.length);
        return finalResponse;
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
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
