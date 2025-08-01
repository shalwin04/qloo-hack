import { START, END, StateGraph } from "@langchain/langgraph";
import { graphStateDef } from "./state";
import { fetchQlooInsights } from "./nodes/qlooNode";
import { personalizedChatAgent } from "./nodes/personalizedChatAgent";

const graph = new StateGraph(graphStateDef)
  .addNode("fetchQlooInsights", fetchQlooInsights)
  .addNode("personalizedChatAgent", personalizedChatAgent)

  
  .addEdge(START, "fetchQlooInsights")
  .addEdge("fetchQlooInsights","personalizedChatAgent")
  .addEdge("personalizedChatAgent", END);

export const compiledGraph = graph.compile();
