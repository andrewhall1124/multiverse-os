// CDN globals loaded via <script> tags in index.html (not ES module imports).
// Typed loosely on purpose — they're third-party UMD bundles.
declare const marked: any;
declare const hljs: any;
declare const DOMPurify: any;

interface Window {
  marked?: any;
  hljs?: any;
  DOMPurify?: any;
}
