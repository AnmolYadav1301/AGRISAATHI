
        let currentState = {
            chatHistory: [],
            isLoading: false,
            isSpeaking: false,
            currentLanguage: { code: 'en', name: 'English', voice: 'Achird' }
        };
        let currentAudio = null;

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
        // Fetches a text response from your backend (which calls Gemini securely)
        const fetchGeminiResponse = async (query, language) => {
            const payload = { query, language };

            try {
                const response = await fetch("http://localhost:5000/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ query, language }),
                });

                const result = await response.json();
                 // Gemini’s output is inside result.candidates[0].content.parts[0].text
                const candidate = result.candidates?.[0];
                if (candidate && candidate.content?.parts?.[0]?.text) {
                const text = candidate.content.parts[0].text;
                return { text, sources: [] };
                }

                return {
                text: "Sorry, I couldn't generate a response. Please try again.",
                sources: [],
                };
            } catch (e) {
                console.error("Gemini Chat API Error:", e);
                return {
                text: "Error connecting to the agricultural advisory service. Please check your network.",
                sources: [],
                };
            }
            };
        
        // Fetches TTS audio from your backend (which calls Gemini securely)
        const fetchTTSAudio = async (text, voice) => {
            const payload = { text, voice };

            try {
                const response = await fetch("http://localhost:5000/api/tts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    throw new Error("TTS backend error");
                }

                // The backend will return base64-encoded audio
                const result = await response.json();
                const audioBase64 = result.audio;

                if (audioBase64) {
                    const pcmData = base64ToArrayBuffer(audioBase64);
                    const wavBlob = pcmToWav(pcmData);
                    return URL.createObjectURL(wavBlob);
                }

                return null;
            } catch (e) {
                console.error("TTS Fetch Error:", e);
                return null;
            }
        };

        const playAudio = (audioUrl) => {
            const stopBtn = document.getElementById("stopAudioBtn");

            // Stop any previous audio
            if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
            }

            // Create new audio and play
            currentAudio = new Audio(audioUrl);
            currentAudio.play();

            // Show stop button while playing
            stopBtn.style.display = "inline-block";

            // Hide when playback ends
            currentAudio.addEventListener("ended", () => {
                stopBtn.style.display = "none";
            });

            // Also hide if playback is manually stopped
            currentAudio.addEventListener("pause", () => {
                if (currentAudio.currentTime < currentAudio.duration) {
                    stopBtn.style.display = "none";
                }
            });
        };

