// 1. Force Node.js to resolve MongoDB Atlas DNS using public lookup servers
import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']); 

// 2. Structural imports
import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import cors from 'cors';
import mongoose from 'mongoose';
import { User, Session } from './user';

// Explicitly load .env from the current server directory
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT: number = Number(process.env.PORT) || 5000;
const MONGO_URI = process.env.MONGO_URI || '';

// Middleware
app.use(cors());
app.use(express.json());

// Basic test route
app.get('/', (req: Request, res: Response) => {
  res.send('AI Interview Coach API (OpenRouter + Drive) is running...');
});

// ==========================================
// Database Session Routes
// ==========================================

// 1. Save or Update an interview session (POST)
app.post('/api/sessions', async (req: Request, res: Response) => {
  try {
    const { userEmail, title, readinessTier, score, grade, messages } = req.body;
    
    if (!userEmail) {
      return res.status(400).json({ error: "Missing userEmail" });
    }

    const sessionTitle = title || 'Mock Interview';

    const savedSession = await Session.findOneAndUpdate(
      { userEmail: userEmail, title: sessionTitle },
      {
        userEmail,
        title: sessionTitle,
        readinessTier: readinessTier || 'Uncalibrated',
        score: score || 0,
        grade: grade || 'mid',
        messages: messages || []
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    res.status(200).json({ message: "Session synced successfully", session: savedSession });
  } catch (error: any) {
    console.error("Save Session Error:", error);
    res.status(500).json({ error: "Failed to save interview session" });
  }
});

// 2. Fetch all past sessions for a specific user (GET)
app.get('/api/sessions/:email', async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    const sessions = await Session.find({ userEmail: email }).sort({ createdAt: -1 });
    res.json({ sessions });
  } catch (error: any) {
    console.error("Fetch Sessions Error:", error);
    res.status(500).json({ error: "Failed to fetch interview sessions" });
  }
});

// ==========================================
// AI Interview Chat & Evaluation Endpoint
// ==========================================
app.post('/api/interview/chat', async (req: Request, res: Response) => {
  try {
    const { message, resumeContext, responseTimeSec } = req.body;
    
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENROUTER_API_KEY in server environment variables" });
    }

    const systemPrompt = `
      You are an expert, professional, and conversational AI Interview Coach.
      Candidate Résumé/Context: ${resumeContext || 'General technical & behavioral role'}.
      
      Guidelines:
      1. Respond naturally and directly to the candidate's actual message ("${message}"). If they ask a casual question, answer it conversationally.
      2. Only evaluate their response timing (${responseTimeSec} seconds) occasionally or if it's glaringly slow/fast.
      3. Maintain a supportive, sharp, and realistic interviewer persona.
    `;

    // FIXED: Correct OpenRouter API chat completions endpoint
    const apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'AI Interview Coach'
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.7
      })
    });

    const data = (await apiResponse.json()) as any;
    
    if (data.error) {
      console.error("OpenRouter API Error:", data.error);
      return res.status(500).json({ error: data.error.message || "Failed to generate AI response" });
    }

    const reply = data.choices?.[0]?.message?.content || "Could not generate response.";
    res.json({ reply });
  } catch (error: any) {
    console.error("Server AI Error:", error);
    res.status(500).json({ error: "Failed to generate AI response" });
  }
});

// Google Drive Files Proxy Endpoint
app.post('/api/drive/files', async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(401).json({ error: "Missing Google Access Token" });
    }

    // FIXED: Complete and valid Google Drive v3 file query URL
    const targetUrl = "https://www.googleapis.com/drive/v3/files?q=mimeType='application/pdf' or mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'&fields=files(id,name,mimeType,modifiedTime)";

    const driveResponse = await fetch(targetUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const data = (await driveResponse.json()) as any;
    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    const files = data.files.map((file: any) => ({
      id: file.id,
      name: file.name,
      type: file.mimeType.includes('pdf') ? 'PDF Document' : 'Word Document',
      updated: new Date(file.modifiedTime).toLocaleDateString()
    }));

    res.json({ files });
  } catch (error: any) {
    console.error("Drive Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch Google Drive files" });
  }
});

// Start Database and Server sequentially with safe fallback
const startServer = async () => {
  try {
    if (MONGO_URI && MONGO_URI.startsWith('mongodb')) {
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log("Connected to MongoDB successfully!");
    } else {
      console.log("⚠️ Skipping MongoDB connection (Update MONGO_URI in server/.env when ready)");
    }
  } catch (error: any) {
    console.warn("⚠️ Database connection warning (proceeding without DB):", error.message || error);
  }

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();