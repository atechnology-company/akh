import { pipeline, TextStreamer } from '@huggingface/transformers';
import { TextRank } from './modules/textrank.ts';

interface Config {
    GOOGLE_API_KEY: string;
    SEARCH_ENGINE_ID: string;
    GEMINI_API_KEY: string;
    GEMINI_API_URL: string;
}

interface SearchResult {
    title: string;
    content: string;
    quotes: Quote[];
    url: string;
    query: string;
}

interface Quote {
    text: string;
    source: string;
}

interface GeminiResponse {
    text: string;
}

const config: Config = {
    GOOGLE_API_KEY: 'key',
    SEARCH_ENGINE_ID: 'key',
    GEMINI_API_KEY: 'key',
    GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent'
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

let generator: any;
let summarizer: any;

// Initialize the pipeline and assign generator globally
async function initializePipeline() {
    const loadingOverlay = $('#loading-overlay');
    loadingOverlay.addClass('hidden');
    
    try {
        console.log('Initializing models');
        // Initialize models sequentially to avoid memory issues
        generator = await pipeline(
            "text-generation",
            "onnx-community/granite-3.0-2b-instruct",
            { 
                dtype: "q4f16",
                device: 'webgpu',
            }
        );
        console.log('Generator initialized');

        summarizer = await pipeline(
            "summarization",
            "Xenova/bart-large-cnn",
            { 
                dtype: "fp32",
                device: 'webgpu',
            }
        );
        console.log('Summarizer initialized');

    } catch (error) {
        console.error('Factory failed to start:', error);
        alert('Model initialization failed. Please refresh the page and try again.');
    } finally {
        if (loadingOverlay) {
            loadingOverlay.removeClass('hidden');
        }
    }
}

// Start factory when page loads
initializePipeline();

// Modify summarizeContent function
async function summarizeContent(content: string, quotes: Array<Quote>): Promise<string> {
    try {
        if (!content || typeof content !== 'string') {
            console.error('Invalid content received:', content);
            return '';
        }

        // Clean and normalize content
        let cleanContent = content
            .replace(/\s+/g, ' ')
            .replace(/[\r\n]+/g, '\n')
            .trim();

        if (cleanContent.length > 1024) {
            cleanContent = cleanContent.substring(0, 1024);
        }

        console.log('Clean content length:', cleanContent.length);

        const summary = await summarizer(cleanContent, {
            max_length: 512,
            min_length: 50,
            do_sample: false,
            early_stopping: true,
            no_repeat_ngram_size: 3,
        });

        console.log('Raw BART output:', summary);

        // Check for the correct BART output structure
        if (summary?.[0]?.summary_text) {
            console.log('Valid BART summary found');
            let finalContent = summary[0].summary_text;

            if (quotes?.length > 0) {
                finalContent += '\n\nRelevant Quotes:\n' + 
                    quotes.map(q => `"${q.text}" [${q.source}]`).join('\n');
            }

            return finalContent;
        }

        console.warn('Unexpected BART output structure:', summary);
        throw new Error('Invalid BART output structure');

    } catch (error) {
        console.error('Summarization error:', error);
        const textRank = new TextRank();
        return textRank.summarize(content, 5) || content;
    }
}

async function optimizeQuery(query: string, definitionMode = false) {
    if (!generator) return [query];

    const optimizationPrompt = definitionMode ? 
        `Task: Generate 2 focused search queries to understand exactly what "${query}" is.
        Rules:
        1. STRICTLY relate to understanding what "${query}" is
        2. NO examples - focus only on the query provided
        3. Include "meaning", "definition", or "explanation" terms
        4. Keep original terms from the query
        5. DO NOT add unrelated concepts

        Format: Write ONLY the queries, one per line starting with "-"
        ` :
        `Task: Generate THREE focused search queries about: "${query}"
        Rules:
        1. STRICTLY relate to "${query}" - do not add unrelated topics
        2. NO examples - focus only on the query provided
        3. Keep all key terms from the original query
        4. DO NOT change the topic or add assumptions

        Format: Write ONLY the queries, one per line starting with "-"
        `;

    try {
        const output = await generator(optimizationPrompt, {
            max_new_tokens: 256,
            temperature: 0.3, // Reduced temperature for more focused output
            do_sample: false, // Disable sampling for more deterministic results
            eos_token_id: generator.tokenizer.eos_token_id,
            repetition_penalty: 1.2, // Increased to reduce repetition
            presence_penalty: 1.1 // Add presence penalty to encourage focus on query terms
        });

        // Extract and limit queries
        const queries = output[0].generated_text
            .split('\n')
            .filter(line => line.trim().startsWith('-'))
            .map(line => line.trim().substring(2).trim())
            .filter(query => query.length > 0 && !query.includes('Example'))
            .slice(0, 3); // Get only 3 optimized queries

        // Return max 5 queries total including original
        return Array.from(new Set([query, ...queries])).slice(0, 5);
    } catch (error) {
        console.error('Query optimization failed:', error);
        return [query];
    }
}

// Add this function near the top with other utility functions
function updateStatus(text: string, resultElement: JQuery<HTMLElement>) {
    // Grey out previous content
    const existingContent = resultElement.html();
    if (existingContent) {
        resultElement.html(`
            <div class="previous-status">${existingContent}</div>
            <div class="current-status">${text}</div>
        `);
    } else {
        resultElement.html(`<div class="current-status">${text}</div>`);
    }
    
    // Scroll to bottom
    resultElement.scrollTop(resultElement[0].scrollHeight);
}

// Modify searchAndFetchContent to use the new status update function
async function searchAndFetchContent(originalQuery: string) {
    try {
        const optimizedQueries = await optimizeQuery(originalQuery);
        console.log('Optimized queries:', optimizedQueries);

        const resultElement = $('#result-text');
        const webResults = [];
        const processedUrls = new Set(); // Track processed URLs
        const quoteRegex = /"([^"]+)"\s*[\[\(]([^\]\)]+)[\]\)]/g;

        for (let queryIndex = 0; queryIndex < optimizedQueries.length; queryIndex++) {
            const query = optimizedQueries[queryIndex];
            updateStatus(`Searching with query ${queryIndex + 1}: "${query}"`, resultElement);

            const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${config.GOOGLE_API_KEY}&cx=${config.SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`;
            const searchResponse = await fetch(searchUrl);
            const searchData = await searchResponse.json();

            if (!searchData.items || searchData.items.length === 0) continue;

            // Try each result until we find a new URL
            let foundNewUrl = false;
            for (const item of searchData.items) {
                if (processedUrls.has(item.link)) {
                    console.log(`Skipping duplicate URL: ${item.link}`);
                    continue;
                }

                try {
                    processedUrls.add(item.link); // Add URL to tracked set
                    const html = await fetchWithRetry(item.link, {
                        method: 'GET',
                        headers: {
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        }
                    });

                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    const selectors = ['.content', 'article', 'main', '.entry-content', '.post-content', '#content'];
                    let content = '';
                    
                    for (const selector of selectors) {
                        const element = doc.querySelector(selector);
                        if (element?.textContent) {
                            content = element.textContent.trim();
                            break;
                        }
                    }

                    if (!content && item.snippet) {
                        content = item.snippet;
                    }

                    if (content) {
                        const quotes = [];
                        let match;
                        while ((match = quoteRegex.exec(content)) !== null) {
                            quotes.push({
                                text: match[1],
                                source: match[2]
                            });
                        }

                        updateStatus(`Summarizing content from ${item.title}`, resultElement);

                        const summarizedContent = await summarizeContent(content, quotes);
                        updateStatus(`Results from query "${query}":\n${summarizedContent}\n\n---`, resultElement);

                        webResults.push({
                            title: item.title,
                            content: summarizedContent,
                            quotes: quotes,
                            url: item.link,
                            query: query // Store which query found this result
                        });
                        foundNewUrl = true;
                        break; // Found a valid new URL, move to next query
                    }
                } catch (error) {
                    console.error(`Failed to process result ${item.link} for query "${query}":`, error);
                    continue; // Try next result
                }
            }

            if (!foundNewUrl) {
                console.log(`No new URLs found for query: ${query}`);
            }
        }

        // Create final combined summary
        if (webResults.length > 0) {
            updateStatus(`Creating final summary from ${webResults.length} sources...`, resultElement);

            const combinedContent = webResults.map(result => 
                `Source [via "${result.query}"]: ${result.title}\n${result.content}`
            ).join('\n\n');
            
            const finalSummary = await summarizeContent(
                combinedContent, 
                webResults.flatMap(result => result.quotes)
            );

            updateStatus(`Final Combined Summary:\n${finalSummary}`, resultElement);
        }

        return webResults;
    } catch (error) {
        console.error('Search failed:', error);
        return [];
    }
}

// Modify the streaming part of generateThoughts
interface Tokenizer {
    decode(tokens: number[]): Promise<string>;
}

type CallbackFunction = (text: string) => Promise<void>;

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

async function generateWithGemini(prompt: string, temperature: number = 0.7): Promise<string> {
    const response = await fetch(config.GEMINI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.GEMINI_API_KEY}`
        },
        body: JSON.stringify({
            contents: [{ text: prompt }],
            generationConfig: {
                temperature,
                topK: 40,
                topP: 0.8,
                maxOutputTokens: 2048
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json() as GeminiResponse;
    if (!data?.text) {
        throw new Error('Invalid response format from Gemini API');
    }

    return data.text;
}

async function generateThoughts() {
    console.log('We have reached the function!');
    const trimmedInput = input.val().trim();
    if (trimmedInput === "") {
        alert('hey! you forgot to write something :|');
        return;
    }

    if (!generator) {
        alert("Generator not ready yet, wait like strong vodka in barrel");
        return;
    }

    const resultElement = $('#result-text');
    resultElement.text('Searching for relevant information');
    resultElement.addClass('thinking');

    $('#input-page').removeClass('active');
    $('#input-page').addClass('inactive');
    $('#result-page').removeClass('inactive');
    $('#result-page').addClass('active');

    try {
        const webResults = await searchAndFetchContent(trimmedInput);
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
1. Key Points:
- List main points
- Include source references

2. Scholarly Views:
- Present different positions
- Include attributions

3. Evidence:
- Direct quotes
- Citations

Begin Summary:`;
        
        updateStatus('Processing information...', resultElement);
        const organizedSummary = await generateWithGemini(summaryPrompt, 0.3);

        if (!organizedSummary) {
            throw new Error('Failed to generate summary');
        }

        console.log('Organization phase complete. Length:', organizedSummary.length);
        updateStatus('Organizing Information:\n\n' + organizedSummary, resultElement);

        // Second phase: Generate final response using Gemini
        console.log('Starting response phase...');
        const finalPrompt = `${ASSISTANT_PROMPT}

Context:
${organizedSummary}

Question: ${trimmedInput}

Provide a structured response following the format above.`;

        updateStatus('Formulating response...', resultElement);
        const finalResponse = await generateWithGemini(finalPrompt, 0.7);

        if (!finalResponse) {
            throw new Error('Failed to generate response');
        }

        console.log('Response phase complete. Length:', finalResponse.length);

        // Display final result
        resultElement.removeClass('thinking');
        resultElement.html(`<div class="final-response">${finalResponse}</div>`);
        
    } catch (error) {
        resultElement.removeClass('thinking');
        resultElement.html(`<div class="error-message">Error occurred: ${error.message}</div>`);
        console.error('Error details:', error);
    }
}

export { generateThoughts };
