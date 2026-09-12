const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'src', 'index.html');
const html = fs.readFileSync(INDEX, 'utf8');

function lineNumberAt(index) {
  return html.slice(0, index).split('\n').length;
}

function collectBlocks(pattern, classify) {
  const blocks = [];
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;
    blocks.push({
      startLine: lineNumberAt(start),
      endLine: lineNumberAt(end),
      bytes: Buffer.byteLength(match[0]),
      ...classify(match)
    });
  }
  return blocks;
}

const styles = collectBlocks(/<style\b([^>]*)>[\s\S]*?<\/style>/gi, (match) => ({
  attrs: match[1].trim()
}));

const scripts = collectBlocks(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, (match) => {
  const attrs = match[1].trim();
  const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] || null;
  const type = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1] || null;
  return {
    attrs,
    src,
    type,
    inline: !src
  };
});

const inlineScripts = scripts.filter((script) => script.inline);
const externalScripts = scripts.filter((script) => !script.inline);
const report = {
  file: 'src/index.html',
  bytes: Buffer.byteLength(html),
  lines: html.split('\n').length,
  styleBlocks: styles.length,
  styleBytes: styles.reduce((sum, block) => sum + block.bytes, 0),
  inlineScriptBlocks: inlineScripts.length,
  inlineScriptBytes: inlineScripts.reduce((sum, block) => sum + block.bytes, 0),
  externalScriptBlocks: externalScripts.length,
  styles,
  inlineScripts,
  externalScripts
};

console.log(JSON.stringify(report, null, 2));
