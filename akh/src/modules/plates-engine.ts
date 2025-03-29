import type { 
    Config, 
    SearchResult, 
    Quote, 
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

// Function to detect if text is Arabic
function isArabic(text: string): boolean {
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return arabicRegex.test(text);
}

// Process content without summarization
async function processContent(content: string, quotes: Array<Quote>): Promise<string> {
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

        // Add quotes if they exist
        if (quotes?.length > 0) {
            cleanContent += '\n\nRelevant Quotes:\n' + 
                quotes.map(q => `"${q.text}" [${q.source}${q.url ? ' ' + q.url : ''}]`).join('\n');
        }

        return cleanContent;
    } catch (error) {
        console.error('Content processing error:', error);
        return content; // Return original content on error
    }
}

// Optimize search queries
async function optimizeQuery(query: string, definitionMode = false): Promise<string[]> {
    // Break complex queries into multiple single-topic queries
    const singleTopicQueries = breakIntoSingleTopics(query);
    
    if (singleTopicQueries.length > 1) {
        console.log('Detected multi-topic query, breaking into separate queries:', singleTopicQueries);
        
        // Create optimized queries for each topic
        const allOptimizedQueries: string[] = [];
        
        for (const topicQuery of singleTopicQueries) {
            const topicOptimizations = await generateOptimizedQueriesForTopic(topicQuery, definitionMode);
            allOptimizedQueries.push(...topicOptimizations.slice(0, 2)); // Limit to 2 optimizations per topic
        }
        
        // Add the original query too
        allOptimizedQueries.unshift(query);
        
        // Return unique queries, limit to avoid excessive searches
        return Array.from(new Set(allOptimizedQueries)).slice(0, Math.min(8, singleTopicQueries.length * 2 + 1));
    }
    
    // For simple queries, use the standard optimization
    return await generateOptimizedQueriesForTopic(query, definitionMode);
}

// Helper function to break a complex query into single topics
function breakIntoSingleTopics(query: string): string[] {
    // Simple pattern matching to detect multi-topic queries
    const topics: string[] = [];
    
    // Check for numbered lists or bullet points
    const numberedPattern = /(\d+[\.\)]\s*[^.?!]+[.?!])/g;
    const bulletPattern = /([-•*]\s*[^.?!]+[.?!])/g;
    
    let numberedMatches = query.match(numberedPattern);
    let bulletMatches = query.match(bulletPattern);
    
    if (numberedMatches && numberedMatches.length > 1) {
        topics.push(...numberedMatches.map(m => m.trim()));
    } else if (bulletMatches && bulletMatches.length > 1) {
        topics.push(...bulletMatches.map(m => m.trim()));
    } else {
        // Check for multiple questions
        const questionPattern = /([^.!?]+\?)/g;
        const questions = query.match(questionPattern);
        
        if (questions && questions.length > 1) {
            topics.push(...questions.map(q => q.trim()));
        } else if (query.includes(' and ') || query.includes(' vs ') || query.includes(' versus ')) {
            // Simple check for "and" or comparison operators indicating multiple topics
            const parts = query
                .split(/\s+(?:and|vs|versus)\s+/i)
                .map(p => p.trim())
                .filter(p => p.length > 10); // Filter out very short segments
                
            if (parts.length > 1) {
                topics.push(...parts);
            }
        }
    }
    
    // If we couldn't detect separate topics, just use the original query
    if (topics.length === 0) {
        return [query];
    }
    
    return topics;
}

