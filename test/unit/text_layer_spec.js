/* Copyright 2022 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { buildGetDocumentParams } from "./test_utils.js";
import { getDocument } from "../../src/display/api.js";
import { isNodeJS } from "../../src/shared/util.js";
import { TextLayer } from "../../src/display/text_layer.js";
import { TextLayerBuilder } from "../../web/text_layer_builder.js";

describe("textLayer", function () {
  it("creates textLayer from ReadableStream", async function () {
    if (isNodeJS) {
      pending("document.createElement is not supported in Node.js.");
    }
    const loadingTask = getDocument(buildGetDocumentParams("basicapi.pdf"));
    const pdfDocument = await loadingTask.promise;
    const page = await pdfDocument.getPage(1);

    const textLayer = new TextLayer({
      textContentSource: page.streamTextContent(),
      container: document.createElement("div"),
      viewport: page.getViewport({ scale: 1 }),
    });
    await textLayer.render();

    expect(textLayer.textContentItemsStr).toEqual([
      "Table Of Content",
      "",
      "Chapter 1",
      " ",
      "..........................................................",
      " ",
      "2",
      "",
      "Paragraph 1.1",
      " ",
      "......................................................",
      " ",
      "3",
      "",
      "page 1 / 3",
    ]);

    await loadingTask.destroy();
  });

  it("creates textLayer from TextContent", async function () {
    if (isNodeJS) {
      pending("document.createElement is not supported in Node.js.");
    }
    const loadingTask = getDocument(buildGetDocumentParams("basicapi.pdf"));
    const pdfDocument = await loadingTask.promise;
    const page = await pdfDocument.getPage(1);

    const textLayer = new TextLayer({
      textContentSource: await page.getTextContent(),
      container: document.createElement("div"),
      viewport: page.getViewport({ scale: 1 }),
    });
    await textLayer.render();

    expect(textLayer.textContentItemsStr).toEqual([
      "Table Of Content",
      "",
      "Chapter 1",
      " ",
      "..........................................................",
      " ",
      "2",
      "",
      "Paragraph 1.1",
      " ",
      "......................................................",
      " ",
      "3",
      "",
      "page 1 / 3",
    ]);

    await loadingTask.destroy();
  });

  it("creates textLayers in parallel, from ReadableStream", async function () {
    if (isNodeJS) {
      pending("document.createElement is not supported in Node.js.");
    }
    if (typeof ReadableStream.from !== "function") {
      pending("ReadableStream.from is not supported.");
    }
    const getTransform = container => {
      const transform = [];

      for (const { style } of container.childNodes) {
        transform.push({
          fontHeight: style.getPropertyValue("--font-height"),
          scaleX: style.getPropertyValue("--scale-x"),
          rotate: style.getPropertyValue("--rotate"),
        });
      }
      return transform;
    };

    const loadingTask = getDocument(buildGetDocumentParams("basicapi.pdf"));
    const pdfDocument = await loadingTask.promise;
    const [page1, page2] = await Promise.all([
      pdfDocument.getPage(1),
      pdfDocument.getPage(2),
    ]);

    // Create text-content streams with dummy content.
    const items1 = [
      {
        str: "Chapter A",
        dir: "ltr",
        width: 100,
        height: 20,
        transform: [20, 0, 0, 20, 45, 744],
        fontName: "g_d0_f1",
        hasEOL: false,
      },
      {
        str: "page 1",
        dir: "ltr",
        width: 50,
        height: 20,
        transform: [20, 0, 0, 20, 45, 744],
        fontName: "g_d0_f1",
        hasEOL: false,
      },
    ];
    const items2 = [
      {
        str: "Chapter B",
        dir: "ltr",
        width: 120,
        height: 10,
        transform: [10, 0, 0, 10, 492, 16],
        fontName: "g_d0_f2",
        hasEOL: false,
      },
      {
        str: "page 2",
        dir: "ltr",
        width: 60,
        height: 10,
        transform: [10, 0, 0, 10, 492, 16],
        fontName: "g_d0_f2",
        hasEOL: false,
      },
    ];

    const styles = {
      g_d0_f1: {
        ascent: 0.75,
        descent: -0.25,
        fontFamily: "serif",
        vertical: false,
      },
      g_d0_f2: {
        ascent: 0.5,
        descent: -0.5,
        fontFamily: "sans-serif",
        vertical: false,
      },
    };
    const lang = "en";

    // Render the textLayers serially, to have something to compare against.
    const serialContainer1 = document.createElement("div"),
      serialContainer2 = document.createElement("div");

    const serialTextLayer1 = new TextLayer({
      textContentSource: { items: items1, styles, lang },
      container: serialContainer1,
      viewport: page1.getViewport({ scale: 1 }),
    });
    await serialTextLayer1.render();

    const serialTextLayer2 = new TextLayer({
      textContentSource: { items: items2, styles, lang },
      container: serialContainer2,
      viewport: page2.getViewport({ scale: 1 }),
    });
    await serialTextLayer2.render();

    const serialTransform1 = getTransform(serialContainer1),
      serialTransform2 = getTransform(serialContainer2);

    expect(serialTransform1.length).toEqual(2);
    expect(serialTransform2.length).toEqual(2);

    // Reset any global textLayer-state before rendering in parallel.
    TextLayer.cleanup();

    const container1 = document.createElement("div"),
      container2 = document.createElement("div");
    const waitCapability1 = Promise.withResolvers();

    const streamGenerator1 = (async function* () {
      for (const item of items1) {
        yield { items: [item], styles, lang };
        await waitCapability1.promise;
      }
    })();
    const streamGenerator2 = (async function* () {
      for (const item of items2) {
        yield { items: [item], styles, lang };
      }
    })();

    const textLayer1 = new TextLayer({
      textContentSource: ReadableStream.from(streamGenerator1),
      container: container1,
      viewport: page1.getViewport({ scale: 1 }),
    });
    const textLayer1Promise = textLayer1.render();

    const textLayer2 = new TextLayer({
      textContentSource: ReadableStream.from(streamGenerator2),
      container: container2,
      viewport: page2.getViewport({ scale: 1 }),
    });
    await textLayer2.render();

    // Ensure that the first textLayer has its rendering "paused" while
    // the second textLayer renders.
    waitCapability1.resolve();
    await textLayer1Promise;

    // Sanity check to make sure that all text was parsed.
    expect(textLayer1.textContentItemsStr).toEqual(["Chapter A", "page 1"]);
    expect(textLayer2.textContentItemsStr).toEqual(["Chapter B", "page 2"]);

    // Ensure that the transforms are identical when parsing in series/parallel.
    const transform1 = getTransform(container1),
      transform2 = getTransform(container2);

    expect(transform1).toEqual(serialTransform1);
    expect(transform2).toEqual(serialTransform2);

    await loadingTask.destroy();
  });
});

describe("textLayerBuilder global selection", function () {
  // @behavior pdfjs.selection.surviving-viewer
  // @boundary before=two rendered layers at=first viewer aborts
  // after=the surviving viewer releases its selection
  // @red the first viewer's abort removes the second viewer's listeners
  // @green listeners live until the last registered layer is removed
  it("keeps the remaining viewer's selection listeners after another viewer closes", async function () {
    const loadingTask = getDocument(buildGetDocumentParams("basicapi.pdf"));
    const pdfDocument = await loadingTask.promise;
    const pdfPage = await pdfDocument.getPage(1);
    const firstViewer = new AbortController();
    const secondViewer = new AbortController();
    const firstLayer = new TextLayerBuilder({
      pdfPage,
      abortSignal: firstViewer.signal,
    });
    const secondLayer = new TextLayerBuilder({
      pdfPage,
      abortSignal: secondViewer.signal,
    });
    document.body.append(firstLayer.div, secondLayer.div);
    try {
      const viewport = pdfPage.getViewport({ scale: 1 });
      await firstLayer.render({ viewport });
      await secondLayer.render({ viewport });
      firstViewer.abort();
      firstLayer.cancel();
      firstLayer.div.remove();
      secondLayer.div.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true })
      );
      secondLayer.div.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      );
      expect(secondLayer.div.classList.contains("selecting")).toBeTrue();
      secondLayer.div.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true })
      );
      expect(secondLayer.div.classList.contains("selecting")).toBeFalse();
    } finally {
      firstLayer.cancel();
      secondLayer.cancel();
      secondViewer.abort();
      firstLayer.div.remove();
      secondLayer.div.remove();
      await loadingTask.destroy();
    }
  });
});
