export type CsvColumn<T> = {
  header: string;
  value: (row: T) => unknown;
};

function escapeCell(value: string) {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]) {
  const lines = [columns.map((column) => escapeCell(column.header)).join(",")];
  for (const row of rows)
    lines.push(
      columns
        .map((column) => escapeCell(String(column.value(row) ?? "")))
        .join(","),
    );
  // Excel needs a BOM to read UTF-8 exports correctly.
  return "\uFEFF" + lines.join("\r\n");
}
