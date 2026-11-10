import { tasksRead, type TasksParams } from "../_bff/shared";

/** GET .../tasks/list: one filtered, sorted, paged slice of the caller's tasks (the table) with the tab counts. */
export async function GET(request: Request, { params }: { params: TasksParams }) {
  return tasksRead(params, "/list", new URL(request.url).search);
}
