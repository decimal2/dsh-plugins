// 调试用：解析 pdftotext -bbox-layout 的 XHTML，检查块顺序与坐标。
const fs = require('node:fs')

const xml = fs.readFileSync(process.argv[2], 'utf8')
const wantPages = process.argv[3] ? process.argv[3].split(',').map(Number) : [2]

function parsePages(source) {
  const pages = []
  const pageRe = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g
  let m
  while ((m = pageRe.exec(source)) !== null) {
    const page = { width: Number(m[1]), height: Number(m[2]), blocks: [] }
    const body = m[3]
    const blockRe = /<block xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/block>/g
    let b
    while ((b = blockRe.exec(body)) !== null) {
      const block = { xMin: +b[1], yMin: +b[2], xMax: +b[3], yMax: +b[4], lines: [] }
      const lineRe = /<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/line>/g
      let l
      while ((l = lineRe.exec(b[5])) !== null) {
        const line = { xMin: +l[1], yMin: +l[2], xMax: +l[3], yMax: +l[4], words: [] }
        const wordRe = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g
        let w
        while ((w = wordRe.exec(l[5])) !== null) {
          line.words.push({ text: w[5], xMin: +w[1], yMin: +w[2], xMax: +w[3], yMax: +w[4] })
        }
        block.lines.push(line)
      }
      page.blocks.push(block)
    }
    pages.push(page)
  }
  return pages
}

const pages = parsePages(xml)
console.log('pages parsed:', pages.length, 'size:', pages[0] && pages[0].width, 'x', pages[0] && pages[0].height)

for (const n of wantPages) {
  const page = pages[n - 1]
  if (!page) continue
  console.log('\n===== PAGE ' + n + ' =====')
  page.blocks.forEach((block, i) => {
    const firstLine = block.lines[0] || { words: [] }
    const text = firstLine.words.map((w) => w.text).join(' ')
    const lastLine = block.lines[block.lines.length - 1] || { words: [] }
    const tail = lastLine.words.map((w) => w.text).join(' ')
    console.log(
      String(i).padStart(2) +
        ' x[' + block.xMin.toFixed(0) + '-' + block.xMax.toFixed(0) + ']' +
        ' y[' + block.yMin.toFixed(0) + '-' + block.yMax.toFixed(0) + ']' +
        ' lines=' + block.lines.length +
        ' | ' + text.slice(0, 58) +
        (block.lines.length > 1 ? ' … ' + tail.slice(-28) : ''),
    )
  })
}
