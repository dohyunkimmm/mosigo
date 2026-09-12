const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'src', 'index.html');
const html = fs.readFileSync(INDEX, 'utf8');

function maskHtmlComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replace(/[^\n]/g, ' ')
  );
}

function lineNumberAt(index) {
  return html.slice(0, index).split('\n').length;
}

function collectTagBlocks(tagName) {
  const masked = maskHtmlComments(html);
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>[\\s\\S]*?<\\/${tagName}>`, 'gi');
  const exactPattern = new RegExp(`^<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>$`, 'i');
  const blocks = [];
  let match;

  while ((match = pattern.exec(masked)) !== null) {
    const full = html.slice(match.index, match.index + match[0].length);
    const exact = full.match(exactPattern);
    if (!exact) throw new Error(`Could not parse ${tagName} block at index ${match.index}`);
    blocks.push({
      index: match.index,
      startLine: lineNumberAt(match.index),
      endLine: lineNumberAt(match.index + match[0].length),
      bytes: Buffer.byteLength(full),
      attrs: exact[1].trim(),
      body: exact[2]
    });
  }

  return blocks;
}

function getAttr(attrs, name) {
  return attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] || null;
}

const styles = collectTagBlocks('style').map(({ body, index, ...block }) => block);
const scripts = collectTagBlocks('script').map(({ body, index, ...block }) => {
  const src = getAttr(block.attrs, 'src');
  const type = getAttr(block.attrs, 'type');
  return {
    ...block,
    src,
    type,
    inline: !src
  };
});

const inlineScripts = scripts.filter((script) => script.inline);
const externalScripts = scripts.filter((script) => !script.inline);
const localAssets = ['index.css', 'index-core.js', 'index-post.js']
  .map((file) => {
    const fullPath = path.join(ROOT, 'src', file);
    return {
      file,
      exists: fs.existsSync(fullPath),
      bytes: fs.existsSync(fullPath) ? fs.statSync(fullPath).size : null
    };
  });

const report = {
  file: 'src/index.html',
  bytes: Buffer.byteLength(html),
  lines: html.split('\n').length,
  htmlCommentOpeners: (html.match(/<!--/g) || []).length,
  htmlCommentClosers: (html.match(/-->/g) || []).length,
  styleBlocks: styles.length,
  styleBytes: styles.reduce((sum, block) => sum + block.bytes, 0),
  inlineScriptBlocks: inlineScripts.length,
  inlineScriptBytes: inlineScripts.reduce((sum, block) => sum + block.bytes, 0),
  externalScriptBlocks: externalScripts.length,
  styles,
  inlineScripts,
  externalScripts,
  localAssets
};

console.log(JSON.stringify(report, null, 2));
