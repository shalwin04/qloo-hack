import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { google } from 'googleapis';
import WebSocket from 'ws';
import dotenv from 'dotenv'

dotenv.config();

// YouTube API configuration
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8080/callback';

interface YouTubeCredentials {
  access_token: string;
  refresh_token: string;
  expiry_date?: number;
}

class YouTubeMCPServer {
  private server: Server;
  private wsServer?: WebSocket.Server;
  private youtube: any;
  private oauth2Client: any;
  private userCredentials: YouTubeCredentials | null = null;

  constructor() {
    this.server = new Server(
      {
        name: "youtube-mcp-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.initializeGoogleAuth();
    this.setupHandlers();
  }

  private initializeGoogleAuth() {
    this.oauth2Client = new google.auth.OAuth2(
      CLIENT_ID,
      CLIENT_SECRET,
      REDIRECT_URI
    );

    this.youtube = google.youtube({
      version: 'v3',
      auth: this.oauth2Client
    });
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "search_videos",
            description: "Search for YouTube videos",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query for videos"
                },
                maxResults: {
                  type: "number",
                  description: "Maximum number of results to return (default: 10)",
                  default: 10
                },
                order: {
                  type: "string",
                  description: "Order of results (relevance, date, rating, viewCount, title)",
                  enum: ["relevance", "date", "rating", "viewCount", "title"],
                  default: "relevance"
                }
              },
              required: ["query"]
            }
          },
          {
            name: "get_video_details",
            description: "Get detailed information about a specific video",
            inputSchema: {
              type: "object",
              properties: {
                videoId: {
                  type: "string",
                  description: "YouTube video ID"
                }
              },
              required: ["videoId"]
            }
          },
          {
            name: "get_channel_info",
            description: "Get information about a YouTube channel",
            inputSchema: {
              type: "object",
              properties: {
                channelId: {
                  type: "string",
                  description: "YouTube channel ID"
                }
              },
              required: ["channelId"]
            }
          },
          {
            name: "get_user_playlists",
            description: "Get user's playlists (requires authentication)",
            inputSchema: {
              type: "object",
              properties: {
                maxResults: {
                  type: "number",
                  description: "Maximum number of playlists to return",
                  default: 25
                }
              }
            }
          },
          {
            name: "create_playlist",
            description: "Create a new playlist (requires authentication)",
            inputSchema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Playlist title"
                },
                description: {
                  type: "string",
                  description: "Playlist description"
                },
                privacy: {
                  type: "string",
                  description: "Playlist privacy status",
                  enum: ["private", "public", "unlisted"],
                  default: "private"
                }
              },
              required: ["title"]
            }
          },
          {
            name: "add_video_to_playlist",
            description: "Add a video to a playlist (requires authentication)",
            inputSchema: {
              type: "object",
              properties: {
                playlistId: {
                  type: "string",
                  description: "Playlist ID"
                },
                videoId: {
                  type: "string",
                  description: "Video ID to add"
                }
              },
              required: ["playlistId", "videoId"]
            }
          },
          {
            name: "authenticate_user",
            description: "Authenticate user with Google OAuth2",
            inputSchema: {
              type: "object",
              properties: {
                authCode: {
                  type: "string",
                  description: "Authorization code from OAuth2 flow"
                }
              },
              required: ["authCode"]
            }
          },
          {
            name: "get_auth_url",
            description: "Get OAuth2 authentication URL",
            inputSchema: {
              type: "object",
              properties: {}
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "search_videos":
            return await this.searchVideos(args);
          case "get_video_details":
            return await this.getVideoDetails(args);
          case "get_channel_info":
            return await this.getChannelInfo(args);
          case "get_user_playlists":
            return await this.getUserPlaylists(args);
          case "create_playlist":
            return await this.createPlaylist(args);
          case "add_video_to_playlist":
            return await this.addVideoToPlaylist(args);
          case "authenticate_user":
            return await this.authenticateUser(args);
          case "get_auth_url":
            return await this.getAuthUrl();
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing ${name}: ${errorMessage}`
        );
      }
    });
  }

  private async searchVideos(args: any) {
    const { query, maxResults = 10, order = 'relevance' } = args;

    const response = await this.youtube.search.list({
      part: ['snippet'],
      q: query,
      type: 'video',
      maxResults,
      order,
      key: YOUTUBE_API_KEY
    });

    const videos = response.data.items.map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      thumbnails: item.snippet.thumbnails,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            query,
            totalResults: response.data.pageInfo.totalResults,
            videos
          }, null, 2)
        }
      ]
    };
  }

  private async getVideoDetails(args: any) {
    const { videoId } = args;

    const response = await this.youtube.videos.list({
      part: ['snippet', 'statistics', 'contentDetails'],
      id: [videoId],
      key: YOUTUBE_API_KEY
    });

    if (response.data.items.length === 0) {
      throw new Error(`Video not found: ${videoId}`);
    }

    const video = response.data.items[0];
    const videoDetails = {
      videoId: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      channelTitle: video.snippet.channelTitle,
      channelId: video.snippet.channelId,
      publishedAt: video.snippet.publishedAt,
      duration: video.contentDetails.duration,
      viewCount: video.statistics.viewCount,
      likeCount: video.statistics.likeCount,
      commentCount: video.statistics.commentCount,
      thumbnails: video.snippet.thumbnails,
      url: `https://www.youtube.com/watch?v=${video.id}`
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(videoDetails, null, 2)
        }
      ]
    };
  }

  private async getChannelInfo(args: any) {
    const { channelId } = args;

    const response = await this.youtube.channels.list({
      part: ['snippet', 'statistics', 'brandingSettings'],
      id: [channelId],
      key: YOUTUBE_API_KEY
    });

    if (response.data.items.length === 0) {
      throw new Error(`Channel not found: ${channelId}`);
    }

    const channel = response.data.items[0];
    const channelInfo = {
      channelId: channel.id,
      title: channel.snippet.title,
      description: channel.snippet.description,
      customUrl: channel.snippet.customUrl,
      publishedAt: channel.snippet.publishedAt,
      thumbnails: channel.snippet.thumbnails,
      subscriberCount: channel.statistics.subscriberCount,
      videoCount: channel.statistics.videoCount,
      viewCount: channel.statistics.viewCount,
      url: `https://www.youtube.com/channel/${channel.id}`
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(channelInfo, null, 2)
        }
      ]
    };
  }

  private async getUserPlaylists(args: any) {
    if (!this.userCredentials) {
      throw new Error("User authentication required. Use authenticate_user first.");
    }

    this.oauth2Client.setCredentials(this.userCredentials);
    const { maxResults = 25 } = args;

    const response = await this.youtube.playlists.list({
      part: ['snippet', 'contentDetails'],
      mine: true,
      maxResults
    });

    const playlists = response.data.items.map((item: any) => ({
      playlistId: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
      itemCount: item.contentDetails.itemCount,
      thumbnails: item.snippet.thumbnails,
      url: `https://www.youtube.com/playlist?list=${item.id}`
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ playlists }, null, 2)
        }
      ]
    };
  }

  private async createPlaylist(args: any) {
    if (!this.userCredentials) {
      throw new Error("User authentication required. Use authenticate_user first.");
    }

    this.oauth2Client.setCredentials(this.userCredentials);
    const { title, description = '', privacy = 'private' } = args;

    const response = await this.youtube.playlists.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description
        },
        status: {
          privacyStatus: privacy
        }
      }
    });

    const playlist = {
      playlistId: response.data.id,
      title: response.data.snippet.title,
      description: response.data.snippet.description,
      privacyStatus: response.data.status.privacyStatus,
      url: `https://www.youtube.com/playlist?list=${response.data.id}`
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ message: "Playlist created successfully", playlist }, null, 2)
        }
      ]
    };
  }

  private async addVideoToPlaylist(args: any) {
    if (!this.userCredentials) {
      throw new Error("User authentication required. Use authenticate_user first.");
    }

    this.oauth2Client.setCredentials(this.userCredentials);
    const { playlistId, videoId } = args;

    const response = await this.youtube.playlistItems.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          playlistId,
          resourceId: {
            kind: 'youtube#video',
            videoId
          }
        }
      }
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ 
            message: "Video added to playlist successfully",
            playlistItemId: response.data.id 
          }, null, 2)
        }
      ]
    };
  }

  private async authenticateUser(args: any) {
    const { authCode } = args;

    try {
      const { tokens } = await this.oauth2Client.getToken(authCode);
      this.userCredentials = {
        access_token: tokens.access_token!,
        refresh_token: tokens.refresh_token!,
        expiry_date: tokens.expiry_date
      };

      this.oauth2Client.setCredentials(tokens);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ 
              message: "Authentication successful",
              authenticated: true 
            }, null, 2)
          }
        ]
      };
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Authentication failed: ${errorMessage}`);
    }
  }

  private async getAuthUrl() {
    const scopes = [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube'
    ];

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ 
            authUrl,
            message: "Visit this URL to authenticate with Google and get the authorization code"
          }, null, 2)
        }
      ]
    };
  }

  // WebSocket server for internet communication
  startWebSocketServer(port: number = 8081) {
    this.wsServer = new WebSocket.Server({ port });

    this.wsServer.on('connection', (ws) => {
      console.log('WebSocket client connected');

      ws.on('message', async (message) => {
        let request;
        try {
          request = JSON.parse(message.toString());
          
          if (request.method === 'tools/list') {
            const response = await this.server.request(
              { method: 'tools/list', params: {} },
              ListToolsRequestSchema
            );
            ws.send(JSON.stringify({ id: request.id, result: response }));
          } else if (request.method === 'tools/call') {
            const response = await this.server.request(
              { method: 'tools/call', params: request.params },
              CallToolRequestSchema
            );
            ws.send(JSON.stringify({ id: request.id, result: response }));
          }
        } catch (error) {
          const errorId = request?.id || 'unknown';
          ws.send(JSON.stringify({ 
            id: errorId,
            error: { 
              message: error instanceof Error ? error.message : 'An unknown error occurred'
            } 
          }));
        }
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
      });
    });

    console.log(`YouTube MCP WebSocket server started on port ${port}`);
  }

  async run() {
    // Start WebSocket server for internet communication
    this.startWebSocketServer();

    // Also support stdio transport for local communication
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log("YouTube MCP Server running on stdio transport");
  }
}

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new YouTubeMCPServer();
  server.run().catch(console.error);
}

export default YouTubeMCPServer;