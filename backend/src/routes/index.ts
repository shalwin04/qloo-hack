import express from "express";
import { compiledGraph } from "../graph/graph";

const router = express.Router();

router.post("/init", async (req, res) => {
  const inputPrefs = req.body;

  try {
    const result = await compiledGraph.invoke({
      userPreferences: inputPrefs,
    });

    res.json(result);
  } catch (err) {
    console.error("Error processing /init:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
