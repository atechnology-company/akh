// there is too much input being put into the generator, so we need to reduce the input size please thanks
// also remember to swap model to phi 4 for multilingualism and better output quality and performance










import { pipeline, TextStreamer } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.0';

let generator; // Global generator variable, da?
let input = $('#prompt-input');

$(document).ready(function(){
    autosize(input);
    
    let transitioned = false;
    input.on('input', function(){
        let content = $.trim($(this).val());
        const tip = $('#typing-tip');
        const greeting = $('#greeting');
        
        if(content.length > 0) {
            tip.removeClass('hidden');
            $(this).addClass('modified');
            if(!transitioned){
                transitioned = true;
                greeting.addClass('hidden');
            }
        } else {
            tip.addClass('hidden');
            $(this).removeClass('modified');
            greeting.removeClass('hidden');
            transitioned = false;
        }
    });

    input.on('keyup', function(e){
        e = e || event;
        if (e.keyCode === 13 && !e.ctrlKey) {
            generateThoughts();
        }
        return true;
    });

    $('#input-page').addClass('active');
    $('#result-page').addClass('inactive');
});

// Initialize the pipeline and assign generator globally
async function initializePipeline() {
    const loadingOverlay = $('#loading-overlay');
    loadingOverlay.addClass('hidden');
    
    try {
        console.log('Generator is being initialized!');
        generator = await pipeline(
            "text-generation",
            "onnx-community/granite-3.0-2b-instruct", // higher quality model
            { dtype: "q4f16", device: 'webgpu' }
        );
        console.log('Generator initialized successfully!');
    } catch (error) {
        console.error('Factory failed to start:', error);
    } finally {
        if (loadingOverlay) {
            loadingOverlay.removeClass('hidden');
        }
    }
}

// Start factory when page loads
initializePipeline();

// Google Custom Search configuration
const GOOGLE_API_KEY = 'AIzaSyAhhqXAR-v2gJJorP6xKBywS6g0ia5L6V0';
const SEARCH_ENGINE_ID = '73957e2fdc3504b4c';

async function searchAndFetchContent(query) {
    try {
        const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`;
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();

        const webResults = [];
        const quoteRegex = /"([^"]+)"\s*[\[\(]([^\]\)]+)[\]\)]/g;  // regex to capture quote and source in either [source] or (source)

        for (let i = 0; i < Math.min(3, searchData.items.length); i++) {
            const item = searchData.items[i];

            try {
                const proxyUrl = `http://localhost:3000/proxy?url=${encodeURIComponent(item.link)}`;
                const response = await fetch(proxyUrl, {
                    method: 'GET',
                    retries: 3,
                    retryDelay: 1000
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const html = await response.text();
                const doc = new DOMParser().parseFromString(html, 'text/html');
                
                const content = doc.querySelector('.content')?.textContent?.trim();
                
                if (content) {
                    // Extract quotes with sources from content
                    const quotes = [];
                    let match;
                    while ((match = quoteRegex.exec(content)) !== null) {
                        quotes.push({
                            text: match[1],
                            source: match[2]
                        });
                    }
                    
                    webResults.push({
                        title: item.title,
                        content: content,
                        quotes: quotes,
                        url: item.link
                    });
                }
            } catch (error) {
                console.error(`Failed to fetch content from ${item.link}:`, error);
            }
        }

        // Return the array of results, not a formatted string
        return webResults;
    } catch (error) {
        console.error('Search failed:', error);
        return [];
    }
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
    resultElement.text('Searching for relevant information...');
    resultElement.addClass('thinking');

    $('#input-page').removeClass('active');
    $('#input-page').addClass('inactive');
    $('#result-page').removeClass('inactive');
    $('#result-page').addClass('active');

    try {
        const webResults = await searchAndFetchContent(trimmedInput);
        
        const systemPrompt = `You are a careful Islamic scholar following these STRICT rules:
        1. ONLY use information provided in the context below
        2. If quotes exist, they MUST be used exactly as provided with proper attribution
        3. If context lacks clear evidence, say "Sorry, this is beyond my knowledge. Please consult a scholar."
        4. NEVER invent or assume Islamic rulings
        5. NEVER add Quran verses or Hadith that weren't explicitly quoted
        6. If multiple scholarly opinions exist in the sources, present them all
        7. Clearly distinguish between:
           - Direct quotes from scholars (using quotation marks)
           - Summarized scholarly positions (citing source)
           - General guidance based on provided information
        8. Format response as:
           Evidence: (quotes from sources)
           Scholarly Positions: (summary of views)
           Guidance: (based strictly on above)`;

        // Prepare context from web results
        const webContext = webResults.map(result => 
            `Source: ${result.title}\n${result.content}\n---\n`
        ).join('\n');

        const summaryPrompt = "Carefully extract and organize the following Islamic information, maintaining exact quotes:\n" +
                              webContext +
                              "\nOrganized Summary:";

        console.log("Using summary prompt:", summaryPrompt);
        const summaryOutput = await generator(summaryPrompt, {
            max_new_tokens: 512,
            temperature: 0.7,
            do_sample: false,
            eos_token_id: generator.tokenizer.eos_token_id,
            repetition_penalty: 1.1
        });
        const summarisedContext = summaryOutput[0].generated_text;

        const streamer = new TextStreamer(generator.tokenizer, {
            skip_prompt: true,
        });

        const finalPrompt = `${systemPrompt}

        Context:
        ${summarisedContext}

        Question: ${trimmedInput}

        Remember: Only use information from the context above. If insufficient evidence exists, acknowledge the limitations.`;

        console.log("Using input string:", finalPrompt);
        console.log('Generating output!');
        
        const output = await generator(finalPrompt, {
            max_new_tokens: 2048,
            temperature: 0.7,
            do_sample: false,
            eos_token_id: generator.tokenizer.eos_token_id,
            repetition_penalty: 1.1,
            streamer
        });
        
        resultElement.removeClass('thinking');
        resultElement.text(output[0].generated_text);
    } catch (error) {
        resultElement.removeClass('thinking');
        resultElement.text('Error occurred in thinking machine: ' + error.message);
        console.error('Error details:', error);
    }
}

(function() {
    const lang = navigator.language.split('-')[0] || 'en';
    fetch('translations.json')
      .then(response => response.json())
      .then(translations => {
          // Update greeting header
          const greetingElem = document.getElementById('greeting');
          if (translations.assalamualaikum && translations.assalamualaikum[lang]) {
            greetingElem.textContent = translations.assalamualaikum[lang];
          } else {
            greetingElem.textContent = translations.assalamualaikum.en;
          }
          // Update input placeholder
          const promptInput = document.getElementById('prompt-input');
          if (translations.learn_today && translations.learn_today[lang]) {
            promptInput.setAttribute('placeholder', translations.learn_today[lang]);
          } else {
            promptInput.setAttribute('placeholder', translations.learn_today.en);
          }
      })
      .catch(error => {
          console.error('Error loading translations:', error);
      });
})();

export { generateThoughts };