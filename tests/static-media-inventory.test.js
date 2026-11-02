const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = path.resolve(__dirname, '../src');
// 공개 src 루트에 놓인 미디어의 현재 기준 목록. 새 파일은 참조 여부를 확인한 뒤 갱신한다.
const expectedMedia = [
  '0810(4).mp4',
  '12.png',
  '13.png',
  '14.png',
  'Group 7385.png',
  'bar.png',
  'bg.webp',
  'bottom.png',
  'car.png',
  'clinic-logo.png',
  'day.webp',
  'finish.png',
  'game1.webp',
  'game2.mp4',
  'game3.mp4',
  'game4.mp4',
  'game_img1.webp',
  'gyeote_report_hero.webp',
  'location.png'
].sort();

function sourcesUnder(dir) {
  const files = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) files.push(...sourcesUnder(full));
    else if (item.isFile() && /\.(?:html|css|js)$/i.test(item.name)) {
      files.push({ path: full, text: fs.readFileSync(full, 'utf8') });
    }
  }
  return files;
}

test('public root media inventory is intentional', () => {
  const actual = fs.readdirSync(src, { withFileTypes: true })
    .filter((item) => item.isFile() && /\.(?:png|jpe?g|webp|svg|mp4)$/i.test(item.name))
    .map((item) => item.name).sort();
  assert.deepEqual(actual, expectedMedia,
    '공개 미디어 파일을 추가·삭제할 때 목록과 참조를 함께 검토해야 합니다.');
});

test('each public root media asset has a source reference', () => {
  const sources = sourcesUnder(src);
  for (const media of expectedMedia) {
    const referencingSources = sources.filter((file) => file.text.includes(media));
    assert.ok(referencingSources.length > 0,
      `참조가 없는 공개 미디어 후보: src/${media}`);
  }
});
