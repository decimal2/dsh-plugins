const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const source = path.join(__dirname, '../src/figures.js')
const detect = fs.existsSync(source) ? new Function(fs.readFileSync(source, 'utf8') + '\nreturn findFigureRegions')() : () => []
function line(x0, y0, x1, text, height = 12) {
  return { x0, y0, x1, y1: y0 + height, words: [{ t: text, x0, x1 }] }
}
function page(lines) { return { width: 600, height: 800, lines } }
test('figure crops stop after prose, include plot labels, and end before caption', () => {
  const cap = line(50, 330, 550, 'Figure 1: Results.', 11)
  const regions = detect(page([line(50, 100, 550, 'Previous paragraph has ordinary prose.'), line(50, 114, 220, 'Last sentence.'), line(100, 150, 200, 'Legend', 8), line(100, 290, 250, 'x axis', 8), cap]), null)
  assert.equal(regions.length, 1)
  assert.ok(regions[0].rect.y0 >= 126 && regions[0].rect.y0 < 150)
  assert.ok(regions[0].rect.y1 <= 330 && regions[0].rect.y1 > 298)
  assert.equal(regions[0].captionLines[0], cap)
})
test('single-column figure within a two-column page excludes adjacent prose', () => {
  const regions = detect(page([line(50, 90, 270, 'Previous left prose.'), line(320, 150, 550, 'Adjacent right column prose.'), line(50, 300, 270, 'Fig. 2: Left figure.', 11)]), { boundary: 300 })
  assert.equal(regions.length, 1)
  assert.ok(regions[0].rect.x1 < 300)
  assert.ok(regions[0].rect.y0 < 150)
})
test('body references and pages without captions do not create figures', () => {
  assert.deepEqual(detect(page([line(50, 200, 550, 'Figure 3 uses a different parameter.'), line(50, 250, 550, 'Ordinary prose.')]), null), [])
})
test('caption with no room above does not manufacture a figure', () => {
  assert.deepEqual(detect(page([line(50, 90, 550, 'Normal text.'), line(50, 108, 550, 'Figure 1: No figure here.', 11)]), null), [])
})
test('table caption remains separate and crop stops before following paragraph', () => {
  const regions = detect(page([line(50, 80, 550, 'Table 1: Accuracy.', 11), line(50, 93, 550, 'Higher values are better.', 11), line(90, 120, 180, 'Method', 10), line(350, 120, 430, 'Score', 10), line(90, 140, 190, 'Baseline', 10), line(350, 140, 430, '42.0', 10), line(50, 180, 550, 'The results demonstrate the benefit.', 12)]), null)
  assert.equal(regions.length, 1)
  assert.equal(regions[0].kind, 'table')
  assert.equal(regions[0].captionLines.length, 2)
  assert.ok(regions[0].rect.y0 >= 104 && regions[0].rect.y0 < 120)
  assert.ok(regions[0].rect.y1 > 150 && regions[0].rect.y1 < 180)
})

test('rotated axis labels are not mistaken for preceding body text', () => {
  const rotated = line(55, 180, 65, 'Vertical axis label', 110)
  const regions = detect(page([line(50, 90, 550, 'Previous paragraph.'), rotated, line(50, 340, 550, 'Figure 1: A plot.', 11)]), null)
  assert.equal(regions.length, 1)
  assert.ok(regions[0].rect.y0 < 180)
})

test('table row labels at the body margin do not prematurely end a table', () => {
  const regions = detect(page([line(50, 80, 550, 'Table 1: Scores.', 11), line(50, 115, 150, 'Long method name', 11), line(400, 115, 480, 'Score', 11), line(50, 140, 170, 'Another method name', 11), line(400, 140, 480, '42', 11), line(50, 180, 550, 'Following paragraph.', 12)]), null)
  assert.equal(regions.length, 1)
  assert.ok(regions[0].rect.y1 >= 151)
})
