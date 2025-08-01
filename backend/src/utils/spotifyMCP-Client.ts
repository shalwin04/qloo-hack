import dotenv from "dotenv";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GraphState } from "../graph/graphState.js";

import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY!;
const MCP_SERVER_URL = "http://localhost:3002/mcp";

// Simplified Spotify MCP Client that handles SSE responses
class SimpleSpotifyMCPClient {
  private sessionId: string | null = null;
  private baseHeaders: Record<string, string>;
  private requestId = 1;

  constructor(spotifyToken: string) {
    if (!spotifyToken) {
      throw new Error("Spotify access token is required");
    }
    this.baseHeaders = {
      "X-Spotify-Token": spotifyToken,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
  }

  async initialize(): Promise<void> {
    console.log("🎵 Initializing Spotify MCP session...");

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      const response = await fetch(MCP_SERVER_URL, {
        method: "POST",
        headers: this.baseHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            clientInfo: {
              name: "spotify-mcp-client",
              version: "1.0.0",
            },
          },
          id: this.requestId++,
        }),
      });

      if (response.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.warn(`⚠️ Rate limited (429). Retrying in ${waitTime}ms...`);
        await new Promise((res) => setTimeout(res, waitTime));
        attempt++;
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to initialize Spotify MCP session: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      // Success
      this.sessionId = response.headers.get("mcp-session-id");
      if (!this.sessionId) {
        throw new Error("No session ID returned from server");
      }

      console.log("✅ Spotify session initialized with ID:", this.sessionId);
      await this.sendNotification("notifications/initialized", {});
      console.log("✅ Spotify initialization complete");
      return;
    }

    throw new Error(
      "❌ Spotify MCP session initialization failed after multiple retries."
    );
  }

  private async sendNotification(method: string, params: any): Promise<void> {
    if (!this.sessionId) {
      throw new Error("Session not initialized");
    }

    const request = {
      jsonrpc: "2.0",
      method,
      params,
    };

    const requestHeaders = {
      ...this.baseHeaders,
      "mcp-session-id": this.sessionId,
    };

    const response = await fetch(MCP_SERVER_URL, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      console.warn(
        `Notification ${method} failed:`,
        response.status,
        response.statusText
      );
      const errorText = await response.text();
      console.warn("Error details:", errorText);
    }
  }

  private parseSSEResponse(text: string): any {
    const lines = text.split("\n");
    let jsonData = "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.substring(6).trim();
        if (data && data !== "[DONE]") {
          jsonData += data;
        }
      }
    }

    if (jsonData) {
      try {
        return JSON.parse(jsonData);
      } catch (e) {
        console.warn("Failed to parse SSE JSON:", jsonData);
        throw new Error(`Invalid JSON in SSE response: ${jsonData}`);
      }
    }

    throw new Error("No valid JSON found in SSE response");
  }

  private async sendRequest(method: string, params: any): Promise<any> {
    if (!this.sessionId) {
      throw new Error("Session not initialized");
    }

    const requestId = this.requestId++;

    const request = {
      jsonrpc: "2.0",
      method,
      params,
      id: requestId,
    };

    const requestHeaders = {
      ...this.baseHeaders,
      "mcp-session-id": this.sessionId,
    };

    console.log(`📤 Sending Spotify request: ${method}`, params);

    const response = await fetch(MCP_SERVER_URL, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Spotify request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const responseText = await response.text();
    console.log(
      "📥 Raw Spotify response:",
      responseText.substring(0, 200) + "..."
    );

    let result;

    // Try to parse as regular JSON first
    try {
      result = JSON.parse(responseText);
    } catch (jsonError) {
      // If that fails, try to parse as SSE
      console.log("📥 Parsing as SSE response...");
      try {
        result = this.parseSSEResponse(responseText);
      } catch (sseError) {
        console.error("Failed to parse both JSON and SSE:", {
          jsonError: jsonError as Error,
          sseError: sseError as Error,
          responseText: responseText.substring(0, 500),
        });
        throw new Error(
          `Unable to parse response: ${responseText.substring(0, 200)}`
        );
      }
    }

    if (result.error) {
      throw new Error(`Spotify MCP Error: ${result.error.message}`);
    }

    console.log("📥 Spotify request completed successfully");
    return result.result;
  }

  async callTool(name: string, arguments_: any): Promise<any> {
    return this.sendRequest("tools/call", {
      name,
      arguments: arguments_,
    });
  }

  async listTools(): Promise<any> {
    return this.sendRequest("tools/list", {});
  }

  close(): void {
    if (this.sessionId) {
      // Send close request to server
      fetch(MCP_SERVER_URL, {
        method: "DELETE",
        headers: {
          ...this.baseHeaders,
          "mcp-session-id": this.sessionId,
        },
      }).catch((error) =>
        console.warn("Error closing Spotify session:", error)
      );
    }
    this.sessionId = null;
  }
}

