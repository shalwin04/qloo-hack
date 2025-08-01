import { createBrowserRouter } from "react-router-dom";
// import App from "../App";
import CallbackPage from "../pages/CallbackPage";
import { SpotifyConnect } from "../components/SpotifyConnect";

const router = createBrowserRouter([
  {
    path: "/",
    element: <SpotifyConnect />,
  },
  {
    path: "/callback",
    element: <CallbackPage />,
  },
]);

export default router;
