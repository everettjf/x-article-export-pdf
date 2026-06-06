/*!
 * X Article Export — Markdown serializer
 *
 * Converts the extracted segments into clean GitHub-flavored Markdown. Inline
 * HTML (links, bold, italic, code) is converted to Markdown equivalents so the
 * output drops straight into a repo, Obsidian, or a static-site generator.
 */
(function () {
  "use strict";

  const XAEP = (window.XAEP = window.XAEP || {});

  // Convert our sanitized inline HTML back into Markdown inline syntax.
  function inlineToMarkdown(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return walk(tmp).replace(/[ \t]+\n/g, "\n").trim();
  }

  function walk(node) {
    let out = "";
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.nodeValue;
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = child.tagName.toLowerCase();
      const inner = walk(child);
      switch (tag) {
        case "strong":
        case "b":
          out += `**${inner}**`;
          break;
        case "em":
        case "i":
          out += `*${inner}*`;
          break;
        case "code":
          out += "`" + inner + "`";
          break;
        case "s":
          out += `~~${inner}~~`;
          break;
        case "br":
          out += "  \n";
          break;
        case "a": {
          const href = child.getAttribute("href") || "";
          out += href ? `[${inner}](${href})` : inner;
          break;
        }
        default:
          out += inner;
      }
    }
    return out;
  }

  function fence(text, lang) {
    const ticks = text.includes("```") ? "````" : "```";
    return `${ticks}${lang || ""}\n${text}\n${ticks}`;
  }

  XAEP.buildMarkdown = function buildMarkdown(segments, meta, options) {
    const opts = Object.assign({ includeSource: true }, options || {});
    const lines = [];

    lines.push(`# ${meta.title}`);
    if (meta.byline && meta.byline.name) {
      const handle = meta.byline.handle ? ` (${meta.byline.handle})` : "";
      lines.push("");
      lines.push(`*by ${meta.byline.name}${handle}*`);
    }
    if (opts.includeSource) {
      lines.push("");
      lines.push(`> Source: ${meta.url}`);
    }
    lines.push("");

    const visible = XAEP.stripRedundantTitle(segments, meta.title);
    for (const seg of visible) {
      switch (seg.type) {
        case "heading": {
          const lvl = Math.min(Math.max(seg.level || 2, 1), 6);
          lines.push(`${"#".repeat(lvl)} ${inlineToMarkdown(seg.html)}`);
          lines.push("");
          break;
        }
        case "text":
          lines.push(inlineToMarkdown(seg.html));
          lines.push("");
          break;
        case "quote":
          lines.push(
            inlineToMarkdown(seg.html)
              .split("\n")
              .map((l) => `> ${l}`)
              .join("\n")
          );
          lines.push("");
          break;
        case "list": {
          seg.items.forEach((it, i) => {
            const bullet = seg.ordered ? `${i + 1}.` : "-";
            lines.push(`${bullet} ${inlineToMarkdown(it)}`);
          });
          lines.push("");
          break;
        }
        case "code":
          lines.push(fence(seg.text, seg.language));
          lines.push("");
          break;
        case "image": {
          const alt = (seg.alt || "").replace(/[\[\]]/g, "");
          lines.push(`![${alt}](${seg.src})`);
          lines.push("");
          break;
        }
        case "math":
          // KaTeX HTML carries an <annotation> with the original TeX source.
          lines.push(extractTex(seg.html, seg.display));
          lines.push("");
          break;
        case "separator":
          lines.push("---");
          lines.push("");
          break;
      }
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  };

  function extractTex(html, display) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const ann = tmp.querySelector('annotation[encoding="application/x-tex"]');
    const tex = ann ? ann.textContent.trim() : tmp.textContent.trim();
    return display === "block" ? `$$\n${tex}\n$$` : `$${tex}$`;
  }
})();
