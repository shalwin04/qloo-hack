# Qloo Hack

A hackathon project featuring a Node.js TypeScript backend and Spotify MCP server integration.

## Project Structure

```
qloo-hack/
├── backend/                    # Node.js TypeScript backend
│   ├── src/
│   │   └── index.ts           # Main Express server
│   ├── package.json           # Backend dependencies
│   ├── tsconfig.json          # TypeScript configuration
│   └── nodemon.json           # Development configuration
└── mcp-servers/
    └── spotify-mcp-server/    # Spotify Model Context Protocol server
```

## Getting Started

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

The backend server will be available at `http://localhost:3000`

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the TypeScript project
- `npm start` - Run the compiled JavaScript
- `npm run clean` - Remove build directory

## Features

- TypeScript-based Express.js backend
- Spotify MCP server integration for AI-powered music control
- Development setup with hot reload
- Proper TypeScript configuration with strict settings

## Development

The backend includes:
- Express.js server with TypeScript
- Health check endpoint at `/health`
- JSON middleware for API requests
- Development tools (nodemon, ts-node)

## License

MIT
