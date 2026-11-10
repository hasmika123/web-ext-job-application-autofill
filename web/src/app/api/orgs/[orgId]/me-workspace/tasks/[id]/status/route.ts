import { tasksStatus, type TasksParams } from "../../_bff/shared";

/** PUT .../tasks/{id}/status: NOT_STARTED, IN_PROGRESS, PENDING or DONE (the API stamps completed_at). */
export async function PUT(request: Request, { params }: { params: TasksParams }) {
  return tasksStatus(params, request);
}