// stop button handler
        document.getElementById("stopAudioBtn").addEventListener("click", () => {
            if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
            }
            //hiding stop button
            document.getElementById("stopAudioBtn").style.display = "none";

            // ✅ Reset UI and state so "Listen (TTS)" works again
            setAppState({ isSpeaking: false });
            const $button = $(".tts-btn"); // or your specific selector
            $button.find('i[data-lucide="refresh-cw"]').attr('data-lucide', 'mic').removeClass('animate-spin');
            $button.find('span').text('Listen (TTS)');
            $button.prop('disabled', false);
        });

        // for handling the translator tab
        document.getElementById("translateBtn").addEventListener("click", async () => {
        const text = document.getElementById("textToTranslate").value.trim();
        const lang = document.getElementById("targetLang").value;
        const outputDiv = document.getElementById("translatedOutput");

        if (!text) {
            outputDiv.innerText = "⚠️ Please enter text.";
            return;
        }

        outputDiv.innerText = "Translating...";

        try {
            const response = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, targetLang: lang }),
            });
            const data = await response.json();
            outputDiv.innerText = data.translatedText || "❌ Translation failed.";
        } catch (err) {
            outputDiv.innerText = "❌ Error connecting to translator.";
        }
        });


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

        //for handling audio play part
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
                // Stop any previously playing audio
                if (currentAudio) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                }

                // Create new Audio object
                currentAudio = new Audio(audioUrl);

                // Show Stop button while playing
                const stopBtn = document.getElementById("stopAudioBtn");
                stopBtn.style.display = "inline-block";

                currentAudio.onended = () => {
                    setAppState({ isSpeaking: false });
                    $button.find('i[data-lucide="refresh-cw"]').attr('data-lucide', 'mic').removeClass('animate-spin');
                    $button.find('span').text('Listen (TTS)');
                    $button.prop('disabled', false);
                    stopBtn.style.display = "none";
                    URL.revokeObjectURL(audioUrl);
                };

                currentAudio.onerror = () => {
                    setAppState({ isSpeaking: false });
                    alert('Error playing audio. The TTS model might not support the complexity or length of the response in this language.');
                    $button.find('i[data-lucide="refresh-cw"]').attr('data-lucide', 'mic').removeClass('animate-spin');
                    $button.find('span').text('Listen (TTS)');
                    $button.prop('disabled', false);
                    stopBtn.style.display = "none";
                    URL.revokeObjectURL(audioUrl);
                };

                currentAudio.play().catch(e => {
                    console.error("Audio playback failed:", e);
                    setAppState({ isSpeaking: false });
                    $button.find('i[data-lucide="refresh-cw"]').attr('data-lucide', 'mic').removeClass('animate-spin');
                    $button.find('span').text('Listen (TTS)');
                    $button.prop('disabled', false);
                    stopBtn.style.display = "none";
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

        // 🟢 Fetch and render mandi prices
const renderMandi = async () => {
  const commodity = document.getElementById("commodityInput").value.trim() || "Tomato";
  const state = document.getElementById("stateInput").value.trim() || "Punjab";
  const mandiResults = document.getElementById("mandiResults");

  mandiResults.innerHTML = `<p class="text-gray-500">Fetching latest prices...</p>`;

  try {
       const response = await fetch(
      `http://localhost:5000/api/mandi-prices?commodity=${encodeURIComponent(commodity)}&state=${encodeURIComponent(state)}`
    );

    const data = await response.json();

    if (!data || !data.data || data.data.length === 0) {
      mandiResults.innerHTML = `<p class="text-red-500">No price data available right now.</p>`;
      return;
    }

    // Filter results (optional)
    const filtered = data.data.filter(item =>
      item.commodity.toLowerCase().includes(commodity.toLowerCase()) &&
      item.state.toLowerCase().includes(state.toLowerCase())
    );

    if (filtered.length === 0) {
      mandiResults.innerHTML = `<p class="text-yellow-600">No results found for "${commodity}" in "${state}".</p>`;
      return;
    }

    // Render table
    const tableHTML = `
      <table class="min-w-full bg-white border border-gray-200 rounded-xl shadow-sm">
        <thead class="bg-green-100">
          <tr>
            <th class="px-4 py-2 border">Date</th>
            <th class="px-4 py-2 border">State</th>
            <th class="px-4 py-2 border">Market</th>
            <th class="px-4 py-2 border">Commodity</th>
            <th class="px-4 py-2 border">Min Price</th>
            <th class="px-4 py-2 border">Modal Price</th>
            <th class="px-4 py-2 border">Max Price</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(item => `
            <tr class="text-center border-t hover:bg-green-50">
              <td class="px-4 py-2">${item.date}</td>
              <td class="px-4 py-2">${item.state}</td>
              <td class="px-4 py-2">${item.market}</td>
              <td class="px-4 py-2">${item.commodity}</td>
              <td class="px-4 py-2">${item.min_price}</td>
              <td class="px-4 py-2">${item.modal_price}</td>
              <td class="px-4 py-2">${item.max_price}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    mandiResults.innerHTML = tableHTML;

  } catch (err) {
    console.error("Error fetching mandi data:", err);
    mandiResults.innerHTML = `<p class="text-red-500">Failed to load mandi prices. Try again later.</p>`;
  }
};

// 🟢 Fetch button event
document.getElementById("fetchMandiBtn").addEventListener("click", renderMandi);


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