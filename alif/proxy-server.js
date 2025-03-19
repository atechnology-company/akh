const express = require('express');
const cors = require('cors');
const axios = require('axios');
const he = require('he');
const app = express();
const port = 3000;

// Middleware
app.use(cors({
    origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
    methods: ['GET', 'POST']
}));
app.use(express.json());

// Expanded list of allowed domains
const allowedDomains = [
    'islamqa.info',
    'islamweb.net',
    'en.wikipedia.org',
    'generativelanguage.googleapis.com',
];

// URL validation helper
function isValidUrl(urlString) {
    try {
        const decoded = decodeURIComponent(urlString);
        const url = new URL(decoded);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

// Proxy endpoint for GET requests
app.get('/proxy', async (req, res) => {
    const url = req.query.url;

    if (!url) {
        return res.status(400).send('URL parameter is required');
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();
        }, 10000);

        const decodedUrl = decodeURIComponent(url);
        if (!isValidUrl(decodedUrl)) {
            return res.status(400).send('Invalid URL format');
        }

        const urlObj = new URL(decodedUrl);
        const isAllowed = allowedDomains.some(domain => urlObj.hostname.includes(domain));

        if (!isAllowed) {
            return res.status(403).send(`Domain ${urlObj.hostname} not in allowlist`);
        }

        const response = await axios.get(decodedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
                'Accept-Charset': 'utf-8, iso-8859-1;q=0.5, *;q=0.1',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            timeout: 10000,
            maxRedirects: 5,
            responseType: 'arraybuffer',
            validateStatus: status => status < 500,
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (response.status !== 200) {
            throw new Error(`Target server returned status ${response.status}`);
        }

        const contentType = response.headers['content-type'];
        const encoding = contentType && contentType.includes('charset=') 
            ? contentType.split('charset=')[1] 
            : 'utf-8';

        const html = new TextDecoder(encoding).decode(response.data);

        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET');
        res.header('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error) {
        console.error('Proxy error:', {
            url: url,
            message: error.message,
            code: error.code,
            stack: error.stack
        });

        const errorMessage = error.name === 'AbortError' 
            ? 'Request timed out'
            : error.response 
                ? `Error: ${error.response.status} - ${error.response.statusText}`
                : error.message;

        res.status(error.name === 'AbortError' ? 504 : 500).send(he.encode(errorMessage));
    }
});

// Proxy endpoint for POST requests to Gemini API
app.post('/gemini', async (req, res) => {
    try {
        const { apiKey, prompt, temperature = 0.7, topK = 40, topP = 0.8, maxOutputTokens = 2048 } = req.body;

        // Validate required parameters
        if (!apiKey) {
            return res.status(400).json({ error: 'API key is required' });
        }
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        // Validate parameter ranges
        if (temperature < 0 || temperature > 1) {
            return res.status(400).json({ error: 'Temperature must be between 0 and 1' });
        }
        if (topP < 0 || topP > 1) {
            return res.status(400).json({ error: 'Top P must be between 0 and 1' });
        }
        if (topK < 1 || topK > 100) {
            return res.status(400).json({ error: 'Top K must be between 1 and 100' });
        }
        if (maxOutputTokens < 1 || maxOutputTokens > 8192) {
            return res.status(400).json({ error: 'Max output tokens must be between 1 and 8192' });
        }

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature,
                    topK,
                    topP,
                    maxOutputTokens,
                    stopSequences: []
                },
                safetySettings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_ONLY_HIGH"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_ONLY_HIGH"
                    }
                ]
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        const data = response.data;

        // Validate response structure
        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error('Invalid response format from Gemini API');
        }

        res.json({ 
            text: data.candidates[0].content.parts[0].text,
            usage: data.usage || {}
        });
    } catch (error) {
        console.error('Gemini API error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ 
            error: error.response?.data?.error?.message || error.message || 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Proxy server running at http://localhost:${port}`);
});
