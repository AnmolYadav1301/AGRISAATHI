// $(document).ready(function() {
//   // Load default section
//   loadSection('home');

//   // Handle navbar clicks
//   $('.nav-link').click(function(e) {
//     e.preventDefault();
//     const section = $(this).data('section');
//     loadSection(section);
//   });

//   // Function to load page content dynamically
//   function loadSection(section) {
//     let html = '';

//     if (section === 'home') {
//       html = `
//         <h2>Welcome to Farmer Help!</h2>
//         <p>Get weather updates, crop advice, and market rates to make smart farming decisions.</p>
//         <button onclick="alert('Feature coming soon!')">Get Started</button>
//       `;
//     }

//     else if (section === 'weather') {
//       html = `
//         <h2>🌦 Weather Updates</h2>
//         <p>Enter your location to check the latest weather data.</p>
//         <input type="text" id="location" placeholder="Enter location" />
//         <button id="getWeather">Check Weather</button>
//         <div id="weatherResult" style="margin-top:1rem;"></div>
//       `;
//     }

//     else if (section === 'market') {
//       html = `
//         <h2>💹 Market Rates</h2>
//         <p>Get current crop prices from nearby markets (API integration coming soon).</p>
//       `;
//     }

//     else if (section === 'advice') {
//       html = `
//         <h2>🌱 Farming Tips</h2>
//         <ul>
//           <li>Use organic fertilizers to maintain soil health.</li>
//           <li>Monitor local weather before sowing seeds.</li>
//           <li>Adopt drip irrigation to save water.</li>
//         </ul>
//       `;
//     }

//     $('#content').html(html);
//   }

//   // Weather button click
//   $(document).on('click', '#getWeather', function() {
//     const loc = $('#location').val();
//     if (!loc) {
//       alert('Please enter a location.');
//       return;
//     }
//     $('#weatherResult').html(`<em>Fetching weather for ${loc}...</em>`);

