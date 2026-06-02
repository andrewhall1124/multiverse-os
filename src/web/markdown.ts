// Markdown rendering for assistant messages, via the CDN-loaded marked + highlight.js,
// sanitized with DOMPurify. Configures marked once on load.

if (window.marked && window.hljs) {
  marked.use({
    renderer: {
      code({ text, lang }: { text: string; lang?: string }) {
        if (lang && hljs.getLanguage(lang)) {
          return `<pre><code class="hljs language-${lang}">${hljs.highlight(text, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
        }
        return `<pre><code class="hljs">${hljs.highlightAuto(text).value}</code></pre>`;
      },
    },
    gfm: true,
    breaks: true,
  });
}

export function renderMd(text: string): string {
  if (window.marked && window.DOMPurify) return DOMPurify.sanitize(marked.parse(text));
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}
