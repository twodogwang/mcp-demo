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

    const heading = doc.children[0];
    expect(heading?.type).toBe("heading");
    if (heading?.type !== "heading") {
      throw new Error("expected heading node");
    }
    expect(heading.level).toBe(1);
    expect(heading.children).toEqual([{ type: "text", value: "权限矩阵" }]);

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

  it("preserves wrapper hierarchy in node paths", () => {
    const doc = parseHtmlDocument(`
      <div>
        <section>
          <p>嵌套段落</p>
        </section>
      </div>
      <p>同级段落</p>
    `);

    expect(doc.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", value: "嵌套段落" }],
      path: "root/0/0/0",
    });
    expect(doc.children[1]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", value: "同级段落" }],
      path: "root/1",
    });
  });

  it("keeps inline wrapper text in one paragraph", () => {
    const doc = parseHtmlDocument("<div>Hello <span>world</span></div>");

    expect(doc.children).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", value: "Hello world" }],
        path: "root/0",
      },
    ]);
  });

  it("converts br into inline text break before whitespace normalization", () => {
    const doc = parseHtmlDocument("<p>第一行<br>第二行</p>");

    expect(doc.children).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", value: "第一行 第二行" }],
        path: "root/0",
      },
    ]);
  });

  it("skips image nodes without src", () => {
    const doc = parseHtmlDocument(`
      <img alt="没有地址">
      <img src="">
      <img src="   ">
      <img src="https://img.example/ok.png">
    `);

    expect(doc.children).toEqual([
      {
        type: "image",
        resourceRef: "res-image-0",
        path: "root/0",
      },
    ]);
    expect(doc.resources).toEqual([
      {
        id: "res-image-0",
        type: "image",
        src: "https://img.example/ok.png",
        alt: null,
      },
    ]);
  });

  it("keeps images inside paragraph nodes as block children", () => {
    const doc = parseHtmlDocument(`
      <p><img src="https://img.example/p.png" alt="段落图"></p>
      <p>前文<img src="https://img.example/inline.png">后文</p>
    `);

    expect(doc.children).toEqual([
      {
        type: "image",
        resourceRef: "res-image-0",
        path: "root/0/0",
      },
      {
        type: "paragraph",
        children: [{ type: "text", value: "前文" }],
        path: "root/1/0",
      },
      {
        type: "image",
        resourceRef: "res-image-1",
        path: "root/1/1",
      },
      {
        type: "paragraph",
        children: [{ type: "text", value: "后文" }],
        path: "root/1/2",
      },
    ]);
    expect(doc.resources).toEqual([
      {
        id: "res-image-0",
        type: "image",
        src: "https://img.example/p.png",
        alt: "段落图",
      },
      {
        id: "res-image-1",
        type: "image",
        src: "https://img.example/inline.png",
        alt: null,
      },
    ]);
  });

  it("preserves stable ONES image metadata and deduplicates repeated data-uuid values", () => {
    const doc = parseHtmlDocument(`
      <figure>
        <img
          src="https://ones.example.internal/expired.png?signature=old"
          data-uuid="Btj2N3hz"
          data-ref-type="wiki"
          data-ref-id="page-ref-1"
          data-mime="image/png"
          alt="流程截图"
          width="640"
          height="360"
        >
        <figcaption>提现审核流程</figcaption>
      </figure>
      <img
        src="https://ones.example.internal/expired-again.png?signature=old"
        data-uuid="Btj2N3hz"
        data-ref-type="wiki"
        data-ref-id="page-ref-1"
      >
    `);

    expect(doc.resources).toHaveLength(1);
    expect(doc.resources[0]).toMatchObject({
      type: "image",
      src: "https://ones.example.internal/expired.png?signature=old",
      resource_id: "Btj2N3hz",
      ref_type: "wiki",
      ref_id: "page-ref-1",
      alt: "流程截图",
      caption: "提现审核流程",
      filename: "expired.png",
      mime_type: "image/png",
      width: 640,
      height: 360,
    });
    expect(doc.children.filter((node) => node.type === "image")).toHaveLength(2);
  });

  it("does not preserve images nested inside headings", () => {
    const doc = parseHtmlDocument("<h2>标题<img src=\"https://img.example/in-heading.png\"></h2>");

    expect(doc.children).toEqual([
      {
        type: "heading",
        level: 2,
        children: [{ type: "text", value: "标题" }],
        path: "root/0",
      },
    ]);
    expect(doc.resources).toEqual([]);
  });
});
