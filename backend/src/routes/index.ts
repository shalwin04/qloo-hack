import express from "express";
import { fetchQlooInsights } from "../graph/nodes/qlooNode.js";
import { personalizedChatAgent } from "../graph/nodes/personalizedChatAgent.js";

const router = express.Router();

// POST /init -> takes user preferences, fetches Qloo insights, returns initial state
router.post("/init", async (req, res) => {
  const userPreferences = req.body;

  try {
    const initialState = {
      userPreferences,
      qlooInsights: {},
      chatHistory: [],
    };

    const stateWithInsights = await fetchQlooInsights(initialState);
    res.json(stateWithInsights);
  } catch (err) {
    console.error("Error in /init:", err);
    res.status(500).json({ error: "Failed to initialize session" });
  }
});

// POST /chat -> takes previous state + user message, returns updated state with AI reply
router.post("/chat", async (req, res) => {
  const { userMessage, previousState } = req.body;

  try {
    const newState = {
      ...previousState,
      chatHistory: [
        ...(previousState.chatHistory ?? []),
        { role: "user", content: userMessage },
      ],
    };

    const updatedState = await personalizedChatAgent(newState);
    res.json(updatedState);
  } catch (err) {
    console.error("Error in /chat:", err);
    res.status(500).json({ error: "Failed to process chat" });
  }
});

export default router;
