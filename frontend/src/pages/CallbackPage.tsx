import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

const CallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const code = searchParams.get("code");

  useEffect(() => {
    if (code) {
      fetch("http://localhost:3000/api/spotify/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error("Failed to get access token");
          }
          return res.json();
        })
        .then((data) => {
          // Store the token in localStorage or your preferred state management
          localStorage.setItem("spotifyToken", data.access_token);
          toast.success("Successfully connected to Spotify!");
          navigate("/");
        })
        .catch((error) => {
          toast.error("Failed to connect to Spotify: " + error.message);
          navigate("/");
        });
    }
  }, [code, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Connecting to Spotify...</h1>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    </div>
  );
};

export default CallbackPage;
