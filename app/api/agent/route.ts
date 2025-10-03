import { NextResponse } from "next/server";
import { managerAgent } from "@/agents/manager";
import { researcherAgent } from "@/agents/researcher";
import { runOnce } from "@/orchestrator/runner";
import { WorkspaceState } from "@/state/workspace";

type RequestBody = {
  message: string;
  agent: "manager" | "researcher";
  history?: Array<{ role: string; content: string }>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const { message, agent } = body;

    if (!message?.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const selectedAgent =
      agent === "researcher" ? researcherAgent : managerAgent;
    const workspace = new WorkspaceState();

    const result = await runOnce(selectedAgent, message, workspace);

    const response = result.messages
      .filter((msg) => msg.role === "assistant")
      .map((msg) => {
        if (typeof msg.content === "string") {
          return msg.content;
        }
        if (Array.isArray(msg.content)) {
          return msg.content
            .filter((part) => part.type === "text")
            .map((part) => ("text" in part ? part.text : ""))
            .join("\n");
        }
        return "";
      })
      .join("\n\n");

    return NextResponse.json({
      response: response || "Agent completed without a response",
      operations: workspace.ops,
      vfsSize: workspace.vfs.size,
    });
  } catch (error) {
    console.error("Agent error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}
