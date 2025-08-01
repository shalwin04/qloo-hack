import { createBrowserRouter } from "react-router-dom";
import { SpotifyConnect } from "./components/SpotifyConnect";

const router = createBrowserRouter([
  {
    path: "/",
    element: <SpotifyConnect />,
  },
]);

export { router };
