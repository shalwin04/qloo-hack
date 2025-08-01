import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

export async function personalizedChatAgent(state: any) {
  const { userPreferences, qlooInsights, chatHistory } = state;

  const systemPrompt = `
You are a highly personalized AI chat companion.

Respond to the user based on their preferences and Qloo insights. Be helpful, witty, and relevant.

Preferences:
${JSON.stringify(userPreferences, null, 2)}

Qloo Insights:
${JSON.stringify(qlooInsights, null, 2)}

Chat so far:
${chatHistory.map((m: { role: string; content: any; }) => `${m.role === "user" ? "User" : "You"}: ${m.content}`).join("\n")}
`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
  });

  const reply = await result.response.text();

  return {
    ...state,
    chatHistory: [
      ...chatHistory,
      { role: "agent", content: reply.trim() },
    ],
  };
}
