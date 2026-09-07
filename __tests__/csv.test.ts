import { csvField, toCsv } from "../lib/csv";

describe("csvField", () => {
  it("leaves a plain value alone", () => {
    expect(csvField("Bloomburrow")).toBe("Bloomburrow");
    expect(csvField(12.5)).toBe("12.5");
  });

  it("quotes a value containing a comma", () => {
    // Card names routinely contain commas; a naive join misaligns every column
    // after the first one of these.
    expect(csvField("Jinnie Fay, Jetmir's Second")).toBe('"Jinnie Fay, Jetmir\'s Second"');
  });

  it("doubles embedded quotes", () => {
    expect(csvField('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("quotes a value containing a newline", () => {
    expect(csvField("line one\nline two")).toBe('"line one\nline two"');
  });

  it("renders null and undefined as empty, not as the words", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });
});

describe("toCsv", () => {
  it("writes a header row and CRLF line endings", () => {
    const csv = toCsv(["a", "b"], [[1, 2]]);
    expect(csv).toBe("a,b\r\n1,2\r\n");
  });

  it("survives a row with commas and quotes", () => {
    const csv = toCsv(["name", "qty"], [['Jinnie Fay, "Jetmir\'s Second"', 2]]);
    const [, row] = csv.trimEnd().split("\r\n");
    expect(row).toBe('"Jinnie Fay, ""Jetmir\'s Second""",2');
  });

  it("handles an empty set of rows", () => {
    expect(toCsv(["a"], [])).toBe("a\r\n");
  });
});
