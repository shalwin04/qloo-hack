import React from "react";

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID; // Store this in .env
const REDIRECT_URI = "http://127.0.0.1:5173/callback"; // E.g. http://localhost:5173/callback

export const SpotifyConnect: React.FC = () => {
  const handleConnect = () => {
    const authURL = new URL("https://accounts.spotify.com/authorize");

    const SCOPES = [
      "user-read-private",
      "user-read-email",
      "playlist-read-private",
      "user-top-read",
    ];

    authURL.searchParams.append("client_id", CLIENT_ID);
    authURL.searchParams.append("response_type", "code");
    authURL.searchParams.append("redirect_uri", REDIRECT_URI);
    authURL.searchParams.append("scope", SCOPES.join(" "));
    authURL.searchParams.append("show_dialog", "true");

    window.location.href = authURL.toString();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-green-400 via-black to-black text-white px-4">
      <div className="bg-[#1DB954] p-10 rounded-2xl shadow-2xl w-full max-w-md text-center">
        <h1 className="text-3xl font-bold mb-4">Connect with Spotify</h1>
        <p className="mb-6 text-white/80">
          Authorize with Spotify to start exploring your music stats.
        </p>
        <button
          onClick={handleConnect}
          className="w-full py-3 px-6 rounded-xl text-lg font-semibold bg-black hover:bg-gray-800 transition"
        >
          Connect with Spotify
        </button>
      </div>
    </div>
  );
};