//     // Here we’ll integrate Google or OpenWeather API later
//     setTimeout(() => {
//       $('#weatherResult').html(`<b>Weather in ${loc}:</b> Sunny, 28°C ☀️`);
//     }, 1000);
//   });
// });



       // --- API CONFIGURATION AND UTILITIES ---

        const API_KEY = ""; // Provided by the Canvas environment
        const TEXT_MODEL = 'gemini-2.5-flash-preview-05-20';
        const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
        let currentState = {
            chatHistory: [],
            isLoading: false,
            isSpeaking: false,
            currentLanguage: { code: 'en', name: 'English', voice: 'Achird' }
        };

        const LANGUAGES = [
            { code: 'en', name: 'English', voice: 'Achird' },
            { code: 'hi', name: 'हिन्दी', voice: 'Gacrux' },
            { code: 'mr', name: 'मराठी', voice: 'Umbriel' },
            { code: 'ta', name: 'தமிழ்', voice: 'Despina' },
        ];

        const INITIAL_NEWS = [
            { title: "PM launches 'PM Dhan Dhaanya Krishi Yojana' and 'Mission for Aatmanirbharta in Pulses'", snippet: "Two major schemes with a combined outlay of over ₹35,000 crore launched to boost productivity and reduce dependency on pulse imports. Focus is on 100 low-performing agricultural districts.", date: "Oct 11, 2025" },
            { title: "Kharif Sowing Acreage Crosses Normal Area, Oilseeds Decline a Concern", snippet: "Total Kharif crops reached 1,121.5 lakh hectares, exceeding the normal area. Reservoir storage levels are 115% of the ten-year average, favorable for the upcoming Rabi season. Oilseed acreage, however, decreased by 5.5%.", date: "Oct 13, 2025" },
            { title: "ICAR Shortlists 23 New Wheat Varieties for Commercial Release", snippet: "The Indian Council of Agricultural Research (ICAR) approved new wheat and barley varieties ahead of the Rabi sowing season to improve resilience and yield.", date: "Oct 13, 2025" },
        ];

        const INITIAL_MANDI = [
            { crop: "Wheat (Gehu)", market: "Ashoknagar (MP)", modalPrice: "₹ 2735 / Quintal", trend: "Stable" },
            { crop: "Wheat (Gehu)", market: "Udaipur (Rajasthan)", modalPrice: "₹ 3300 / Quintal", trend: "High" },
            { crop: "Wheat (Gehu)", market: "Kota (Rajasthan)", modalPrice: "₹ 2550 / Quintal", trend: "Stable" },
            { crop: "Rice (Chawal)", market: "Average India", modalPrice: "₹ 3200 / Quintal", trend: "Rising" },
        ];

        // Helper function to handle exponential backoff for API calls
        const fetchWithRetry = async (url, options, maxRetries = 3) => {
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    const response = await fetch(url, options);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response;
                } catch (error) {
                    console.error(`Attempt ${attempt + 1} failed:`, error.message);
                    if (attempt === maxRetries - 1) throw error;
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
                }
            }
        };

        // Converts Base64 string to ArrayBuffer (for audio data)
        const base64ToArrayBuffer = (base64) => {
            const binaryString = atob(base64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
        };

        // Converts signed 16-bit PCM ArrayBuffer data to a WAV Blob
        const pcmToWav = (pcmData, sampleRate = 24000) => {
            const numChannels = 1;
            const bitsPerSample = 16;
            const blockAlign = numChannels * (bitsPerSample / 8);
            const byteRate = sampleRate * blockAlign;
            const dataLength = pcmData.byteLength;
            const fileLength = 44 + dataLength;

            const buffer = new ArrayBuffer(fileLength);
            const view = new DataView(buffer);
            const pcmView = new Int16Array(pcmData);

            let offset = 0;

            // RIFF header
            view.setUint32(offset, 0x52494646, false); offset += 4; // "RIFF"
            view.setUint32(offset, fileLength - 8, true); offset += 4; // file length
            view.setUint32(offset, 0x57415645, false); offset += 4; // "WAVE"

            // fmt chunk
            view.setUint32(offset, 0x666d7420, false); offset += 4; // "fmt "
            view.setUint32(offset, 16, true); offset += 4; // chunk size
            view.setUint16(offset, 1, true); offset += 2; // compression code (1 for PCM)
            view.setUint16(offset, numChannels, true); offset += 2; // number of channels
            view.setUint32(offset, sampleRate, true); offset += 4; // sample rate
            view.setUint32(offset, byteRate, true); offset += 4; // byte rate
            view.setUint16(offset, blockAlign, true); offset += 2; // block align
            view.setUint16(offset, bitsPerSample, true); offset += 2; // bits per sample

            // data chunk
            view.setUint32(offset, 0x64617461, false); offset += 4; // "data"
            view.setUint32(offset, dataLength, true); offset += 4; // data length
            
            // Write PCM data
            for (let i = 0; i < pcmView.length; i++) {
                view.setInt16(offset, pcmView[i], true);
                offset += 2;
            }

            return new Blob([view], { type: 'audio/wav' });
        };

        // Fetches a text response from Gemini (with Google Search Grounding)
        const fetchGeminiResponse = async (query, language) => {
            const systemPrompt = `You are a knowledgeable and helpful agricultural expert and farming assistant (Kisan Sahayak). Respond to the user's query in ${language}. Provide clear, actionable advice regarding crops, diseases, fertilizers, and market rates. Always cite your sources if using real-time information.`;
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${API_KEY}`;
            
            const payload = {
                contents: [{ parts: [{ text: query }] }],
                tools: [{ "google_search": {} }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
            };

            try {
                const response = await fetchWithRetry(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                const candidate = result.candidates?.[0];

                if (candidate && candidate.content?.parts?.[0]?.text) {
                    const text = candidate.content.parts[0].text;
                    let sources = [];
                    const groundingMetadata = candidate.groundingMetadata;
                    if (groundingMetadata && groundingMetadata.groundingAttributions) {
                        sources = groundingMetadata.groundingAttributions
                            .map(attribution => ({ uri: attribution.web?.uri, title: attribution.web?.title }))
                            .filter(source => source.uri && source.title);
                    }
                    return { text, sources };
                }
                return { text: "Sorry, I couldn't generate a response. Please try again.", sources: [] };

            } catch (e) {
                console.error("Gemini Chat API Error:", e);
                return { text: "Error connecting to the agricultural advisory service. Please check your network.", sources: [] };
            }
        };

        // Fetches TTS audio data
        const fetchTTSAudio = async (text, voice) => {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${API_KEY}`;
            
            const payload = {
                contents: [{ parts: [{ text: text }] }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: voice }
                        }
                    }
                },
                model: TTS_MODEL
            };

            try {
                const response = await fetchWithRetry(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                const part = result?.candidates?.[0]?.content?.parts?.[0];
                const audioData = part?.inlineData?.data;

                if (audioData) {
                    const pcmData = base64ToArrayBuffer(audioData);
                    const wavBlob = pcmToWav(pcmData);
                    return URL.createObjectURL(wavBlob);
                }
                return null;
            } catch (e) {
                console.error("TTS API Error:", e);
                return null;
            }
        };

        // --- RENDERING FUNCTIONS (using jQuery) ---

        const renderChatHistory = () => {
            const $history = $('#chat-history');
            $history.empty();
            const $messagesContainer = $('<div></div>').addClass('space-y-4');

            if (currentState.chatHistory.length === 0) {
                $history.append(`
                    <div class="text-center text-gray-500 pt-10">
                        <i data-lucide="zap" class="w-8 h-8 mx-auto text-green-400 mb-2"></i>
                        <p>Ask me anything about crops, pests, fertilizers, or market prices in your local language!</p>
                        <p class="text-xs mt-1">Example: "मेरे खेत में गेहूँ की फसल पीली पड़ रही है, क्या करूँ?"</p>
                    </div>
                `);
            } else {
                currentState.chatHistory.forEach((msg, index) => {
                    const isUser = msg.isUser;
                    const alignment = isUser ? 'justify-end' : 'justify-start';
                    const bubbleClasses = isUser ? 'bg-green-600 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-tl-none';
                    const messageId = msg.id || index;

                    const $msgDiv = $(`<div class="flex w-full ${alignment} mb-4"></div>`);
                    const $bubble = $(`<div class="max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-2xl shadow-lg ${bubbleClasses}"></div>`);
                    $bubble.append(`<p class="text-sm whitespace-pre-wrap">${msg.text}</p>`);

                    if (!isUser && msg.text) {
                        const $listenButton = $(`
                            <button data-msg-id="${messageId}" data-msg-text="${msg.text.replace(/"/g, '&quot;')}" class="tts-button mt-2 text-xs font-semibold flex items-center text-green-800 hover:text-green-900 bg-white/70 px-2 py-1 rounded-full disabled:opacity-50 transition">
                                <i data-lucide="mic" class="w-3 h-3 mr-1"></i>
                                <span>Listen (TTS)</span>
                            </button>
                        `);
                        $bubble.append($listenButton);
                    }

                    if (msg.sources.length > 0) {
                        let $sourcesDiv = $(`<div class="mt-2 pt-2 border-t border-gray-300 text-[10px] text-gray-600"></div>`);
                        $sourcesDiv.append(`<p class="font-semibold">Sources:</p>`);
                        msg.sources.forEach((src, idx) => {
                            $sourcesDiv.append(`
                                <a href="${src.uri}" target="_blank" rel="noopener noreferrer" class="block truncate hover:underline">
                                    ${idx + 1}. ${src.title}
                                </a>
                            `);
                        });
                        $bubble.append($sourcesDiv);
                    }

                    $msgDiv.append($bubble);
                    $messagesContainer.append($msgDiv);
                });

                if (currentState.isLoading) {
                    $messagesContainer.append(`
                        <div class="flex justify-start">
                            <div class="bg-gray-100 p-3 rounded-2xl rounded-tl-none shadow-lg">
                                <div class="flex space-x-1">
                                    <span class="animate-bounce h-2 w-2 bg-green-500 rounded-full" style="animation-delay: 0s;"></span>
                                    <span class="animate-bounce h-2 w-2 bg-green-500 rounded-full" style="animation-delay: 0.2s;"></span>
                                    <span class="animate-bounce h-2 w-2 bg-green-500 rounded-full" style="animation-delay: 0.4s;"></span>
                                </div>
                            </div>
                        </div>
                    `);
                }

                $history.append($messagesContainer);
            }
            
            // Re-initialize Lucide icons for dynamically added elements
            if (typeof createIcons !== 'undefined') {
                createIcons({ icons });
            }
            // Scroll to bottom
            $history.scrollTop($history.prop("scrollHeight"));
        };

        const renderNews = () => {
            const $newsList = $('#news-list');
            $newsList.empty();
            INITIAL_NEWS.forEach((news) => {
                const newsHtml = `
                    <div class="p-4 bg-white/50 backdrop-blur-sm rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition duration-300">
                        <div class="flex justify-between items-center text-xs text-gray-500 mb-2">
                            <span class="flex items-center"><i data-lucide="book-open" class="w-3 h-3 mr-1"></i> AGRICULTURE</span>
                            <span>${news.date}</span>
                        </div>
                        <h3 class="text-lg font-bold text-green-800 mb-1">${news.title}</h3>
                        <p class="text-sm text-gray-700">${news.snippet}</p>
                    </div>
                `;
                $newsList.append(newsHtml);
            });
             if (typeof createIcons !== 'undefined') {
                createIcons({ icons });
            }
        };

        const renderMandi = () => {
            const $mandiList = $('#mandi-list');
            $mandiList.empty();
            INITIAL_MANDI.forEach((item) => {
                const trendColor = item.trend === 'Rising' ? 'text-red-500' : 'text-green-500';
                const [price, unit] = item.modalPrice.split('/');
                const mandiHtml = `
                    <div class="p-4 bg-white/60 backdrop-blur-sm rounded-xl shadow-md border border-green-100 flex justify-between items-center transition hover:bg-green-50">
                        <div>
                            <p class="text-sm font-medium text-gray-500">${item.market}</p>
                            <h3 class="text-xl font-extrabold text-green-700">${item.crop}</h3>
                        </div>
                        <div class="text-right">
                            <p class="text-2xl font-black text-green-900">${price.trim()}</p>
                            <p class="text-sm text-gray-600">${unit.trim()} <span class="font-semibold ${trendColor}">(${item.trend})</span></p>
                        </div>
                    </div>
                `;
                $mandiList.append(mandiHtml);
            });

            // Render Weather Advisory
            $('#weather-advisory').html(`
                <p class="font-semibold text-green-800">Weather Advisory (उदाहरण)</p>
                <p class="text-sm text-green-700 mt-1 flex items-center">
                    <i data-lucide="sun" class="w-4 h-4 mr-1 text-yellow-500"></i>
                    Current Outlook: Mild temperatures, clear skies. Best time for Rabi crop sowing in Northern regions. Reservoir levels are high.
                </p>
            `);
             if (typeof createIcons !== 'undefined') {
                createIcons({ icons });
            }
        };
        
        const updateLanguageSelector = () => {
            const $select = $('#language-select');
            $select.empty();
            LANGUAGES.forEach(lang => {
                $select.append(`<option value="${lang.code}" data-voice="${lang.voice}">${lang.name}</option>`);
            });
            $select.val(currentState.currentLanguage.code);
            $('#chat-input').attr('placeholder', `Type your question in ${currentState.currentLanguage.name}...`);
        };

        // --- STATE AND EVENT HANDLERS ---
        
        const setAppState = (newState) => {
            Object.assign(currentState, newState);
            renderChatHistory();
            
            // Update UI based on loading state
            const isLoading = currentState.isLoading;
            $('#send-button').prop('disabled', isLoading || !$('#chat-input').val().trim());
            $('#chat-input').prop('disabled', isLoading);
            $('#language-select').prop('disabled', isLoading);
        };
        
        const handleLanguageChange = (e) => {
            const code = $(e.target).val();
            const selected = LANGUAGES.find(lang => lang.code === code);
            if (selected) {
                setAppState({ currentLanguage: selected });
                $('#chat-input').attr('placeholder', `Type your question in ${selected.name}...`);
            }
        };

        const handleChatSubmit = async (e) => {
            e.preventDefault();
            const userMessage = $('#chat-input').val().trim();
            if (!userMessage || currentState.isLoading) return;

            $('#chat-input').val('');
            setAppState({ 
                isLoading: true,
                chatHistory: [...currentState.chatHistory, { text: userMessage, isUser: true, sources: [], id: Date.now() }]
            });

            // Fetch response from Gemini
            const query = `Translate the following query to the target language (if needed) and then answer it as an agricultural expert. Query: "${userMessage}"`;
            const result = await fetchGeminiResponse(query, currentState.currentLanguage.name);

            // Add AI response to history
            setAppState({ 
                isLoading: false,
                chatHistory: [...currentState.chatHistory, { text: result.text, isUser: false, sources: result.sources, id: Date.now() }]
            });
        };

        const handleSpeech = async (text, button) => {
            if (currentState.isSpeaking) return;
            setAppState({ isSpeaking: true });
            
            // UI Feedback for speaking
            const $button = $(button);
            $button.prop('disabled', true);
            $button.find('i[data-lucide="mic"]').attr('data-lucide', 'refresh-cw').addClass('animate-spin');
            $button.find('span').text('Speaking...');
            
            // Fetch TTS audio
            const voice = currentState.currentLanguage.voice;
            const audioUrl = await fetchTTSAudio(text, voice);

            if (audioUrl) {
                const audio = new Audio(audioUrl);
                audio.onended = () => {
                    setAppState({ isSpeaking: false });
                    $button.find('i[data-lucide="refresh-cw"]').attr('data-lucide', 'mic').removeClass('animate-spin');
                    $button.find('span').text('Listen (TTS)');
                    $button.prop('disabled', false);
                    URL.revokeObjectURL(audioUrl);
                };
                audio.onerror = () => {
                    setAppState({ isSpeaking: false });
                    alert('Error playing audio. The TTS model might not support the complexity or length of the response in this language.');
                    $button.find('i[data-lucide="refresh-cw"]').attr('data-lucide', 'mic').removeClass('animate-spin');
                    $button.find('span').text('Listen (TTS)');
                    $button.prop('disabled', false);
                    URL.revokeObjectURL(audioUrl);
                };
                audio.play().catch(e => {
                    console.error("Audio playback failed:", e);
                    setAppState({ isSpeaking: false });
                    $button.find('i[data-lucide="refresh-cw"]').attr('data-lucide', 'mic').removeClass('animate-spin');
                    $button.find('span').text('Listen (TTS)');
                    $button.prop('disabled', false);
                });
            } else {
                setAppState({ isSpeaking: false });
                alert('Failed to generate audio response.');
                $button.find('i[data-lucide="refresh-cw"]').attr('data-lucide', 'mic').removeClass('animate-spin');
                $button.find('span').text('Listen (TTS)');
                $button.prop('disabled', false);
            }
        };

        const handleTabClick = (e) => {
            const newTab = $(e.currentTarget).data('tab');
            $('.tab-content').addClass('hidden');
            $(`#${newTab}`).removeClass('hidden');

            $('.tab-button').removeClass('active text-green-800 bg-white border-t-4 border-green-600').addClass('text-gray-500 hover:text-green-600');
            $(e.currentTarget).addClass('active text-green-800 bg-white border-t-4 border-green-600').removeClass('text-gray-500 hover:text-green-600');
            
            // Scroll to bottom when switching back to chat
            if (newTab === 'Chat') {
                $('#chat-history').scrollTop($('#chat-history').prop("scrollHeight"));
            }
        };

        const setupEventListeners = () => {
            $('#tab-nav').on('click', '.tab-button', handleTabClick);
            $('#language-select').on('change', handleLanguageChange);
            $('#chat-form').on('submit', handleChatSubmit);
            
            // TTS button listener (delegated)
            $('#chat-history').on('click', '.tts-button', function() {
                const text = $(this).data('msg-text');
                handleSpeech(text, this);
            });
            
            // Enable send button only when input is present
            $('#chat-input').on('input', function() {
                const inputVal = $(this).val().trim();
                $('#send-button').prop('disabled', inputVal.length === 0 || currentState.isLoading);
            });
        };

        const initializeApp = () => {
            updateLanguageSelector();
            renderNews();
            renderMandi();
            renderChatHistory();
            setupEventListeners();
            
            // Initial placeholder for chat
            if (currentState.chatHistory.length === 0) {
                 renderChatHistory();
            }
        };

        $(document).ready(initializeApp);