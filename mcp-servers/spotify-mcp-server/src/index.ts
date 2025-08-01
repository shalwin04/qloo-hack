#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Spotify API Schemas
const SpotifyTrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  artists: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    })
  ),
  album: z.object({
    id: z.string(),
    name: z.string(),
    images: z.array(
      z.object({
        url: z.string(),
        height: z.number().nullable(),
        width: z.number().nullable(),
      })
    ),
  }),
  duration_ms: z.number(),
  external_urls: z.object({
    spotify: z.string(),
  }),
  preview_url: z.string().nullable(),
  popularity: z.number(),
});

const SpotifyPlaylistSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  public: z.boolean(),
  owner: z.object({
    id: z.string(),
    display_name: z.string().nullable(),
  }),
  tracks: z.object({
    total: z.number(),
  }),
  external_urls: z.object({
    spotify: z.string(),
  }),
  images: z.array(
    z.object({
      url: z.string(),
      height: z.number().nullable(),
      width: z.number().nullable(),
    })
  ),
});

const SpotifyArtistSchema = z.object({
  id: z.string(),
  name: z.string(),
  genres: z.array(z.string()),
  popularity: z.number(),
  followers: z.object({
    total: z.number(),
  }),
  external_urls: z.object({
    spotify: z.string(),
  }),
  images: z.array(
    z.object({
      url: z.string(),
      height: z.number().nullable(),
      width: z.number().nullable(),
    })
  ),
});

const SpotifyAlbumSchema = z.object({
  id: z.string(),
  name: z.string(),
  artists: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    })
  ),
  release_date: z.string(),
  total_tracks: z.number(),
  external_urls: z.object({
    spotify: z.string(),
  }),
  images: z.array(
    z.object({
      url: z.string(),
      height: z.number().nullable(),
      width: z.number().nullable(),
    })
  ),
});

const SpotifyUserSchema = z.object({
  id: z.string(),
  display_name: z.string().nullable(),
  email: z.string().optional(),
  followers: z.object({
    total: z.number(),
  }),
  external_urls: z.object({
    spotify: z.string(),
  }),
  images: z.array(
    z.object({
      url: z.string(),
      height: z.number().nullable(),
      width: z.number().nullable(),
    })
  ),
});

const SpotifySearchResponseSchema = z.object({
  tracks: z
    .object({
      items: z.array(SpotifyTrackSchema),
      total: z.number(),
    })
    .optional(),
  artists: z
    .object({
      items: z.array(SpotifyArtistSchema),
      total: z.number(),
    })
    .optional(),
  albums: z
    .object({
      items: z.array(SpotifyAlbumSchema),
      total: z.number(),
    })
    .optional(),
  playlists: z
    .object({
      items: z.array(SpotifyPlaylistSchema),
      total: z.number(),
    })
    .optional(),
});

const SpotifyCurrentPlaybackSchema = z.object({
  is_playing: z.boolean(),
  currently_playing_type: z.string(),
  item: SpotifyTrackSchema.nullable(),
  progress_ms: z.number().nullable(),
  device: z
    .object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      volume_percent: z.number().nullable(),
    })
    .nullable(),
});

// Tool Input Schemas
const SearchTracksSchema = z.object({
  query: z.string().describe("Search query for tracks"),
  limit: z
    .number()
    .min(1)
    .max(50)
    .default(20)
    .describe("Number of results to return"),
  offset: z.number().min(0).default(0).describe("Offset for pagination"),
});

const SearchArtistsSchema = z.object({
  query: z.string().describe("Search query for artists"),
  limit: z
    .number()
    .min(1)
    .max(50)
    .default(20)
    .describe("Number of results to return"),
  offset: z.number().min(0).default(0).describe("Offset for pagination"),
});

const SearchAlbumsSchema = z.object({
  query: z.string().describe("Search query for albums"),
  limit: z
    .number()
    .min(1)
    .max(50)
    .default(20)
    .describe("Number of results to return"),
  offset: z.number().min(0).default(0).describe("Offset for pagination"),
});

const SearchPlaylistsSchema = z.object({
  query: z.string().describe("Search query for playlists"),
  limit: z
    .number()
    .min(1)
    .max(50)
    .default(20)
    .describe("Number of results to return"),
  offset: z.number().min(0).default(0).describe("Offset for pagination"),
});

