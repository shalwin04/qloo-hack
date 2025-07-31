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
};
