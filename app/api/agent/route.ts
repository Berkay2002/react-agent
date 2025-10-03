/** biome-ignore-all lint/suspicious/noConsole: <Dev> */
import { NextResponse } from "next/server";
import { Manager } from "@/agents/manager";
import { Researcher } from "@/agents/researcher";
import { runOnce } from "@/orchestrator/runner";
import { createWorkspace } from "@/state/workspace";

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

    const selectedAgent = agent === "researcher" ? Researcher : Manager;
    const workspace = createWorkspace();

    const result = await runOnce(selectedAgent, message, workspace);

    return NextResponse.json({
      response: result.finalOutput ?? "Agent completed without a response",
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