const GetMyPlaylistsSchema = z.object({
  limit: z
    .number()
    .min(1)
    .max(50)
    .default(20)
    .describe("Number of playlists to return"),
  offset: z.number().min(0).default(0).describe("Offset for pagination"),
});

const CreatePlaylistSchema = z.object({
  name: z.string().describe("Name of the playlist"),
  description: z.string().optional().describe("Description of the playlist"),
  public: z.boolean().default(true).describe("Whether the playlist is public"),
});

const AddTracksToPlaylistSchema = z.object({
  playlist_id: z.string().describe("ID of the playlist"),
  track_uris: z.array(z.string()).describe("Array of track URIs to add"),
});

const RemoveTracksFromPlaylistSchema = z.object({
  playlist_id: z.string().describe("ID of the playlist"),
  track_uris: z.array(z.string()).describe("Array of track URIs to remove"),
});

const GetPlaylistTracksSchema = z.object({
  playlist_id: z.string().describe("ID of the playlist"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(100)
    .describe("Number of tracks to return"),
  offset: z.number().min(0).default(0).describe("Offset for pagination"),
});

const PlayTrackSchema = z.object({
  track_uri: z.string().optional().describe("URI of the track to play"),
  context_uri: z
    .string()
    .optional()
    .describe("URI of the context (album, playlist) to play"),
  device_id: z.string().optional().describe("ID of the device to play on"),
});

const ControlPlaybackSchema = z.object({
  action: z
    .enum(["play", "pause", "next", "previous"])
    .describe("Playback action"),
  device_id: z.string().optional().describe("ID of the device to control"),
});

const GetRecommendationsSchema = z.object({
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
    .describe("Genre names for recommendations"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(20)
    .describe("Number of recommendations"),
  target_acousticness: z.number().min(0).max(1).optional(),
  target_danceability: z.number().min(0).max(1).optional(),
  target_energy: z.number().min(0).max(1).optional(),
  target_valence: z.number().min(0).max(1).optional(),
});

// Type definitions
type SpotifyTrack = z.infer<typeof SpotifyTrackSchema>;
type SpotifyPlaylist = z.infer<typeof SpotifyPlaylistSchema>;
type SpotifyArtist = z.infer<typeof SpotifyArtistSchema>;
type SpotifyAlbum = z.infer<typeof SpotifyAlbumSchema>;
type SpotifyUser = z.infer<typeof SpotifyUserSchema>;
type SpotifySearchResponse = z.infer<typeof SpotifySearchResponseSchema>;
type SpotifyCurrentPlayback = z.infer<typeof SpotifyCurrentPlaybackSchema>;

const server = new Server(
  {
    name: "spotify-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Enhanced session management with proper token handling
interface SessionInfo {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
  connected: boolean;
  spotifyToken: string; // Required Spotify access token for this session
  createdAt: number;
}

const sessions = new Map<string, SessionInfo>();

const SPOTIFY_API_URL = "https://api.spotify.com/v1";

// Context for current request session
interface RequestContext {
  sessionId?: string;
  spotifyToken?: string;
}

// JSON-RPC request interface
interface JsonRpcRequest {
  jsonrpc: string;
  method?: string;
  params?: any;
  id?: string | number | null;
}

// Request-scoped context using AsyncLocalStorage-like pattern
let currentContext: RequestContext = {};

// Helper function to get token from current session context
function getTokenFromContext(): string {
  if (currentContext.spotifyToken) {
    return currentContext.spotifyToken;
  }

  if (currentContext.sessionId) {
    const session = sessions.get(currentContext.sessionId);
    if (session?.spotifyToken) {
      return session.spotifyToken;
    }
  }

  throw new Error(
    "Spotify access token not available in current session context"
  );
}

// Helper function to extract token from various sources
function extractSpotifyToken(req: Request): string | null {
  return (
    (req.headers["x-spotify-token"] as string) ||
    (req.headers["spotify-token"] as string) ||
    req.headers["authorization"]?.replace(/^Bearer\s+/i, "") ||
    req.body?.spotify_token ||
    null
  );
}

// Validate Spotify token by making a test API call
async function validateSpotifyToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${SPOTIFY_API_URL}/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.ok;
  } catch (error) {
    console.error("Token validation error:", error);
    return false;
  }
}

// Spotify API functions
async function searchTracks(
  query: string,
  limit: number = 20,
  offset: number = 0
): Promise<SpotifyTrack[]> {
  const token = getTokenFromContext();
  const url = new URL(`${SPOTIFY_API_URL}/search`);
  url.searchParams.append("q", query);
  url.searchParams.append("type", "track");
  url.searchParams.append("limit", limit.toString());
  url.searchParams.append("offset", offset.toString());

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return SpotifySearchResponseSchema.parse(data).tracks?.items || [];
}

async function searchArtists(
  query: string,
  limit: number = 20,
  offset: number = 0
): Promise<SpotifyArtist[]> {
  const token = getTokenFromContext();
  const url = new URL(`${SPOTIFY_API_URL}/search`);
  url.searchParams.append("q", query);
  url.searchParams.append("type", "artist");
  url.searchParams.append("limit", limit.toString());
  url.searchParams.append("offset", offset.toString());

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return SpotifySearchResponseSchema.parse(data).artists?.items || [];
}

async function searchAlbums(
  query: string,
  limit: number = 20,
  offset: number = 0
): Promise<SpotifyAlbum[]> {
  const token = getTokenFromContext();
  const url = new URL(`${SPOTIFY_API_URL}/search`);
  url.searchParams.append("q", query);
  url.searchParams.append("type", "album");
  url.searchParams.append("limit", limit.toString());
  url.searchParams.append("offset", offset.toString());

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return SpotifySearchResponseSchema.parse(data).albums?.items || [];
}

async function searchPlaylists(
  query: string,
  limit: number = 20,
  offset: number = 0
): Promise<SpotifyPlaylist[]> {
  const token = getTokenFromContext();
  const url = new URL(`${SPOTIFY_API_URL}/search`);
  url.searchParams.append("q", query);
  url.searchParams.append("type", "playlist");
  url.searchParams.append("limit", limit.toString());
  url.searchParams.append("offset", offset.toString());

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return SpotifySearchResponseSchema.parse(data).playlists?.items || [];
}

async function getMyPlaylists(
  limit: number = 20,
  offset: number = 0
): Promise<SpotifyPlaylist[]> {
  const token = getTokenFromContext();
  const url = new URL(`${SPOTIFY_API_URL}/me/playlists`);
  url.searchParams.append("limit", limit.toString());
  url.searchParams.append("offset", offset.toString());

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.items.map((item: any) => SpotifyPlaylistSchema.parse(item));
}

async function createPlaylist(
  name: string,
  description?: string,
  isPublic: boolean = true
): Promise<SpotifyPlaylist> {
  const token = getTokenFromContext();

  // First get current user ID
  const userResponse = await fetch(`${SPOTIFY_API_URL}/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!userResponse.ok) {
    const errorText = await userResponse.text();
    throw new Error(`Spotify API error (${userResponse.status}): ${errorText}`);
  }

  const user = SpotifyUserSchema.parse(await userResponse.json());

  const response = await fetch(
    `${SPOTIFY_API_URL}/users/${user.id}/playlists`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        description,
        public: isPublic,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${errorText}`);
  }

  return SpotifyPlaylistSchema.parse(await response.json());
}

async function addTracksToPlaylist(
  playlistId: string,
  trackUris: string[]
): Promise<{ snapshot_id: string }> {
  const token = getTokenFromContext();
  const response = await fetch(
    `${SPOTIFY_API_URL}/playlists/${playlistId}/tracks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uris: trackUris,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

async function removeTracksFromPlaylist(
  playlistId: string,
  trackUris: string[]
): Promise<{ snapshot_id: string }> {
  const token = getTokenFromContext();
  const response = await fetch(
    `${SPOTIFY_API_URL}/playlists/${playlistId}/tracks`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tracks: trackUris.map((uri) => ({ uri })),
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

async function getPlaylistTracks(
  playlistId: string,
  limit: number = 100,
  offset: number = 0
): Promise<SpotifyTrack[]> {
  const token = getTokenFromContext();
  const url = new URL(`${SPOTIFY_API_URL}/playlists/${playlistId}/tracks`);
  url.searchParams.append("limit", limit.toString());
  url.searchParams.append("offset", offset.toString());

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.items
    .filter((item: any) => item.track)
    .map((item: any) => SpotifyTrackSchema.parse(item.track));
}

async function getCurrentPlayback(): Promise<SpotifyCurrentPlayback | null> {
  const token = getTokenFromContext();
  const response = await fetch(`${SPOTIFY_API_URL}/me/player`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 204) {
    return null; // No active device
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${errorText}`);
  }

  return SpotifyCurrentPlaybackSchema.parse(await response.json());
}

