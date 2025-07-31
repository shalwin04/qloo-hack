import { START, END, StateGraph } from "@langchain/langgraph";
import { graphStateDef } from "./state";
import { fetchQlooInsights } from "./nodes/qlooNode";

const graph = new StateGraph(graphStateDef)
  .addNode("fetchQlooInsights", fetchQlooInsights)
  .addEdge(START, "fetchQlooInsights")
  .addEdge("fetchQlooInsights", END);

export const compiledGraph = graph.compile();
