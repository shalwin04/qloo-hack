import express, { Request, Response } from "express";
import fetch, { Response as FetchResponse } from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface SpotifyErrorResponse {
  error: string;
  error_description?: string;
}

const router = express.Router();

router.post("/token", async (req: Request, res: Response): Promise<void> => {
  const { code } = req.body;

  if (!code) {
    res.status(400).json({ error: "Authorization code is required" });
    return;
  }

  try {
    const response = (await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.SPOTIFY_CLIENT_ID +
              ":" +
              process.env.SPOTIFY_CLIENT_SECRET
          ).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: "http://127.0.0.1:5173/callback",
      }),
    })) as FetchResponse;

    if (!response.ok) {
      const errorData = (await response.json()) as SpotifyErrorResponse;
      throw new Error(
        `Spotify API Error: ${errorData.error || response.status}`
      );
    }

    const data = (await response.json()) as SpotifyTokenResponse;
    res.json(data);
  } catch (error) {
    console.error("Error exchanging code for token:", error);
    res.status(500).json({
      error: "Failed to exchange code for token",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
