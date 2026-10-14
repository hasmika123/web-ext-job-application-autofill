import { tasksRead, tasksWrite, type TasksParams } from "./_bff/shared";

/** GET /api/orgs/{orgId}/me-workspace/tasks: the signed-in consultant's own Tasks and Follow-ups page (optional filters, sort and paging). */
export async function GET(request: Request, { params }: { params: TasksParams }) {
  return tasksRead(params, "", new URL(request.url).search);
}

/** POST .../tasks: creates a task for the caller (title, optional due date / priority / type / linked job). */
export async function POST(request: Request, { params }: { params: TasksParams }) {
  return tasksWrite(params, request, "POST");
}
