import { describe, expect, it } from "vitest";
import { parseHtmlDocument } from "../../src/documents/parse-html";

describe("parseHtmlDocument", () => {
  it("preserves nested tables and image nodes", () => {
    const doc = parseHtmlDocument(`
      <h1>权限矩阵</h1>
      <table>
        <tr>
          <td>
            <p>管理员</p>
            <table><tr><td>子表</td></tr></table>
          </td>
          <td><img src="https://img.example/1.png" alt="流程图"></td>
        </tr>
      </table>
    `);

    expect(doc.children[1]?.type).toBe("table");
    const table = doc.children[1];
    expect(table?.type).toBe("table");
    if (table?.type !== "table") {
      throw new Error("expected top-level table node");
    }

    const firstCellChildren = table.rows[0]?.cells[0]?.children ?? [];
    expect(firstCellChildren[0]?.type).toBe("paragraph");
    expect(firstCellChildren[1]?.type).toBe("table");

    const secondCellChildren = table.rows[0]?.cells[1]?.children ?? [];
    expect(secondCellChildren[0]?.type).toBe("image");
    expect(doc.resources[0]).toMatchObject({
      type: "image",
      src: "https://img.example/1.png",
      alt: "流程图",
    });
  });
});
