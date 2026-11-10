import { describe, expect, it } from "vitest";
import { DATE_OK, formatDate, normalizeDate, parseDateInput } from "./dates";

describe("date helpers", () => {
  it("normalises MM/YYYY and YYYY/MM", () => {
    expect(normalizeDate("6/2022")).toBe("2022-06");
    expect(normalizeDate(" 11.2020 ")).toBe("2020-11");
    expect(normalizeDate("2019/3")).toBe("2019-03");
    expect(normalizeDate("2022")).toBe("2022");
  });

  it("matches the server's date rule", () => {
    for (const ok of ["2022", "2022-06", "1999-12"]) expect(DATE_OK.test(ok)).toBe(true);
    for (const bad of ["22", "2022-13", "2022-6", "1899", "June 2022"]) expect(DATE_OK.test(bad)).toBe(false);
  });

  it("reads month-year as people write it", () => {
    expect(parseDateInput("Mar 2022")).toBe("2022-03");
    expect(parseDateInput("March 2022")).toBe("2022-03");
    expect(parseDateInput("sept 2021")).toBe("2021-09");
    expect(parseDateInput("Dec. 2019")).toBe("2019-12");
    expect(parseDateInput("03/2022")).toBe("2022-03");
    expect(parseDateInput("2022")).toBe("2022");
    expect(DATE_OK.test(parseDateInput("Mar 22"))).toBe(false);
    expect(DATE_OK.test(parseDateInput("Foo 2022"))).toBe(false);
  });

  it("shows a stored date as month-year", () => {
    expect(formatDate("2022-03")).toBe("Mar 2022");
    expect(formatDate("2022")).toBe("2022");
    expect(formatDate(null)).toBe("");
    expect(formatDate("2022-13")).toBe("2022-13");
  });
});