// Create LangChain tools from Spotify MCP tools
function createSpotifyLangChainTools(mcpClient: SimpleSpotifyMCPClient) {
  const tools = [
    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("search_tracks", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "search_tracks",
        description: "Search for tracks on Spotify",
        schema: z.object({
          query: z.string().describe("Search query for tracks"),
          limit: z
            .number()
            .min(1)
            .max(50)
            .default(20)
            .describe("Number of results to return"),
          offset: z
            .number()
            .min(0)
            .default(0)
            .describe("Offset for pagination"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("search_artists", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "search_artists",
        description: "Search for artists on Spotify",
        schema: z.object({
          query: z.string().describe("Search query for artists"),
          limit: z
            .number()
            .min(1)
            .max(50)
            .default(20)
            .describe("Number of results to return"),
          offset: z
            .number()
            .min(0)
            .default(0)
            .describe("Offset for pagination"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("search_albums", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "search_albums",
        description: "Search for albums on Spotify",
        schema: z.object({
          query: z.string().describe("Search query for albums"),
          limit: z
            .number()
            .min(1)
            .max(50)
            .default(20)
            .describe("Number of results to return"),
          offset: z
            .number()
            .min(0)
            .default(0)
            .describe("Offset for pagination"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("search_playlists", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "search_playlists",
        description: "Search for playlists on Spotify",
        schema: z.object({
          query: z.string().describe("Search query for playlists"),
          limit: z
            .number()
            .min(1)
            .max(50)
            .default(20)
            .describe("Number of results to return"),
          offset: z
            .number()
            .min(0)
            .default(0)
            .describe("Offset for pagination"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("get_my_playlists", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "get_my_playlists",
        description: "Get the current user's playlists",
        schema: z.object({
          limit: z
            .number()
            .min(1)
            .max(50)
            .default(20)
            .describe("Number of playlists to return"),
          offset: z
            .number()
            .min(0)
            .default(0)
            .describe("Offset for pagination"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("create_playlist", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "create_playlist",
        description: "Create a new playlist",
        schema: z.object({
          name: z.string().describe("Name of the playlist"),
          description: z
            .string()
            .optional()
            .describe("Description of the playlist"),
          public: z
            .boolean()
            .default(true)
            .describe("Whether the playlist is public"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool(
            "add_tracks_to_playlist",
            input
          );
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "add_tracks_to_playlist",
        description: "Add tracks to a playlist",
        schema: z.object({
          playlist_id: z.string().describe("ID of the playlist"),
          track_uris: z
            .array(z.string())
            .describe(
              "Array of track URIs to add (e.g., ['spotify:track:4iV5W9uYEdYUVa79Axb7Rh'])"
            ),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool(
            "remove_tracks_from_playlist",
            input
          );
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "remove_tracks_from_playlist",
        description: "Remove tracks from a playlist",
        schema: z.object({
          playlist_id: z.string().describe("ID of the playlist"),
          track_uris: z
            .array(z.string())
            .describe("Array of track URIs to remove"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("get_playlist_tracks", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "get_playlist_tracks",
        description: "Get tracks from a playlist",
        schema: z.object({
          playlist_id: z.string().describe("ID of the playlist"),
          limit: z
            .number()
            .min(1)
            .max(100)
            .default(100)
            .describe("Number of tracks to return"),
          offset: z
            .number()
            .min(0)
            .default(0)
            .describe("Offset for pagination"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool(
            "get_current_playback",
            input
          );
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "get_current_playback",
        description: "Get information about the current playback state",
        schema: z.object({}),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("play_track", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "play_track",
        description: "Play a track or context (album, playlist)",
        schema: z.object({
          track_uri: z
            .string()
            .optional()
            .describe(
              "URI of the track to play (e.g., 'spotify:track:4iV5W9uYEdYUVa79Axb7Rh')"
            ),
          context_uri: z
            .string()
            .optional()
            .describe(
              "URI of the context to play (e.g., 'spotify:album:1DFixLWuPkv3KT3TnV35m3')"
            ),
          device_id: z
            .string()
            .optional()
            .describe("ID of the device to play on"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("control_playback", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "control_playback",
        description: "Control playback (play, pause, next, previous)",
        schema: z.object({
          action: z
            .enum(["play", "pause", "next", "previous"])
            .describe("Playback action"),
          device_id: z
            .string()
            .optional()
            .describe("ID of the device to control"),
        }),
      }
    ),

    tool(
      async (input) => {
        try {
          const result = await mcpClient.callTool("get_recommendations", input);
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
      {
        name: "get_recommendations",
        description:
          "Get track recommendations based on seeds and audio features",
        schema: z.object({
          seed_artists: z
            .array(z.string())
            .optional()
            .describe("Artist IDs for recommendations"),
          seed_tracks: z
            .array(z.string())
            .optional()
            .describe("Track IDs for recommendations"),
          seed_genres: z
            .array(z.string())
            .optional()
            .describe(
              "Genre names for recommendations (e.g., ['pop', 'rock', 'jazz'])"
            ),
          limit: z
            .number()
            .min(1)
            .max(100)
            .default(20)
            .describe("Number of recommendations"),
          target_acousticness: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("Target acousticness (0.0 to 1.0)"),
          target_danceability: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("Target danceability (0.0 to 1.0)"),
          target_energy: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("Target energy (0.0 to 1.0)"),
          target_valence: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe("Target valence/positivity (0.0 to 1.0)"),
        }),
      }
    ),
  ];

  return tools;
}

// Factory function to create Spotify music agent with token
export const createSpotifyMusicAgentNode = (spotifyToken: string) => {
  console.log(`🎵 Creating SpotifyMusicAgent node with Spotify token`);

  return async (
    state: typeof GraphState.State
  ): Promise<Partial<typeof GraphState.State>> => {
    console.log("🎵 SpotifyMusicAgent node starting...");

    try {
      if (!spotifyToken) {
        throw new Error("Spotify token not provided to SpotifyMusicAgent node");
      }

      console.log(`🔑 Using Spotify token for MCP client initialization`);

      // Initialize Spotify MCP client with the OAuth token
      const mcpClient = new SimpleSpotifyMCPClient(spotifyToken);
      await mcpClient.initialize();

      // List available tools
      console.log("🔄 Listing available Spotify tools...");
      const toolsList = await mcpClient.listTools();
      console.log(
        "✅ Available Spotify tools:",
        toolsList.tools?.map((t: any) => t.name) || []
      );

      // Create LangChain tools
      const tools = createSpotifyLangChainTools(mcpClient);

      // Setup the model
      const model = new ChatGoogleGenerativeAI({
        model: "gemini-2.0-flash-exp",
        apiKey: API_KEY,
        temperature: 0.3, // Slightly higher for more creative music recommendations
      });

      // Create the agent without custom prompt - let it use default
      const agent = createReactAgent({
        llm: model,
        tools,
      });

      // Create the context message with all the state information
      const contextMessage = `You are a Spotify music assistant that helps users with music discovery, playlist management, and playback control.

Current Context:
- User Request: ${state.userMessage || "No user message provided"}
- Previous Context: ${state.plans || "No previous context"}
- Generated Content: ${state.generatedCode || "No content generated"}
- Previous Results: ${state.testResults || "No previous results available"}

Your task is to help the user with their Spotify-related music needs using the available tools.

Available Spotify operations:
- search_tracks: Search for tracks on Spotify
- search_artists: Search for artists on Spotify
- search_albums: Search for albums on Spotify
- search_playlists: Search for public playlists
- get_my_playlists: Get the user's playlists
- create_playlist: Create new playlists
- add_tracks_to_playlist: Add tracks to playlists
- remove_tracks_from_playlist: Remove tracks from playlists
- get_playlist_tracks: Get tracks from a playlist
- get_current_playback: Check what's currently playing
- play_track: Play specific tracks or contexts
- control_playback: Control playback (play/pause/next/previous)
- get_recommendations: Get personalized music recommendations

Important notes:
- Track URIs should be in format: spotify:track:TRACK_ID
- When adding tracks to playlists, use the full Spotify URI
- For recommendations, you can use artist IDs, track IDs, or genres as seeds
- Audio features (acousticness, danceability, energy, valence) range from 0.0 to 1.0

Please help the user with their music request: ${
        state.userMessage || "No specific request provided"
      }`;

      // Execute the agent with proper message format
      const result = await agent.invoke({
        messages: [
          new SystemMessage({
            content:
              "You are a Spotify music assistant that helps users discover, organize, and play music. Always provide helpful and engaging responses about music.",
          }),
          new HumanMessage({
            content: contextMessage,
          }),
        ],
      });

      // Extract the final response
      const lastMessage = result.messages[result.messages.length - 1];
      const finalResponse = lastMessage.content.toString();

      // Clean up
      mcpClient.close();

      console.log("✅ SpotifyMusicAgent node completed successfully");

      // Return the updated state (clean, no token data)
      return {
        finalResult: finalResponse,
        agentTrace: [...(state.agentTrace || []), "spotify_music"],
      };
    } catch (error) {
      console.error("❌ SpotifyMusicAgent node error:", error);

      return {
        finalResult: `Error in SpotifyMusicAgent: ${
          error instanceof Error ? error.message : String(error)
        }. Please make sure you have a valid Spotify access token and an active Spotify session.`,
        agentTrace: [...(state.agentTrace || []), "spotify_music"],
      };
    }
  };
};

// Export the MCP client class in case it's needed elsewhere
export { SimpleSpotifyMCPClient };
