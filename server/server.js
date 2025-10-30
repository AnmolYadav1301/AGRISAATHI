import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import path from "path"; // ⚡ added for serving static files
import { fileURLToPath } from "url"; // ⚡ needed for __dirname
import mandiPricesRoute from "./routes/mandiPrices.js";//for using mandiPrices file



dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/mandi-prices", mandiPricesRoute);
const GEMINI_TEXT = "gemini-2.5-flash-preview-05-20";
const GEMINI_TTS = "gemini-2.5-flash-preview-tts";
const API_KEY = process.env.GEMINI_API_KEY;

// ⚡ Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ⚡ Serve static frontend (assuming ../client contains index.html)
app.use(express.static(path.join(__dirname, "../client")));

// ⚡ Default route for browser
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});


// Text generation route
app.post("/api/chat", async (req, res) => {
  const { query, language } = req.body;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT}:generateContent?key=${API_KEY}`,
      {
        contents: [{ parts: [{ text: query }] }],
        tools: [{ google_search: {} }],
        systemInstruction: {
          parts: [
            {
              text: `You are Kisan Sahayak, a helpful agricultural assistant. Reply in ${language}.`,
            },
          ],
        },
      }
    );

    //  Correct: log the actual Gemini response
    console.log("Gemini raw response:", JSON.stringify(response.data, null, 2));

    // Return Gemini’s output to frontend
    res.json(response.data);

  } catch (error) {
    console.error(" Chat API Error:", error.message);
    if (error.response?.data) {
      console.error("API Error Details:", error.response.data);
    }
    res.status(500).json({ error: "Failed to fetch response" });
  }
});

//  TTS route
app.post("/api/tts", async (req, res) => {
  const { text, voice } = req.body;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS}:generateContent?key=${API_KEY}`,
      {
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice || "en-US-Neural2-A" },
            },
          },
        },
      }
    );

    // Extract base64 audio safely
    const audioBase64 =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!audioBase64) {
      console.error("❌ No audio data returned:", response.data);
      return res.status(500).json({ error: "No audio data from Gemini TTS" });
    }

    // Return proper JSON with base64 audio
    res.json({ audio: audioBase64 });
  } catch (err) {
    console.error("TTS backend error:", err.message);
    res.status(500).json({ error: "TTS generation failed" });
  }
});



// ⚡ Default port fallback
const PORT = process.env.PORT || 5000;

// ✅ Start server
app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
