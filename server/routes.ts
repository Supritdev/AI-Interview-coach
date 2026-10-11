import { Request, Response } from 'express';
import { User, Session } from './user';

export const registerRoutes = (app: any) => {
  // 1. Save an interview session (POST)
  app.post('/api/sessions', async (req: Request, res: Response) => {
    try {
      const { userEmail, title, readinessTier, score, grade, messages } = req.body;
      
      if (!userEmail) {
        return res.status(400).json({ error: "Missing userEmail" });
      }

      const newSession = new Session({
        userEmail,
        title: title || 'Mock Interview',
        readinessTier,
        score,
        grade,
        messages: messages || []
      });

      const savedSession = await newSession.save();
      res.status(201).json({ message: "Session saved successfully", session: savedSession });
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
};