// 原型 v3：pdftotext -bbox-layout → 可读版面
// 分栏检测(2-means) → 阅读顺序(分带) → 行级去噪(图表标注/旋转文字) → 段落合并(连字符/中日韩) → 去重
// 用法: node extract.cjs <bbox.xml> [页码,页码,...]
const CJK = /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef\uf900-\ufaff]/
const TERMINAL = /[.。!！?？:：;；]["'”’)\]]?$/
const BULLET = /^(\d+[.、)）]\s|[•·▪◆※]|[-–—]\s)/
const CAPTION = /^(figure|fig\.|table|algorithm|listing|图|表)\s*\d/i
const SECTION = /^(\d+(\.\d+){0,3}(\s+|[^\x00-\x7f])|abstract\b|introduction\b|related work\b|conclusion\b|references\b|摘要|引言|绪论|结论|参考文献)/i
const LIGATURES = [[/ﬀ/g, 'ff'], [/ﬁ/g, 'fi'], [/ﬂ/g, 'fl'], [/ﬃ/g, 'ffi'], [/ﬄ/g, 'ffl'], [/ﬅ/g, 'st'], [/ﬆ/g, 'st']]

const PART_RE = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g
const LINE_RE = /<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/line>/g
const WORD_RE = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g

/** 全角字符归一：只用于模式匹配与页眉/页脚去重，不改动展示文本。 */
function normalizeWidths(text) {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)
    if (code >= 0xff01 && code <= 0xff5e) out += String.fromCharCode(code - 0xfee0)
    else if (code === 0x3000) out += ' '
    else out += ch
  }
  return out
}

