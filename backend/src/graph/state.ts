import { Annotation } from "@langchain/langgraph";

export const graphStateDef = {
  userPreferences: Annotation<{
    favoriteGenres: string[];
    favoriteArtists: string[];
    favoriteMovies: string[];
    interests: string[];
  }>({
    reducer: (x, y) => y ?? x,
    default: () => ({
      favoriteGenres: [],
      favoriteArtists: [],
      favoriteMovies: [],
      interests: [],
    }),
  }),

  qlooInsights: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => ({}),
  }),

  chatHistory: Annotation<
    { role: "user" | "ai"; content: string }[]
  >({
    reducer: (x, y) => [...(x ?? []), ...(y ?? [])],
    default: () => [],
  }),

  sessionMeta: Annotation<{
    sessionId: string;
    timestamp: string;
  }>({
    reducer: (x, y) => y ?? x,
    default: () => ({
      sessionId: "",
      timestamp: new Date().toISOString(),
    }),
  }),
};