async function playTrack(
  trackUri?: string,
  contextUri?: string,
  deviceId?: string
): Promise<void> {
  const token = getTokenFromContext();
  let url = `${SPOTIFY_API_URL}/me/player/play`;
  if (deviceId) {
    url += `?device_id=${deviceId}`;
  }

  const body: any = {};
  if (trackUri) {
    body.uris = [trackUri];
  }
  if (contextUri) {
    body.context_uri = contextUri;
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${errorText}`);
  }
}

async function controlPlayback(
  action: "play" | "pause" | "next" | "previous",
  deviceId?: string
): Promise<void> {
  const token = getTokenFromContext();
  let endpoint = "";
  let method = "PUT";

  switch (action) {
    case "play":
      endpoint = "/me/player/play";
      break;
    case "pause":
      endpoint = "/me/player/pause";
      break;
    case "next":
      endpoint = "/me/player/next";
      method = "POST";
      break;
    case "previous":
      endpoint = "/me/player/previous";
      method = "POST";
      break;
  }

  let url = `${SPOTIFY_API_URL}${endpoint}`;
  if (deviceId) {
    url += `?device_id=${deviceId}`;
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${errorText}`);
  }
}

async function getRecommendations(
  options: z.infer<typeof GetRecommendationsSchema>
): Promise<SpotifyTrack[]> {
  const token = getTokenFromContext();
  const url = new URL(`${SPOTIFY_API_URL}/recommendations`);

  if (options.seed_artists) {
    url.searchParams.append("seed_artists", options.seed_artists.join(","));
  }
  if (options.seed_tracks) {
    url.searchParams.append("seed_tracks", options.seed_tracks.join(","));
  }
  if (options.seed_genres) {
    url.searchParams.append("seed_genres", options.seed_genres.join(","));
  }

  url.searchParams.append("limit", options.limit.toString());

  if (options.target_acousticness !== undefined) {
    url.searchParams.append(
      "target_acousticness",
      options.target_acousticness.toString()
    );
  }
  if (options.target_danceability !== undefined) {
    url.searchParams.append(
      "target_danceability",
      options.target_danceability.toString()
    );
  }
  if (options.target_energy !== undefined) {
    url.searchParams.append("target_energy", options.target_energy.toString());
  }
  if (options.target_valence !== undefined) {
    url.searchParams.append(
      "target_valence",
      options.target_valence.toString()
    );
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.tracks.map((track: any) => SpotifyTrackSchema.parse(track));
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_tracks",
        description: "Search for tracks on Spotify",
        inputSchema: zodToJsonSchema(SearchTracksSchema),
      },
      {
        name: "search_artists",
        description: "Search for artists on Spotify",
        inputSchema: zodToJsonSchema(SearchArtistsSchema),
      },
      {
        name: "search_albums",
        description: "Search for albums on Spotify",
        inputSchema: zodToJsonSchema(SearchAlbumsSchema),
      },
      {
        name: "search_playlists",
        description: "Search for playlists on Spotify",
        inputSchema: zodToJsonSchema(SearchPlaylistsSchema),
      },
      {
        name: "get_my_playlists",
        description: "Get the current user's playlists",
        inputSchema: zodToJsonSchema(GetMyPlaylistsSchema),
      },
      {
        name: "create_playlist",
        description: "Create a new playlist",
        inputSchema: zodToJsonSchema(CreatePlaylistSchema),
      },
      {
        name: "add_tracks_to_playlist",
        description: "Add tracks to a playlist",
        inputSchema: zodToJsonSchema(AddTracksToPlaylistSchema),
      },
      {
        name: "remove_tracks_from_playlist",
        description: "Remove tracks from a playlist",
        inputSchema: zodToJsonSchema(RemoveTracksFromPlaylistSchema),
      },
      {
        name: "get_playlist_tracks",
        description: "Get tracks from a playlist",
        inputSchema: zodToJsonSchema(GetPlaylistTracksSchema),
      },
      {
        name: "get_current_playback",
        description: "Get information about the current playback state",
        inputSchema: zodToJsonSchema(z.object({})),
      },
      {
        name: "play_track",
        description: "Play a track or context (album, playlist)",
        inputSchema: zodToJsonSchema(PlayTrackSchema),
      },
      {
        name: "control_playback",
        description: "Control playback (play, pause, next, previous)",
        inputSchema: zodToJsonSchema(ControlPlaybackSchema),
      },
      {
        name: "get_recommendations",
        description:
          "Get track recommendations based on seeds and audio features",
        inputSchema: zodToJsonSchema(GetRecommendationsSchema),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    switch (request.params.name) {
      case "search_tracks": {
        const args = SearchTracksSchema.parse(request.params.arguments);
        const tracks = await searchTracks(args.query, args.limit, args.offset);
        return {
          content: [{ type: "text", text: JSON.stringify(tracks, null, 2) }],
        };
      }

      case "search_artists": {
        const args = SearchArtistsSchema.parse(request.params.arguments);
        const artists = await searchArtists(
          args.query,
          args.limit,
          args.offset
        );
        return {
          content: [{ type: "text", text: JSON.stringify(artists, null, 2) }],
        };
      }

      case "search_albums": {
        const args = SearchAlbumsSchema.parse(request.params.arguments);
        const albums = await searchAlbums(args.query, args.limit, args.offset);
        return {
          content: [{ type: "text", text: JSON.stringify(albums, null, 2) }],
        };
      }

      case "search_playlists": {
        const args = SearchPlaylistsSchema.parse(request.params.arguments);
        const playlists = await searchPlaylists(
          args.query,
          args.limit,
          args.offset
        );
        return {
          content: [{ type: "text", text: JSON.stringify(playlists, null, 2) }],
        };
      }

      case "get_my_playlists": {
        const args = GetMyPlaylistsSchema.parse(request.params.arguments);
        const playlists = await getMyPlaylists(args.limit, args.offset);
        return {
          content: [{ type: "text", text: JSON.stringify(playlists, null, 2) }],
        };
      }

      case "create_playlist": {
        const args = CreatePlaylistSchema.parse(request.params.arguments);
        const playlist = await createPlaylist(
          args.name,
          args.description,
          args.public
        );
        return {
          content: [{ type: "text", text: JSON.stringify(playlist, null, 2) }],
        };
      }

      case "add_tracks_to_playlist": {
        const args = AddTracksToPlaylistSchema.parse(request.params.arguments);
        const result = await addTracksToPlaylist(
          args.playlist_id,
          args.track_uris
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "remove_tracks_from_playlist": {
        const args = RemoveTracksFromPlaylistSchema.parse(
          request.params.arguments
        );
        const result = await removeTracksFromPlaylist(
          args.playlist_id,
          args.track_uris
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_playlist_tracks": {
        const args = GetPlaylistTracksSchema.parse(request.params.arguments);
        const tracks = await getPlaylistTracks(
          args.playlist_id,
          args.limit,
          args.offset
        );
        return {
          content: [{ type: "text", text: JSON.stringify(tracks, null, 2) }],
        };
      }

      case "get_current_playback": {
        const playback = await getCurrentPlayback();
        return {
          content: [{ type: "text", text: JSON.stringify(playback, null, 2) }],
        };
      }

      case "play_track": {
        const args = PlayTrackSchema.parse(request.params.arguments);
        await playTrack(args.track_uri, args.context_uri, args.device_id);
        return {
          content: [{ type: "text", text: "Playback started successfully" }],
        };
      }

      case "control_playback": {
        const args = ControlPlaybackSchema.parse(request.params.arguments);
        await controlPlayback(args.action, args.device_id);
        return {
          content: [
            {
              type: "text",
              text: `Playback ${args.action} executed successfully`,
            },
          ],
        };
      }

      case "get_recommendations": {
        const args = GetRecommendationsSchema.parse(request.params.arguments);
        const recommendations = await getRecommendations(args);
        return {
          content: [
            { type: "text", text: JSON.stringify(recommendations, null, 2) },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid arguments: ${error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ")}`
      );
    }
    throw error;
  }
});

// Clean up inactive sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  const TIMEOUT = 30 * 60 * 1000; // 30 minutes

  for (const [sessionId, session] of sessions) {
    if (now - session.lastActivity > TIMEOUT) {
      console.log(`Cleaning up inactive session: ${sessionId}`);
      try {
        session.transport.close();
      } catch (error) {
        console.error(`Error closing session ${sessionId}:`, error);
      }
      sessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

async function runServer() {
  const app = express();

  // Middleware
  app.use(
    cors({
      origin: true,
      credentials: true,
      exposedHeaders: ["mcp-session-id"],
    })
  );
  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_, res) => {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      activeSessions: sessions.size,
      mcpVersion: "0.1.0",
    });
  });

  // GET /sessions - List active sessions (for debugging)
  app.get("/sessions", (_, res) => {
    const sessionList = Array.from(sessions.entries()).map(([id, info]) => ({
      id,
      lastActivity: new Date(info.lastActivity).toISOString(),
      createdAt: new Date(info.createdAt).toISOString(),
      connected: info.connected,
      hasToken: !!info.spotifyToken,
    }));
    res.json({ sessions: sessionList, total: sessions.size });
  });

  // POST /mcp — handle MCP JSON-RPC requests (init + ongoing)
  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const spotifyToken = extractSpotifyToken(req);

    try {
      let sessionInfo: SessionInfo;

      // Cast req.body to JsonRpcRequest to access id property
      const jsonRpcBody = req.body as JsonRpcRequest;

      if (sessionId && sessions.has(sessionId)) {
        // Existing session - update activity and validate token
        sessionInfo = sessions.get(sessionId)!;
        sessionInfo.lastActivity = Date.now();

        // If a new token is provided, validate and update it
        if (spotifyToken && spotifyToken !== sessionInfo.spotifyToken) {
          const isValidToken = await validateSpotifyToken(spotifyToken);
          if (!isValidToken) {
            res.status(401).json({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Invalid Spotify access token provided",
              },
              id: jsonRpcBody?.id || null,
            });
            return;
          }
          sessionInfo.spotifyToken = spotifyToken;
          console.log(`Updated token for session: ${sessionId}`);
        }
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New session initialization
        if (!spotifyToken) {
          res.status(401).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message:
                "Spotify access token is required for session initialization. Provide it via 'X-Spotify-Token', 'Spotify-Token', 'Authorization: Bearer <token>' header, or 'spotify_token' in request body.",
            },
            id: jsonRpcBody?.id || null,
          });
          return;
        }

        // Validate the token before creating session
        const isValidToken = await validateSpotifyToken(spotifyToken);
        if (!isValidToken) {
          res.status(401).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Invalid Spotify access token provided",
            },
            id: jsonRpcBody?.id || null,
          });
          return;
        }

        // Create new transport and session
        const newSessionId = randomUUID(); // Generate session ID upfront
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          onsessioninitialized: (sessionId) => {
            console.log(
              `New session initialized: ${sessionId} with valid token`
            );
          },
        });

        const now = Date.now();
        sessionInfo = {
          transport,
          lastActivity: now,
          createdAt: now,
          connected: true,
          spotifyToken,
        };

        // Setup cleanup on close
        transport.onclose = () => {
          console.log(`Session closed: ${newSessionId}`);
          sessions.delete(newSessionId);
        };

        // Connect transport to MCP server
        await server.connect(transport);

        // Store session with the known ID
        sessions.set(newSessionId, sessionInfo);

        // Set the session ID in response headers
        res.setHeader("mcp-session-id", newSessionId);
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message:
              "Bad Request: No valid session ID provided or not an initialize request",
          },
          id: jsonRpcBody?.id || null,
        });
        return;
      }

      // Set up request context for this request
      currentContext = {
        sessionId: sessionInfo.transport.sessionId,
        spotifyToken: sessionInfo.spotifyToken,
      };

      // Handle the JSON-RPC request
      await sessionInfo.transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      const jsonRpcBody = req.body as JsonRpcRequest;
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal error",
          data: error instanceof Error ? error.message : String(error),
        },
        id: jsonRpcBody?.id || null,
      });
    } finally {
      // Clean up request context
      currentContext = {};
    }
  });

  // GET /mcp — SSE notifications, server->client streaming
  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId) {
      res.status(400).json({
        error: "Missing MCP session ID header",
      });
      return;
    }

    const sessionInfo = sessions.get(sessionId);
    if (!sessionInfo) {
      res.status(404).json({
        error: "Invalid MCP session ID",
      });
      return;
    }

    console.log(`SSE connection established for session: ${sessionId}`);

    // Setup SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": req.headers.origin || "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Expose-Headers": "mcp-session-id",
      "X-Accel-Buffering": "no",
    });

    // Send initial SSE comment
    res.write(": SSE connection established\n\n");

    // Keep-alive mechanism
    const keepAliveInterval = setInterval(() => {
      if (!res.destroyed) {
        res.write(": keep-alive\n\n");
      }
    }, 30000);

    // Update session info
    sessionInfo.lastActivity = Date.now();
    sessionInfo.connected = true;

    // Set up request context for SSE
    currentContext = {
      sessionId: sessionId,
      spotifyToken: sessionInfo.spotifyToken,
    };

    // Cleanup function
    const cleanup = () => {
      clearInterval(keepAliveInterval);
      currentContext = {};

      if (!res.destroyed) {
        res.end();
      }

      console.log(`SSE connection cleaned up for session: ${sessionId}`);
    };

    // Handle client disconnect
    req.on("close", cleanup);
    req.on("error", (error) => {
      console.error(`SSE request error for session ${sessionId}:`, error);
      cleanup();
    });
    res.on("error", (error) => {
      console.error(`SSE response error for session ${sessionId}:`, error);
      cleanup();
    });

    // Handle the SSE request
    try {
      await sessionInfo.transport.handleRequest(req, res);
    } catch (error) {
      console.error(`SSE handling error for session ${sessionId}:`, error);
      cleanup();
    }
  });

  // DELETE /mcp — close session
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId) {
      res.status(400).json({ error: "Missing session ID" });
      return;
    }

    const sessionInfo = sessions.get(sessionId);
    if (!sessionInfo) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    try {
      // Set up request context for cleanup
      currentContext = {
        sessionId: sessionId,
        spotifyToken: sessionInfo.spotifyToken,
      };

      await sessionInfo.transport.handleRequest(req, res);
      sessions.delete(sessionId);
      console.log(`Session manually closed: ${sessionId}`);
    } catch (error) {
      console.error(`Error closing session ${sessionId}:`, error);
      res.status(500).json({ error: "Error closing session" });
    } finally {
      currentContext = {};
    }
  });

  // Spotify OAuth callback endpoint (optional, for easier token management)
  app.get("/auth/spotify/callback", (req: Request, res: Response) => {
    const code = req.query.code as string;
    const error = req.query.error as string;

    if (error) {
      res
        .status(400)
        .json({ error: "Spotify authorization failed", details: error });
      return;
    }

    if (!code) {
      res.status(400).json({ error: "Missing authorization code" });
      return;
    }

    // In a real implementation, you would exchange the code for an access token
    res.json({
      message:
        "Authorization code received. Exchange this for an access token using Spotify's token endpoint.",
      code,
      next_steps: [
        "Send a POST request to https://accounts.spotify.com/api/token",
        "Include the authorization code, client_id, client_secret, and redirect_uri",
        "Use the returned access_token with this MCP server",
      ],
    });
  });

  // Error handling middleware
  app.use(
    (error: Error, req: Request, res: Response, next: express.NextFunction) => {
      console.error("Express error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal server error",
          message: error.message,
        });
      }
    }
  );

  // Start server
  const PORT = process.env.PORT || 3002;
  const server_instance = app.listen(PORT, () => {
    console.log(`🎵 Spotify MCP Server running at http://localhost:${PORT}`);
    console.log(`💓 Health check at http://localhost:${PORT}/health`);
    console.log(`📊 Sessions info at http://localhost:${PORT}/sessions`);
    console.log(`📡 MCP endpoints at http://localhost:${PORT}/mcp`);
    console.log(
      `🎧 OAuth callback at http://localhost:${PORT}/auth/spotify/callback`
    );
    console.log(
      `🔑 Send Spotify tokens via 'X-Spotify-Token' header or 'Authorization: Bearer <token>'`
    );
    console.log(`🔒 Tokens are validated and stored securely per session`);
    console.log(
      `🎶 Available tools: search, playlists, playback control, recommendations`
    );
  });

  // Graceful shutdown
  const gracefulShutdown = () => {
    console.log("\n🛑 Shutting down server...");

    // Close all active sessions
    const sessionPromises = Array.from(sessions.entries()).map(
      async ([sessionId, sessionInfo]) => {
        try {
          console.log(`Closing session: ${sessionId}`);
          sessionInfo.transport.close();
        } catch (error) {
          console.error(`Error closing session ${sessionId}:`, error);
        }
      }
    );

    Promise.all(sessionPromises).finally(() => {
      sessions.clear();
      server_instance.close(() => {
        console.log("✅ Server shut down gracefully");
        process.exit(0);
      });
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.log("⚠️  Force closing server after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);
}

runServer().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
