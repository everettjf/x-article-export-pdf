/*!
 * X Article Export — HTML renderer
 *
 * Builds a single, self-contained HTML document from the extracted segments.
 * The document carries its own print stylesheet and auto-opens the browser's
 * print dialog, where the user picks "Save as PDF". No screenshots, no servers.
 */
(function () {
  "use strict";

  const XAEP = (window.XAEP = window.XAEP || {});
  const escapeHtml = XAEP.escapeHtml;

  // X uses the article's leading H1 as its title, which we also surface in the
  // masthead. Drop that one heading so the title isn't printed twice.
  XAEP.stripRedundantTitle = function stripRedundantTitle(segments, title) {
    const want = XAEP.normalizeForCompare(title);
    if (!want) return segments.slice();
    const out = [];
    let removed = false;
    for (const seg of segments) {
      if (
        !removed &&
        seg.type === "heading" &&
        seg.level === 1 &&
        XAEP.normalizeForCompare(seg.html.replace(/<[^>]*>/g, " ")) === want
      ) {
        removed = true;
        continue;
      }
      out.push(seg);
    }
    return out;
  };

  function renderSegment(seg) {
    switch (seg.type) {
      case "heading": {
        const lvl = Math.min(Math.max(seg.level || 2, 1), 6);
        // Demote the in-body H1 (the page already prints a title block).
        const tag = lvl === 1 ? "h2" : "h" + lvl;
        return `<${tag} class="xa-heading xa-h${lvl}">${seg.html}</${tag}>`;
      }
      case "text":
        return `<p class="xa-text">${seg.html}</p>`;
      case "quote":
        return `<blockquote class="xa-quote">${seg.html}</blockquote>`;
      case "list": {
        const tag = seg.ordered ? "ol" : "ul";
        const items = seg.items
          .map((it) => `<li>${it}</li>`)
          .join("\n");
        return `<${tag} class="xa-list">${items}</${tag}>`;
      }
      case "code": {
        const lang = seg.language ? escapeHtml(seg.language) : "code";
        return [
          `<figure class="xa-code">`,
          `<figcaption class="xa-code-lang">${lang}</figcaption>`,
          `<pre><code>${escapeHtml(seg.text)}</code></pre>`,
          `</figure>`,
        ].join("");
      }
      case "math":
        return seg.display === "block"
          ? `<div class="xa-math-block">${seg.html}</div>`
          : `<span class="xa-math-inline">${seg.html}</span>`;
      case "image": {
        const alt = escapeHtml(seg.alt || "");
        const cap = seg.alt
          ? `<figcaption>${escapeHtml(seg.alt)}</figcaption>`
          : "";
        return `<figure class="xa-figure"><img src="${escapeHtml(
          seg.src
        )}" alt="${alt}" loading="eager">${cap}</figure>`;
      }
      case "separator":
        return `<hr class="xa-sep">`;
      default:
        return "";
    }
  }

  function normalizeOpts(options) {
    return Object.assign(
      { theme: "modern", pageSize: "a4", includeSource: true },
      options || {}
    );
  }

  // The inner content HTML: masthead + article body + footer. Consumed by the
  // in-extension print page (which owns the CSP) and by buildDocument().
  XAEP.buildBody = function buildBody(segments, meta, options) {
    const opts = normalizeOpts(options);
    const visible = XAEP.stripRedundantTitle(segments, meta.title);
    const body = visible.map(renderSegment).join("\n");

    const bylineHtml =
      meta.byline && meta.byline.name
        ? `<div class="xa-byline">${escapeHtml(meta.byline.name)}${
            meta.byline.handle
              ? ` <span class="xa-handle">${escapeHtml(
                  meta.byline.handle
                )}</span>`
              : ""
          }</div>`
        : "";

    const sourceHtml = opts.includeSource
      ? `<div class="xa-source">Source: <a href="${escapeHtml(
          meta.url
        )}">${escapeHtml(meta.url)}</a></div>`
      : "";

    return `<main class="xa-doc">
<header class="xa-masthead">
<h1 class="xa-title">${escapeHtml(meta.title)}</h1>
${bylineHtml}
${sourceHtml}
</header>
<article class="xa-content">
${body}
</article>
<footer class="xa-footer">Exported with X Article Export · github.com/everettjf/x-article-export-pdf</footer>
</main>`;
  };

  // Stylesheet for the printable output.
  XAEP.buildStyles = function buildStyles(options) {
    return STYLES(normalizeOpts(options));
  };

  // A fully self-contained HTML document — used for the "download HTML" fallback
  // when a controlled print page is unavailable.
  XAEP.buildDocument = function buildDocument(segments, meta, options) {
    const opts = normalizeOpts(options);
    return `<!doctype html>
<html lang="en" data-theme="${escapeHtml(opts.theme)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" crossorigin="anonymous">
<style>${STYLES(opts)}</style>
</head>
<body>
${XAEP.buildBody(segments, meta, opts)}
</body>
</html>`;
  };

  function STYLES(opts) {
    const pageSize = opts.pageSize === "letter" ? "letter" : "A4";
    return `
:root{
  --ink:#0f1419; --muted:#536471; --line:#e1e8ed; --accent:#1d9bf0;
  --code-bg:#f7f9fa; --code-line:#e1e8ed; --quote:#536471;
  --maxw:720px;
}
*{box-sizing:border-box;}
html{-webkit-text-size-adjust:100%;}
body{
  margin:0; background:#fff; color:var(--ink);
  font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;
}
[data-theme="serif"] body, [data-theme="serif"] .xa-content{
  font-family:Georgia,Cambria,"Times New Roman",Times,serif;
}
.xa-doc{max-width:var(--maxw); margin:0 auto; padding:48px 28px 64px;}
.xa-masthead{border-bottom:2px solid var(--ink); padding-bottom:20px; margin-bottom:32px;}
.xa-title{font-size:34px; line-height:1.2; font-weight:800; letter-spacing:-0.02em; margin:0 0 12px;}
[data-theme="serif"] .xa-title{font-weight:700;}
.xa-byline{font-size:15px; color:var(--ink); font-weight:600;}
.xa-handle{color:var(--muted); font-weight:400;}
.xa-source{font-size:12px; color:var(--muted); margin-top:8px; word-break:break-all;}
.xa-source a{color:var(--muted); text-decoration:none;}
.xa-content{font-size:17px;}
.xa-content a{color:var(--accent); text-decoration:none; border-bottom:1px solid rgba(29,155,240,.35);}
.xa-text{margin:0 0 20px;}
.xa-heading{line-height:1.25; font-weight:700; letter-spacing:-0.01em; margin:36px 0 14px;}
.xa-h1,.xa-h2{font-size:26px; padding-bottom:6px; border-bottom:1px solid var(--line);}
.xa-h3{font-size:21px;} .xa-h4{font-size:18px;} .xa-h5,.xa-h6{font-size:16px; color:var(--muted);}
.xa-list{margin:0 0 20px; padding-left:1.5em;}
.xa-list li{margin:6px 0;}
.xa-quote{margin:24px 0; padding:6px 0 6px 20px; border-left:4px solid var(--accent);
  color:var(--quote); font-style:italic;}
.xa-figure{margin:28px 0; text-align:center;}
.xa-figure img{max-width:100%; height:auto; border-radius:10px; border:1px solid var(--line);}
.xa-figure figcaption{margin-top:10px; font-size:13px; color:var(--muted);}
.xa-code{margin:24px 0; border:1px solid var(--code-line); border-radius:10px;
  overflow:hidden; background:var(--code-bg);}
.xa-code-lang{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  text-transform:uppercase; letter-spacing:.08em; color:var(--muted);
  padding:9px 14px; border-bottom:1px solid var(--code-line); background:#fff;}
.xa-code pre{margin:0; padding:14px 16px; overflow-x:auto;}
.xa-code code{font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
  white-space:pre-wrap; word-break:break-word; color:var(--ink);}
.xa-math-block{margin:20px 0; overflow-x:auto;}
.xa-sep{border:none; border-top:1px dashed var(--line); margin:32px 0;}
.xa-footer{margin-top:48px; padding-top:16px; border-top:1px solid var(--line);
  font-size:12px; color:var(--muted); text-align:center;}

@page{size:${pageSize}; margin:18mm 16mm;}
@media print{
  .xa-doc{max-width:none; margin:0; padding:0;}
  .xa-footer{display:none;}
  .xa-content a{color:var(--ink); border-bottom:none;}
  .xa-figure,.xa-code,.xa-math-block,blockquote{break-inside:avoid; page-break-inside:avoid;}
  .xa-heading{break-after:avoid; page-break-after:avoid;}
  img{break-inside:avoid;}
}
`;
  }
})();