// Generate optimized queries for a single topic
async function generateOptimizedQueriesForTopic(query: string, definitionMode = false): Promise<string[]> {
    const optimizationPrompt = definitionMode ? 
        `Task: Generate 3 focused search queries to understand what "${query}" means in Islamic context.
        Rules:
        1. Focus on Islamic meaning and definition of "${query}"
        2. Include variations of terminology
        3. At least 1 query MUST be in Arabic (use Arabic script)
        4. Keep each query focused on ONE specific aspect only - don't combine multiple topics
        5. Make queries short and precise (max 10 words per query)

        Format: Write ONLY the finished search queries (not keywords), one per line starting with "-"` :
        `Task: Generate 4 focused search queries about: "${query}"
        Rules:
        1. Create complete, well-formed search queries (not just keywords)
        2. At least 1 query MUST be in Arabic language (use Arabic script)
        3. Include Islamic terminology like hadith, quran, fatwa, ruling
        4. Keep each query focused on ONE specific aspect only - don't combine multiple topics
        5. Make queries short and precise (max 10 words per query)

        Format: Write ONLY the finished search queries, one per line starting with "-"`;

    try {
        const outputText = await generateWithGemini(optimizationPrompt, [], 2048, 0.7);
        
        // Extract queries
        const queries = outputText
            .split('\n')
            .filter(line => line.trim().startsWith('-'))
            .map(line => line.trim().substring(2).trim())
            .filter(q => q.length > 0 && !q.includes('Example'))
            .slice(0, 3); // Limit to top 3 queries per topic
        
        // Add the original query if not already included
        if (!queries.includes(query)) {
            queries.unshift(query);
        }
        
        // Return unique queries
        return Array.from(new Set(queries)).slice(0, 4); // Max 4 queries per topic
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
        const MAX_RESULTS_PER_QUERY = 3; // Reduced from 5 to 3
        const MAX_TOTAL_RESULTS = 12; // Slightly reduced from 15
        
        let totalQuotesFound = 0;

        for (const query of optimizedQueries) {
            statusCallback(`Searching with query: "${query}"`);

            // Stop if we've reached maximum results
            if (webResults.length >= MAX_TOTAL_RESULTS) {
                break;
            }

            try {
                // API call to Google Custom Search
                const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${config.GOOGLE_API_KEY}&cx=${config.SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`;
                const searchResponse = await fetch(searchUrl);
                
                if (!searchResponse.ok) {
                    console.error(`Search error: ${searchResponse.status} ${searchResponse.statusText}`);
                    continue;
                }

                const searchData = await searchResponse.json();
                if (!searchData.items || searchData.items.length === 0) {
                    continue;
                }

                // Process results
                let resultsFoundForThisQuery = 0;
                
                // Prioritize items with titles that seem more relevant
                const items = [...searchData.items].sort((a, b) => {
                    // Calculate relevance score based on title and snippet
                    const scoreA = calculateRelevanceScore(a, query);
                    const scoreB = calculateRelevanceScore(b, query);
                    return scoreB - scoreA; // Sort descending
                });
                
                for (const item of items) {
                    // Check limits
                    if (resultsFoundForThisQuery >= MAX_RESULTS_PER_QUERY || 
                        webResults.length >= MAX_TOTAL_RESULTS) {
                        break;
                    }
                    
                    // Skip duplicates
                    if (processedUrls.has(item.link)) {
                        continue;
                    }
                    
                    try {
                        processedUrls.add(item.link);
                        
                        let content = '';
                        let fetchSuccessful = false;
                        
                        // Try to fetch content with timeout to avoid long-running fetches
                        try {
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
                            
                            const html = await fetch(item.link, {
                                method: 'GET',
                                mode: 'cors',
                                signal: controller.signal,
                                headers: {
                                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                                    'Accept-Language': 'en-US,en;q=0.5',
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                    'Cache-Control': 'no-cache'
                                }
                            }).then(response => {
                                clearTimeout(timeoutId);
                                if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
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
                                        break;
                                    }
                                }
                            }
                        } catch (error) {
                            console.log(`Fetch failed for ${item.link}: ${error instanceof Error ? error.message : 'Unknown error'}. Using snippet instead.`);
                            // Fall back to snippet
                        }

                        // Use snippet as fallback
                        if (!fetchSuccessful || !content) {
                            if (item.snippet) {
                                content = item.snippet;
                                
                                // Try to enhance with meta description if available
                                if (item.pagemap?.metatags?.length > 0) {
                                    const description = item.pagemap.metatags[0]['og:description'] || 
                                                      item.pagemap.metatags[0].description;
                                    if (description && description.length > content.length) {
                                        content = description;
                                    }
                                }
                            } else {
                                content = `Information from ${item.title}. Please refer to the source for details.`;
                            }
                        }

                        // Process content and extract quotes
                        if (content) {
                            const quotes: Quote[] = [];
                            let match;
                            
                            console.log(`Search result: ${item.title} (${item.link}), content length: ${content.length}`);
                            
                            // Extract quotes with a regex
                            while ((match = quoteRegex.exec(content)) !== null) {
                                console.log(`Found quote in content: "${match[1].substring(0, 50)}..." [${match[2]}]`);
                                
                                quotes.push({
                                    text: match[1],
                                    source: match[2],
                                    url: item.link // Store the source URL with the quote
                                });
                                totalQuotesFound++;
                            }

                            statusCallback(`Processing content from ${item.title}`);
                            const processedContent = await processContent(content, quotes);

                            webResults.push({
                                title: item.title,
                                content: processedContent,
                                quotes: quotes,
                                url: item.link,
                                query: query
                            });
                            
                            resultsFoundForThisQuery++;
                            
                            // Manually add a quote if none were found
                            if (quotes.length === 0 && content.length > 100) {
                                const excerpt = content.substring(0, 200).trim() + (content.length > 200 ? '...' : '');
                                console.log(`Adding manual quote from: ${item.title}`);
                                
                                webResults[webResults.length - 1].quotes.push({
                                    text: excerpt,
                                    source: item.title,
                                    url: item.link
                                });
                                totalQuotesFound++;
                            }
                        }
                    } catch (error) {
                        console.error(`Failed to process result: ${error}`);
                        continue;
                    }
                }
            } catch (error) {
                console.error(`Search failed for query "${query}":`, error);
                continue;
            }
        }

        console.log(`Found ${totalQuotesFound} quotes from ${webResults.length} sources`);
        
        if (webResults.length > 0) {
            statusCallback(`Preparing information from ${webResults.length} sources...`);
        }

        return webResults;
    } catch (error) {
        console.error('Search failed:', error);
        return [];
    }
}

// Helper function to calculate relevance score for search results
function calculateRelevanceScore(item: any, query: string): number {
    let score = 0;
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    
    // Check title
    if (item.title) {
        const titleLower = item.title.toLowerCase();
        queryWords.forEach(word => {
            if (titleLower.includes(word)) score += 3;
        });
        
        // Exact match is very valuable
        if (titleLower.includes(query.toLowerCase())) score += 10;
    }
    
    // Check snippet
    if (item.snippet) {
        const snippetLower = item.snippet.toLowerCase();
        queryWords.forEach(word => {
            if (snippetLower.includes(word)) score += 1;
        });
    }
    
    // Prioritize Islamic sources
    const domainPriority = [
        '.gov.sa', 'islamqa', 'quran', 'hadith', 'fatwa', 'islamic', 'islam', 'muslim'
    ];
    
    if (item.link) {
        const linkLower = item.link.toLowerCase();
        domainPriority.forEach(domain => {
            if (linkLower.includes(domain)) score += 2;
        });
    }
    
    return score;
}

// Generate content with Gemini API
export async function generateWithGemini(
    prompt: string, 
    searchResults: SearchResult[] = [], 
    maxTokens: number = 8000,
    temperature: number = 0.1
): Promise<string> {
    try {
        // Validate environment and inputs
        if (typeof window === 'undefined') {
            throw new Error('Must be executed in browser environment');
        }

        if (!prompt || typeof prompt !== 'string') {
            throw new Error('Invalid prompt: Must provide a non-empty string');
        }

        // Use environment variable or fallback to default (remove hardcoded key)
        const apiKey = config.GEMINI_API_KEY || '';
        if (!apiKey) {
            throw new Error('Missing Gemini API key');
        }
        
        const url = config.GEMINI_API_URL;
        
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
        
        // Make API request
        const response = await fetch(`${url}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${errorText || response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error('Invalid response from Gemini API');
        }
        
        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Gemini API error:', error);
        throw error instanceof Error ? error : new Error('Unknown error during API call');
    }
}

// Function to detect language
function detectLanguage(text: string): string {
    // Arabic detection (highest priority)
    if (isArabic(text)) return 'ar';
    
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
    const patterns = [
        /\d+\s*[\.\)]\s*\w+/i,           // Numbered points
        /[-•*]\s*\w+/i,                   // Bullet points
        /\?.*\?/i,                        // Multiple question marks
        /\?.+and.+\?/i,                   // "and" between questions
        /what about|also|additionally/i,  // Additional question indicators
        /\?\s+[A-Z]/                      // Separate sentences with question marks
    ];
    
    return patterns.some(pattern => pattern.test(query));
}

// Function to process multi-topic query responses
export function organizeTopics(content: string): TopicSection[] {
    console.log('[PlatesEngine] Organizing topics from content');
    
    if (!content || typeof content !== 'string') {
        console.error('[PlatesEngine] Invalid content provided to organizeTopics');
        return [];
    }
    
    // Clean up the content first
    content = content.trim();
    
    // Remove any single character at beginning followed by whitespace
    content = content.replace(/^([a-zA-Z])\s+/, '');
    
    // Replace multiple consecutive line breaks with double line breaks
    content = content.replace(/\n{3,}/g, '\n\n');

    // Split by H3 headers (### Title) but keep the headers
    const topicPattern = /(?:^|\n)(?=### .+)/g;
    const sections = content.split(topicPattern);
    
    // Keep track of processed titles to avoid duplicates
    const processedTitles = new Set<string>();
    
    console.log(`[PlatesEngine] Found ${sections.length} raw sections`);
    
    return sections
        .map(section => {
            // Extract the title from the section (if it exists)
            const titleMatch = section.match(/^### (.*?)(?:\n|$)/);
            
            if (!titleMatch) {
                console.log('[PlatesEngine] Section without header found, skipping');
                return null;
            }
            
            const title = titleMatch[1].trim();
            const normalizedTitle = title.toLowerCase();
            
            // Skip duplicate titles (case insensitive)
            if (processedTitles.has(normalizedTitle)) {
                console.log(`[PlatesEngine] Duplicate title detected: ${title}, skipping`);
                return null;
            }
            
            processedTitles.add(normalizedTitle);
            
            // Get the content after the title
            let sectionContent = section.substring(titleMatch[0].length).trim();
            
            // Process quotes in the content (if any)
            // First handle custom quote format: <quote>text<source>source</source></quote>
            sectionContent = sectionContent.replace(
                /<quote>([\s\S]*?)<source>([\s\S]*?)<\/source><\/quote>/g,
                (_, quoteText, source) => {
                    return `<div class="quote-container">
                        <div class="quote-source">${source.trim()}</div>
                        <div class="quote-text">${quoteText.trim()}</div>
                    </div>`;
                }
            );
            
            // Handle blockquote format with > and optional [Source]
            sectionContent = sectionContent.replace(
                /(?:^|\n)>\s*([\s\S]*?)(?:\n\[([^\]]+)\])?(?=\n\n|\n[^>]|$)/g,
                (match, quoteText, source) => {
                    quoteText = quoteText.trim().replace(/\n>\s*/g, '\n');
                    
                    let quoteHtml = `<div class="quote-container">`;
                    
                    if (source) {
                        quoteHtml += `<div class="quote-source">${source.trim()}</div>`;
                    }
                    
                    quoteHtml += `<div class="quote-text">${quoteText}</div></div>`;
                    return quoteHtml;
                }
            );
            
            return {
                title,
                content: sectionContent
            };
        })
        .filter(section => section !== null) as TopicSection[];
}

// Generate content for user query
export async function generateContent(
    input: string,
    statusCallback: (status: string) => void
): Promise<string | TopicSection[]> {
    if (typeof window === 'undefined') {
        throw new Error('Must be run in browser context');
    }

    // Validate input
    if (!input?.trim()) {
        throw new Error('Empty input provided');
    }
    
    if (typeof statusCallback !== 'function') {
        statusCallback = (msg) => console.log('Status:', msg);
    }

    const trimmedInput = input.trim();
    const isMultiTopic = detectMultiTopicQuery(trimmedInput);
    const detectedLanguage = detectLanguage(trimmedInput);
    
    try {
        statusCallback('Searching for relevant information');
        
        const webResults = await searchAndFetchContent(trimmedInput, statusCallback);
        
        if (!webResults?.length) {
            throw new Error('No relevant information found');
        }

        // Debug quotes in search results
        console.log("Quotes in search results:", webResults.map(r => ({
            source: r.title,
            quoteCount: r.quotes.length,
            quotes: r.quotes
        })));

        // Create context from web results
        const webContext = webResults
            .map(result => {
                // Include all quotes from this source in a special format
                const quotesText = result.quotes.length > 0 ? 
                    "\nQUOTES FROM THIS SOURCE:\n" + 
                    result.quotes.map(q => `"${q.text}" [${q.source}${q.url ? ' ' + q.url : ''}]`).join("\n") : 
                    "";
                    
                return `SOURCE: "${result.title}" (${result.url})
CONTENT:
${result.content}${quotesText}
---\n`;
            })
            .join('\n');

        // Stronger instructions for quote formatting
        const promptBase = isMultiTopic ? 
            `You are a helpful AI assistant specializing in Islamic knowledge. The user has asked a question with multiple topics or aspects. Please respond in the same language as the input question.
            
For each topic or aspect of the question, create a dedicated section with a clear heading.

Context from Islamic sources:
${webContext}

Question: ${trimmedInput}

FORMATTING RULES:
1. Use ONLY information provided in the context above
2. If quoting directly, format EXACTLY as follows:
   - For Quran verses: {Verse text (Surah Al-Name 2:255)}
   - For hadiths: "Hadith text" [Sahih Bukhari 123]
   - Use the ACTUAL BOOK NAME as the source (e.g., Fatawa Islamiyah, Sahih Muslim, Bulugh al-Maram)
   - Do NOT cite scholars or narrators as sources - use the BOOK NAME instead
   - Always include the URL with quotes when available
3. Use markdown "### " (H3) format for EACH main section heading
4. Start with a "### Introduction" or "### Overview" section
5. When mentioning Islamic rulings like "it is haram/halal/permissible", use bold format like **this is haram**

CONTENT GUIDELINES:
1. Present multiple viewpoints when available
2. If context lacks clear evidence, acknowledge the limitations
3. Make each section comprehensive and able to stand alone
4. Elaborate in detail on each point with thorough explanations
5. Put relevant quotes in each section where appropriate
6. When mentioning a scholar, always include their FULL name with honorifics

Begin Response:` :
            `You are a helpful AI assistant specializing in Islamic knowledge. Please respond in the same language as the input question.

Context from Islamic sources:
${webContext}

Question: ${trimmedInput}

FORMATTING RULES:
1. Use ONLY information provided in the context above
2. If quoting directly, format EXACTLY as follows:
   - For Quran verses: {Verse text (Surah Al-Name 2:255)}
   - For hadiths: "Hadith text" [Sahih Bukhari 123]
   - Use the ACTUAL BOOK NAME as the source (e.g., Fatawa Islamiyah, Sahih Muslim, Bulugh al-Maram)
   - Do NOT cite scholars or narrators as sources - use the BOOK NAME instead
   - Always include the URL with quotes when available
3. Use markdown "### " (H3) format for ALL section headings
4. Start with a "### Introduction" or "### Overview" section
5. When mentioning Islamic rulings like "it is haram/halal/permissible", use bold format like **this is haram**

CONTENT GUIDELINES:
1. Present multiple viewpoints when available 
2. If context lacks clear evidence, acknowledge the limitations
3. Elaborate in detail with thorough explanations and examples
4. Put quotes in separate paragraphs with proper attribution
5. For Islamic rulings, clearly state the basis of the ruling
6. When mentioning a scholar, always include their FULL name with honorifics

Begin Response:`;

        statusCallback('Formulating detailed response...');
        const response = await generateWithGemini(promptBase, webResults);

        if (!response?.trim()) {
            throw new Error('Empty response received');
        }
        
        // Debug the response for quote patterns
        console.log("Response quotes check:", {
            hasStandardQuotes: (response.match(/"([^"]+)"\s*\[([^\]]+)\]/g) || []).length,
            hasCustomQuotes: (response.match(/<quote source="[^"]+">[^<]+<\/quote>/g) || []).length,
            sample: response.substring(0, 300) + "..."
        });
        
        // Count the number of H3 headings to determine if we need to process as multi-topic
        const h3Count = (response.match(/(?:^|\n)###\s+.+(?:\n|$)/g) || []).length;
        console.log(`Found ${h3Count} H3 headings in response`);
        
        // If response has H3 headings, always process it as multi-topic sections
        if (h3Count > 0) {
            console.log('Processing H3 sections from response');
            const sections = organizeTopics(response);
            if (!sections?.length) {
                throw new Error('Failed to organize response into sections');
            }
            return sections;
        }
        
        // If no H3 headings, return the original response
        return response;
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error details:', error);
        throw new Error(errorMessage);
    }
}

// For backward compatibility
export async function generateThoughts(input: string): Promise<void> {
    if (typeof window === 'undefined') {
        throw new Error('Must be run in browser context');
    }
    
    const resultElement = document.getElementById('result-text');
    
    try {
        if (!input.trim()) {
            alert('Please enter a question');
            return;
        }
        
        // Clear the result element during generation
        if (resultElement) {
            resultElement.innerHTML = '';
        }
        
        // Use a status container for generation progress
        const statusContainer = document.createElement('div');
        statusContainer.className = 'generation-indicator';
        document.body.appendChild(statusContainer);
        
        const response = await generateContent(
            input,
            (status) => {
                // Only update status container, not result element
                if (statusContainer) {
                    statusContainer.textContent = status;
                }
            }
        );
        
        // Remove the status container once generation is complete
        if (statusContainer && statusContainer.parentNode) {
            statusContainer.parentNode.removeChild(statusContainer);
        }
        
        // Display the final result
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
