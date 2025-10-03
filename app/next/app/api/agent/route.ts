import type { NextRequest } from "next/server";
import { Manager } from "../../../../agents/manager";
import { runner } from "../../../../orchestrator/runner";
import { createWorkspace } from "../../../../state/workspace";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  const payload = await request.json();
  const prompt =
    typeof payload?.prompt === "string" ? payload.prompt : "Say hello";
  const workspace = createWorkspace();

  // TODO: Upgrade this endpoint to stream tokens (StreamedRunResult.toTextStream wrapped in a ReadableStream/SSE)
  //       and expose a follow-up route (e.g., POST /api/agent/interruptions) that resumes runs after HITL approvals.
  const result = await runner.run(Manager, prompt, { context: workspace });

  return Response.json({
    finalOutput: result.finalOutput,
    vfsPaths: Array.from(workspace.vfs.keys()),
  });
}
