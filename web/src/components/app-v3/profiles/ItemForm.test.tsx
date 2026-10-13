import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ItemApiError } from "@/lib/profile-items";
import ItemForm from "./ItemForm";

afterEach(cleanup);

const limits = { bullets: 4, bulletChars: 80 };
const bullets = () => screen.getAllByLabelText(/^Bullet \d+$/) as HTMLTextAreaElement[];

function setup(onSave = vi.fn().mockResolvedValue(undefined), initial: Record<string, unknown> | null = null) {
  const onCancel = vi.fn();
  render(<ItemForm section="EXPERIENCE" initial={initial} limits={limits} onSave={onSave} onCancel={onCancel} />);
  return { onSave, onCancel };
}

describe("ItemForm", () => {
  it("shows required-field errors and does not save", async () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add role" }));
    expect(await screen.findByText("Job title is required.")).toBeTruthy();
    expect(screen.getByText("Company is required.")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Enter in a bullet starts the next bullet and focuses it", () => {
    setup();
    expect(bullets()).toHaveLength(1);
    fireEvent.change(bullets()[0], { target: { value: "First" } });
    fireEvent.keyDown(bullets()[0], { key: "Enter" });
    expect(bullets()).toHaveLength(2);
    expect(document.activeElement).toBe(bullets()[1]);
    // The limit comes from the settings, not the component.
    fireEvent.keyDown(bullets()[1], { key: "Enter" });
    fireEvent.keyDown(bullets()[2], { key: "Enter" });
    fireEvent.keyDown(bullets()[3], { key: "Enter" });
    expect(bullets()).toHaveLength(4);
  });

  it("Backspace in an empty bullet removes it", () => {
    setup(undefined, { title: "T", org: "O", bullets: [{ text: "a" }, { text: "" }] });
    expect(bullets()).toHaveLength(2);
    fireEvent.keyDown(bullets()[1], { key: "Backspace" });
    expect(bullets()).toHaveLength(1);
    expect(bullets()[0].value).toBe("a");
  });

  it("saves the cleaned item", async () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText(/Job title/), { target: { value: " Engineer " } });
    fireEvent.change(screen.getByLabelText(/Company/), { target: { value: "Acme" } });
    fireEvent.change(bullets()[0], { target: { value: "Shipped it" } });
    fireEvent.click(screen.getByRole("button", { name: "Add role" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({ title: "Engineer", org: "Acme", bullets: [{ text: "Shipped it", src: "user" }] });
  });

  it("refuses a never-collected value before saving", async () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText(/Job title/), { target: { value: "Engineer" } });
    fireEvent.change(screen.getByLabelText(/Company/), { target: { value: "Acme" } });
    fireEvent.change(bullets()[0], { target: { value: "SSN 123-45-6789" } });
    fireEvent.click(screen.getByRole("button", { name: "Add role" }));
    expect(await screen.findByText(/We never store a Social Security/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the API's refusal and keeps the form open for re-saving", async () => {
    const refused = new ItemApiError(422, { code: "SENSITIVE_CONTENT", path: "dataJson.org", class: "DOB" }, "x");
    const onSave = vi.fn().mockRejectedValueOnce(refused).mockResolvedValue(undefined);
    setup(onSave);
    fireEvent.change(screen.getByLabelText(/Job title/), { target: { value: "Engineer" } });
    fireEvent.change(screen.getByLabelText(/Company/), { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Add role" }));
    expect(await screen.findByText(/We never store a date of birth/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add role" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  });

  it("disables End for a current role and drops it from the saved item", async () => {
    const { onSave } = setup(undefined, { title: "T", org: "O", start: "2020-01", end: "2021-01" });
    fireEvent.click(screen.getByLabelText("I currently work here"));
    expect((screen.getByLabelText("End") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ title: "T", current: true });
    expect(onSave.mock.calls[0][0]).not.toHaveProperty("end");
  });

  it("Cancel calls onCancel", () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
