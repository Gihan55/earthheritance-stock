import { describe, expect, it } from "vitest";
import { toCsv } from "../src/lib/csv";

describe("toCsv", () => {
  const columns = [
    { header: "Name", value: (row: { name: string; note: string }) => row.name },
    { header: "Note", value: (row: { name: string; note: string }) => row.note },
  ];
  it("emits a BOM, CRLF line endings, and a header row", () => {
    const csv = toCsv(columns, [{ name: "Coir", note: "dry" }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Name,Note");
    expect(lines[1]).toBe("Coir,dry");
  });
  it("quotes cells containing commas, quotes, or newlines", () => {
    const csv = toCsv(columns, [
      { name: 'Husk "A"', note: "line1\nline2" },
    ]);
    expect(csv).toContain('"Husk ""A"""');
    expect(csv).toContain('"line1\nline2"');
  });
  it("renders null and undefined cells as empty strings", () => {
    const csv = toCsv(
      [{ header: "X", value: () => null }],
      [{},],
    );
    expect(csv.slice(1)).toBe("X\r\n");
  });
});