function decodeXml(text) {
  return String(text)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

function parsePages(xml) {
  const pages = []
  PART_RE.lastIndex = 0
  let m
  while ((m = PART_RE.exec(xml)) !== null) {
    const page = { width: +m[1], height: +m[2], lines: [] }
    const body = m[3]
    LINE_RE.lastIndex = 0
    let l
    while ((l = LINE_RE.exec(body)) !== null) {
      const line = { x0: +l[1], y0: +l[2], x1: +l[3], y1: +l[4], words: [] }
      const raw = l[5]
      WORD_RE.lastIndex = 0
      let w
      while ((w = WORD_RE.exec(raw)) !== null) {
        const text = decodeXml(w[5])
        if (text === '') continue
        line.words.push({ t: text, x0: +w[1], x1: +w[3] })
      }
      if (line.words.length > 0) page.lines.push(line)
    }
    pages.push(page)
  }
  return pages
}

function median(values) {
  if (values.length === 0) return 0
  const sorted = values.slice().sort(function (a, b) { return a - b })
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** 出现次数最多的行高（比中位数更抗图表小字干扰）。 */
function modeValue(values) {
  const counts = new Map()
  for (const value of values) {
    const key = Math.round(value * 2) / 2
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  let best = 0
  let bestCount = -1
  for (const entry of counts) {
    if (entry[1] > bestCount) { best = entry[0]; bestCount = entry[1] }
  }
  return best
}

function textOf(line) {
  let out = ''
  let prev = null
  for (const word of line.words) {
    if (prev === null) { out = word.t; prev = word; continue }
    const gap = word.x0 - prev.x1
    const joinTight = CJK.test(out.slice(-1)) || CJK.test(word.t.charAt(0)) || gap < 0.9
    out += (joinTight ? '' : ' ') + word.t
    prev = word
  }
  let fixed = out
  for (const pair of LIGATURES) fixed = fixed.replace(pair[0], pair[1])
  return fixed.replace(/\u00a0/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

/** 分栏检测：对“窄行”的行中心做一维 2-means；比找空白竖带更抗满宽图表的干扰。 */
function detectGutter(page) {
  const fullWidthCut = page.width * 0.62
  const centers = []
  for (const line of page.lines) {
    if (line.x1 - line.x0 >= fullWidthCut) continue
    centers.push((line.x0 + line.x1) / 2)
  }
  if (centers.length < 12) return null
  centers.sort(function (a, b) { return a - b })
  let m1 = centers[Math.floor(centers.length * 0.28)]
  let m2 = centers[Math.floor(centers.length * 0.72)]
  if (Math.abs(m2 - m1) < page.width * 0.15) return null
  let c1 = 0
  let c2 = 0
  for (let iter = 0; iter < 12; iter += 1) {
    let s1 = 0
    let s2 = 0
    c1 = 0
    c2 = 0
    for (const center of centers) {
      if (Math.abs(center - m1) <= Math.abs(center - m2)) { s1 += center; c1 += 1 } else { s2 += center; c2 += 1 }
    }
    if (c1 === 0 || c2 === 0) return null
    const n1 = s1 / c1
    const n2 = s2 / c2
    const moved = Math.abs(n1 - m1) + Math.abs(n2 - m2)
    m1 = n1
    m2 = n2
    if (moved < 0.05) break
  }
  if (Math.abs(m2 - m1) < page.width * 0.18) return null
  if (Math.min(c1, c2) / centers.length < 0.14) return null
  const boundary = (m1 + m2) / 2
  let crossing = 0
  for (const line of page.lines) {
    if (line.x1 - line.x0 >= fullWidthCut) continue
    if (line.x0 < boundary - 2 && line.x1 > boundary + 2) crossing += 1
  }
  if (crossing / Math.max(1, centers.length) > 0.35) return null
  if (process.env.PDD_DEBUG) {
    console.log('[debug] boundary=' + boundary.toFixed(1) + ' m1=' + m1.toFixed(1) + '(' + c1 + ') m2=' + m2.toFixed(1) + '(' + c2 + ') crossing=' + crossing)
  }
  return { boundary: boundary, fullWidthCut: fullWidthCut }
}

function classifyColumn(line, layout) {
  if (layout === null) return 'full'
  if (line.x1 - line.x0 >= layout.fullWidthCut) return 'full'
  return (line.x0 + line.x1) / 2 < layout.boundary ? 'L' : 'R'
}

/** 行内相邻词之间的最大空隙：正文很小，图表散落标注会非常大。 */
function maxInternalGap(line) {
  let maxGap = 0
  for (let i = 1; i < line.words.length; i += 1) {
    const gap = line.words[i].x0 - line.words[i - 1].x1
    if (gap > maxGap) maxGap = gap
  }
  return maxGap
}

function orderLines(tagged, page, layout) {
  const byY = function (a, b) { return a.line.y0 - b.line.y0 || a.line.x0 - b.line.x0 }
  if (layout === null) return tagged.slice().sort(byY)
  const starts = tagged.map(function (x) { return x.line.x0 }).sort(function (a, b) { return a - b })
  const ends = tagged.map(function (x) { return x.line.x1 }).sort(function (a, b) { return a - b })
  const textLeft = starts[Math.floor(starts.length * 0.05)]
  const textRight = ends[Math.floor(ends.length * 0.95)]
  const wideEnough = Math.max(layout.fullWidthCut, (textRight - textLeft) * 0.85)
  const isWide = function (x) { return x.line.x1 - x.line.x0 >= wideEnough }
  // 只有“接近整栏宽的正文行”才当分带边界；图表乱码行不能把段落切碎
  const separators = tagged.filter(function (x) { return !x.label && isWide(x) }).sort(byY)
  const flow = tagged.filter(function (x) { return !x.label && !isWide(x) })
  const labels = tagged.filter(function (x) { return x.label })
  const sideOf = function (x) {
    if (x.col === 'L' || x.col === 'R') return x.col
    return (x.line.x0 + x.line.x1) / 2 < layout.boundary ? 'L' : 'R'
  }
  const ordered = []
  const cuts = [0]
  for (const item of separators) cuts.push(item.line.y0)
  cuts.push(page.height + 1)
  for (let band = 0; band < cuts.length - 1; band += 1) {
    const top = cuts[band]
    const bottom = cuts[band + 1]
    const inBand = flow.filter(function (x) { return x.line.y0 >= top - 1 && x.line.y0 < bottom - 1 })
    ordered.push.apply(ordered, inBand.filter(function (x) { return sideOf(x) === 'L' }).sort(byY))
    ordered.push.apply(ordered, inBand.filter(function (x) { return sideOf(x) === 'R' }).sort(byY))
    ordered.push.apply(ordered, separators.filter(function (x) { return Math.abs(x.line.y0 - bottom) < 1 }))
  }
  return ordered.concat(labels)
  if (process.env.PDD_DEBUG) {
    console.log('[debug] order: ' + ordered.slice(0, 24).map(function (x) {
      return x.col + '@' + Math.round(x.line.y0)
    }).join(' '))
  }
  return ordered
}

/**
 * 行级去噪：图表标注（短、孤立、常旋转）不进正文段落。
 * 段落末行也是短的，所以用“同一栏带内上下是否有长行”来区分。
 */
function markLabels(tagged, page, bodyHeight) {
  const longThreshold = page.width * 0.28
  const window = Math.max(bodyHeight * 2.2, 26)
  tagged.forEach(function (item) {
    const line = item.line
    const extentX = line.x1 - line.x0
    const extentY = line.y1 - line.y0
    item.label = false
    if (extentY > extentX * 1.4 && extentY > bodyHeight * 1.4) { item.label = true; return }
    // 图表里的坐标轴乱码：满行全角拉丁字母 / 全角符号堆
    const rawText = textOf(line)
    if (/(.)\1{5,}/.test(rawText)) { item.label = true; return }
    if (line.words.length >= 3 && maxInternalGap(line) > page.width * 0.09) {
      item.label = true
      return
    }
    if (rawText.length > 6 && (fullwidthLatinRatio(rawText) > 0.4 || meaningfulRatio(rawText) < 0.55)) {
      item.label = true
      return
    }
    if (extentX >= longThreshold) return
    const nearLong = tagged.some(function (other) {
      if (other === item || other.col !== item.col) return false
      if (Math.abs(other.line.x0 - line.x0) > Math.max(24, bodyHeight * 1.6)) return false
      const dy = other.line.y0 - line.y0
      if (dy < -window || dy > window) return false
      return other.line.x1 - other.line.x0 >= longThreshold
    })
    if (!nearLong) item.label = true
  })

  // 第二遍：被图表标注包围、且附近没有其他正文行的孤行，也归入图表
  const labelWindow = bodyHeight * 2.5
  const neighbourWindow = bodyHeight * 1.4
  const isolated = []
  tagged.forEach(function (item) {
    if (item.label) return
    let labelNeighbours = 0
    let proseNeighbours = 0
    for (const other of tagged) {
      if (other === item) continue
      const dy = Math.abs(other.line.y0 - item.line.y0)
      if (other.label) { if (dy <= labelWindow) labelNeighbours += 1 } else if (dy <= neighbourWindow) proseNeighbours += 1
    }
    if (labelNeighbours >= 3 && proseNeighbours === 0) isolated.push(item)
  })
  for (const item of isolated) item.label = true
}

function dehyphenate(buffer, text, vocab) {
  if (!/[-‐‑]$/.test(buffer)) return null
  const stem = buffer.slice(0, -1)
  const tailMatch = /([\p{L}]+)$/u.exec(stem)
  const headMatch = /^([\p{L}]+)/u.exec(text)
  if (tailMatch === null || headMatch === null) return null
  if (!/^[a-zà-ÿ]/.test(text)) return null
  const joined = (tailMatch[1] + headMatch[1]).toLowerCase()
  if (vocab.has(joined)) return buffer.slice(0, -1) + text
  return buffer.slice(0, -1) + '-' + text
}

function joinLineText(previous, next) {
  if (previous === '') return next
  const tight = CJK.test(previous.slice(-1)) || CJK.test(next.charAt(0))
  return previous + (tight ? '' : ' ') + next
}

function buildBlocks(ordered, page, bodyHeight, vocab) {
  const prose = ordered.filter(function (x) { return !x.label })
  const labels = ordered.filter(function (x) { return x.label })
  if (prose.length === 0) {
    return { blocks: [], labels: labels.map(function (x) { return textOf(x.line) }) }
  }

  const gaps = []
  for (let i = 1; i < prose.length; i += 1) {
    const gap = prose[i].line.y0 - prose[i - 1].line.y1
    if (gap >= -1 && gap < bodyHeight * 1.8) gaps.push(gap)
  }
  const medianGap = gaps.length > 0 ? median(gaps) : bodyHeight * 0.2
  const blocks = []
  let buffer = null
  let bufferKind = 'p'
  let previous = null
  let previousProbe = ''

  function flush() {
    if (buffer === null) return
    const text = buffer.replace(/\s{2,}/g, ' ').trim()
    if (text !== '') blocks.push({ k: bufferKind, t: text })
    buffer = null
  }

  for (const item of prose) {
    const line = item.line
    const text = textOf(line)
    if (text === '') continue
    const probe = normalizeWidths(text)
    const lineHeight = line.y1 - line.y0
    const looksCaption = CAPTION.test(probe)
    // 中文标题常写成“3.1.2数据集筛选”（数字后紧跟汉字），必须配长度上限，否则会把正文里的“104个．…”误判成标题
    const numberedCjk = /^\d+(\.\d+){0,3}[^\x00-\x7f]/.test(probe)
    const looksSection = numberedCjk ? probe.length <= 22 : SECTION.test(probe) && probe.length < 110
    const tallerHeading = bodyHeight > 0 && lineHeight >= bodyHeight * 1.18 && probe.length < 110 && !TERMINAL.test(probe)
    const kind = looksCaption ? 'cap' : looksSection || tallerHeading ? 'h' : 'p'

    let startNew = buffer === null
    if (!startNew && previous !== null) {
      const gap = line.y0 - previous.y1
      const indent = line.x0 - previous.x0
      if (item.col !== previous.col) startNew = true
      else if (gap > Math.max(medianGap * 1.6, bodyHeight * 0.55)) startNew = true
      else if (gap < -1) startNew = true
      else if (kind !== 'p') startNew = true
      else if (bufferKind === 'h') startNew = true
      else if (bufferKind === 'cap' && TERMINAL.test(previousProbe)) startNew = true
      else if (TERMINAL.test(previousProbe) && indent > bodyHeight * 0.9) startNew = true
      else if (BULLET.test(probe) && !BULLET.test(previousProbe)) startNew = true
    }
    if (startNew) {
      flush()
      buffer = ''
      bufferKind = kind
    }
    const dehyphenated = buffer === '' ? null : dehyphenate(buffer, text, vocab)
    if (dehyphenated !== null) buffer = dehyphenated
    else buffer = joinLineText(buffer, text)
    previous = item
    previousProbe = probe
  }
  flush()

  // 多层渲染造成的重复片段只留一次
  const cleaned = blocks.map(function (block) {
    if (block.k !== 'p') return block
    const parts = block.t.split(/(?<=[.。!?！？;；])\s+/)
    const counts = new Map()
    for (const part of parts) counts.set(part, (counts.get(part) || 0) + 1)
    let text = block.t
    for (const entry of counts) {
      if (entry[1] < 3) continue
      const escaped = entry[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      let seen = 0
      text = text.replace(new RegExp(escaped + '\\s*', 'g'), function (match) {
        seen += 1
        return seen === 1 ? match : ''
      })
    }
    return { k: block.k, t: text.replace(/\s{2,}/g, ' ').trim() }
  })

  return {
    blocks: cleaned.filter(function (b) { return b.t !== '' }),
    labels: labels.map(function (x) { return textOf(x.line) }),
  }
}

function meaningfulRatio(text) {
  const stripped = text.replace(/\s/g, '')
  if (stripped === '') return 0
  return ((stripped.match(/[\p{L}\p{N}]/gu) || []).length) / stripped.length
}

/** 满篇全角拉丁字母基本就是图表里的坐标轴乱码。 */
function fullwidthLatinRatio(text) {
  const stripped = text.replace(/\s/g, '')
  if (stripped === '') return 0
  let count = 0
  for (const ch of stripped) {
    const code = ch.codePointAt(0)
    if ((code >= 0xff21 && code <= 0xff3a) || (code >= 0xff41 && code <= 0xff5a)) count += 1
  }
  return count / stripped.length
}

function stripRunningFurniture(pages) {
  const counts = new Map()
  for (const page of pages) {
    const top = page.height * 0.085
    const bottom = page.height * 0.915
    for (const line of page.lines) {
      if (line.y0 > top && line.y1 < bottom) continue
      const key = normalizeWidths(textOf(line)).replace(/\s+/g, ' ').replace(/\d+/g, '#').trim()
      if (key === '') continue
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.3))
  const repeated = new Set()
  for (const entry of counts) if (entry[1] >= threshold) repeated.add(entry[0])
  if (process.env.PDD_DEBUG && repeated.size > 0) {
    console.log('[debug] repeated furniture (' + threshold + '+): ' + Array.from(repeated).slice(0, 8).join(' | '))
  }
  for (const page of pages) {
    const top = page.height * 0.085
    const bottom = page.height * 0.915
    page.lines = page.lines.filter(function (line) {
      if (line.y0 > top && line.y1 < bottom) return true
      const raw = textOf(line).trim()
      if (/^\d{1,4}$/.test(raw)) return false
      if (/^[-—–\s·•]+$/.test(raw)) return false
      return !repeated.has(normalizeWidths(raw).replace(/\s+/g, ' ').replace(/\d+/g, '#').trim())
    })
  }
}

function buildVocab(pages) {
  const vocab = new Set()
  for (const page of pages) {
    for (const line of page.lines) {
      const tokens = textOf(line).toLowerCase().split(/[^\p{L}\p{N}]+/u)
      for (const token of tokens) if (token.length > 2) vocab.add(token)
    }
  }
  return vocab
}

function extractPages(xml) {
  const pages = parsePages(xml)
  stripRunningFurniture(pages)
  const vocab = buildVocab(pages)
  return pages.map(function (page, index) {
    const allHeights = page.lines.map(function (l) { return l.y1 - l.y0 }).filter(function (h) { return h > 0 })
    const longHeights = page.lines
      .filter(function (l) { return l.x1 - l.x0 >= page.width * 0.3 })
      .map(function (l) { return l.y1 - l.y0 })
      .filter(function (h) { return h > 0 })
    const bodyHeight = (longHeights.length >= 8 ? modeValue(longHeights) : 0) || modeValue(allHeights) || 10
    const layout = detectGutter(page)
    const tagged = page.lines.map(function (line) { return { line: line, col: classifyColumn(line, layout), label: false } })
    markLabels(tagged, page, bodyHeight)
    const ordered = orderLines(tagged, page, layout)
    const built = buildBlocks(ordered, page, bodyHeight, vocab)
    const blocks = built.blocks.filter(function (block) {
      if (meaningfulRatio(block.t) < 0.45) return false
      if (block.k === 'fig') return true
      if (block.t.length > 50 && fullwidthLatinRatio(block.t) > 0.5) return false
      return true
    })
    const labels = []
    const seenLabel = new Set()
    for (const label of built.labels) {
      const text = label.trim()
      if (text.length < 2 || meaningfulRatio(text) < 0.5) continue
      if (/^[\d\s.,%×x+\-–—/]+$/.test(text)) continue
      if (seenLabel.has(text)) continue
      seenLabel.add(text)
      labels.push(text)
    }
    if (labels.length > 0) blocks.push({ k: 'fig', t: labels.join(' · ') })
    return { page: index + 1, columns: layout === null ? 1 : 2, blocks: blocks }
  })
}

if (require.main === module) {
  const fs = require('node:fs')
  const xml = fs.readFileSync(process.argv[2], 'utf8')
  const wanted = process.argv[3] ? process.argv[3].split(',').map(Number) : null
  for (const result of extractPages(xml)) {
    if (wanted !== null && wanted.indexOf(result.page) < 0) continue
    console.log('\n===== PAGE ' + result.page + '  columns=' + result.columns + ' =====')
    for (const block of result.blocks) console.log('[' + block.k + '] ' + block.t)
  }
}

module.exports = { extractPages: extractPages, parsePages: parsePages }
