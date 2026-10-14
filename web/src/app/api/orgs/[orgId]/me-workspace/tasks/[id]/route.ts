import { tasksDelete, tasksWrite, type TasksParams } from "../_bff/shared";

/** PUT .../tasks/{id}: replaces the editable fields of one of the caller's own tasks. */
export async function PUT(request: Request, { params }: { params: TasksParams }) {
  return tasksWrite(params, request, "PUT");
}

/** DELETE .../tasks/{id}: deletes one of the caller's own tasks (the page sends it when its undo window ends). */
export async function DELETE(_request: Request, { params }: { params: TasksParams }) {
  return tasksDelete(params);
}
