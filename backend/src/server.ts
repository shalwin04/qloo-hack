import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import routes from "./routes/index"; // If this contains /init or other routes
import spotifyRouter from "./routes/spotify";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount your main routes (e.g. /init)
app.use("/", routes);

// Spotify API routes
app.use("/api/spotify", spotifyRouter);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});