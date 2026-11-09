/**
 * PaperDock · 论文译读台 — Host 半（正式版 v1.0）
 *
 * dynamic Cordis Package 的 `code.host`：普通函数体，返回 { apply(ctx) }。
 *
 * 职责：
 *   1. 列出工作区里的 PDF（fs 服务）
 *   2. 用 pdftotext -bbox-layout 拿“词级坐标”，自己做版面重建：
 *      分栏检测 → 阅读顺序 → 图表标注剔除 → 段落合并（连字符/中日韩）→ 去重
 *      这一层是文本质量的关键：直接吃 pdftotext 的纯文本会把双栏按行交错、把图里的
 *      刻度/图例当正文塞进阅读流。
 *   3. 注册 /cordis-pdfdock/raw/<docId> 路由，吐原始 PDF 字节（含 Range）给原生阅读器
 *
 * 宿主服务全部按可选依赖取：ctx.get('x') + undefined 检查。
 */
const documents = new Map()
const pageCache = new Map()
let documentSeq = 0

const MAX_PAGES = 400
const MAX_PDF_BYTES = 256 * 1024 * 1024
const CHUNK_PAGES = 40

const CJK = /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef\uf900-\ufaff]/
const TERMINAL = /[.。!！?？:：;；]["'”’)\]]?$/
const BULLET = /^(\d+[.、)）]\s|[•·▪◆※]|[-–—]\s)/
const CAPTION = /^(figure|fig\.|table|algorithm|listing|图|表)\s*\d/i
const SECTION = /^(\d+(\.\d+){0,3}(\s+|[^\x00-\x7f])|abstract\b|introduction\b|related work\b|conclusion\b|references\b|摘要|引言|绪论|结论|参考文献)/i
const LIGATURES = [[/ﬀ/g, 'ff'], [/ﬁ/g, 'fi'], [/ﬂ/g, 'fl'], [/ﬃ/g, 'ffi'], [/ﬄ/g, 'ffl'], [/ﬅ/g, 'st'], [/ﬆ/g, 'st']]
const PART_RE = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g
const LINE_RE = /<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/line>/g
const WORD_RE = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g

const TRANSLATE_SYSTEM = [
  '你是一位严谨的学术论文译者。用户会给你一小段论文原文（可能夹带公式、符号、引用标记）。',
  '请把它翻译成简体中文：忠实原意、语序通顺、术语准确；专业术语首次出现时在括号里保留英文原词；',
  '公式、变量、数字、引用标记保持原样，不要改动也不要解释。',
  '只输出译文本身，不要加任何前言、后记或“以下是译文”之类的话。',
].join('\n')

const EXPLAIN_SYSTEM = [
  '你是一位耐心的论文导读作者。用户会给你一小段论文原文。',
  '请用简体中文讲解：先用一两句话点明这段的结论或作用，再逐句讲清含义、关键符号和隐含前提，',
  '最后指出它在整篇论证中的位置。术语首次出现时在括号里保留英文原词。不要翻译全文，要讲解。',
].join('\n')

const ASK_SYSTEM = [
  '你是一位熟悉这篇论文的研究助手。用户会给你一个问题，并附带整篇论文的正文（按页标注）。',
  '请直接用简体中文回答：先给结论，再给必要的依据或推导；引用原文时用关键短语并注明第几页。',
  '如果问题超出论文内容，可以基于领域知识回答，但要说明哪部分来自论文、哪部分是背景补充。',
  '不要输出译文，也不要重述问题。',
].join('\n')

function describeError(error) {
  if (error === null || error === undefined) return '未知错误'
  if (typeof error === 'string') return error
  if (typeof error.message === 'string') return error.message
  return String(error)
}

function commandError(text) {
  const value = String(text || '').trim()
  if (value === '') return '无输出'
  return value.length > 8192 ? value.slice(0, 4096) + '\n…\n' + value.slice(-4096) : value
}

function quoteArg(value) {
  return '"' + String(value).replace(/["`$]/g, '') + '"'
}

function isAbsolutePath(value) {
  if (/^[A-Za-z]:[\\/]/.test(value)) return true
  if (value.charAt(0) === '/') return true
  if (value.slice(0, 2) === '\\\\') return true
  return false
}

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

function median(values) {
  if (values.length === 0) return 0
  const sorted = values.slice().sort(function (a, b) { return a - b })
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

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

function parseLayoutPages(xml) {
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

function lineText(line) {
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

function maxInternalGap(line) {
  let maxGap = 0
  for (let i = 1; i < line.words.length; i += 1) {
    const gap = line.words[i].x0 - line.words[i - 1].x1
    if (gap > maxGap) maxGap = gap
  }
  return maxGap
}

function meaningfulRatio(text) {
  const stripped = text.replace(/\s/g, '')
  if (stripped === '') return 0
  return ((stripped.match(/[\p{L}\p{N}]/gu) || []).length) / stripped.length
}

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

/** 分栏检测：对“窄行”的行中心做一维 2-means，比找空白竖带更抗满宽图表干扰。 */
function detectColumns(page) {
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
  return { boundary: boundary, fullWidthCut: fullWidthCut }
}

function markNoiseLines(tagged, page, bodyHeight) {
  const longThreshold = page.width * 0.28
  const window = Math.max(bodyHeight * 2.2, 26)
  tagged.forEach(function (item) {
    const line = item.line
    const extentX = line.x1 - line.x0
    const extentY = line.y1 - line.y0
    item.label = false
    if (extentY > extentX * 1.4 && extentY > bodyHeight * 1.4) { item.label = true; return }
    const raw = lineText(line)
    if (/(.)\1{5,}/.test(raw)) { item.label = true; return }
    if (line.words.length >= 3 && maxInternalGap(line) > page.width * 0.09) { item.label = true; return }
    if (raw.length > 6 && (fullwidthLatinRatio(raw) > 0.4 || meaningfulRatio(raw) < 0.55)) { item.label = true; return }
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

function orderPageLines(tagged, page, layout) {
  const byY = function (a, b) { return a.line.y0 - b.line.y0 || a.line.x0 - b.line.x0 }
  if (layout === null) return tagged.slice().sort(byY)
  const starts = tagged.map(function (x) { return x.line.x0 }).sort(function (a, b) { return a - b })
  const ends = tagged.map(function (x) { return x.line.x1 }).sort(function (a, b) { return a - b })
  const textLeft = starts[Math.floor(starts.length * 0.05)]
  const textRight = ends[Math.floor(ends.length * 0.95)]
  const wideEnough = Math.max(layout.fullWidthCut, (textRight - textLeft) * 0.85)
  const isWide = function (x) { return x.line.x1 - x.line.x0 >= wideEnough }
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
}

function dehyphenate(buffer, text, vocab) {
  if (!/[-‐‑]$/.test(buffer)) return null
  const stem = buffer.slice(0, -1)
  const tailMatch = /([\p{L}]+)$/u.exec(stem)
  const headMatch = /^([\p{L}]+)/u.exec(text)
  if (tailMatch === null || headMatch === null) return null
  if (!/^[a-zà-ÿ]/.test(text)) return null
  if (vocab.has((tailMatch[1] + headMatch[1]).toLowerCase())) return buffer.slice(0, -1) + text
  return buffer.slice(0, -1) + '-' + text
}

function joinLineText(previous, next) {
  if (previous === '') return next
  const tight = CJK.test(previous.slice(-1)) || CJK.test(next.charAt(0))
  return previous + (tight ? '' : ' ') + next
}

function buildPageBlocks(ordered, page, bodyHeight, vocab) {
  const prose = ordered.filter(function (x) { return !x.label })
  const noise = ordered.filter(function (x) { return x.label })
  const blocks = []
  if (prose.length > 0) {
    const gaps = []
    for (let i = 1; i < prose.length; i += 1) {
      const gap = prose[i].line.y0 - prose[i - 1].line.y1
      if (gap >= -1 && gap < bodyHeight * 1.8) gaps.push(gap)
    }
    const medianGap = gaps.length > 0 ? median(gaps) : bodyHeight * 0.2
    let buffer = null
    let bufferKind = 'p'
    let previous = null
    let previousProbe = ''
    const flush = function () {
      if (buffer === null) return
      const text = buffer.replace(/\s{2,}/g, ' ').trim()
      if (text !== '') blocks.push({ k: bufferKind, t: text })
      buffer = null
    }
    for (const item of prose) {
      const line = item.line
      if (item.imageBefore) { flush(); blocks.push(item.imageBefore) }
      const text = lineText(line)
      if (text === '') continue
      const probe = normalizeWidths(text)
      const lineHeight = line.y1 - line.y0
      const numberedCjk = /^\d+(\.\d+){0,3}[^\x00-\x7f]/.test(probe)
      const looksCaption = CAPTION.test(probe)
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
      if (item.imageAfter) { flush(); blocks.push(item.imageAfter) }
    }
    flush()
  }

  // 多层渲染导致的重复片段只留一次
  for (const block of blocks) {
    if (block.k !== 'p') continue
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
    block.t = text.replace(/\s{2,}/g, ' ').trim()
  }

  const kept = blocks.filter(function (block) {
    if (block.k === 'image') return true
    if (block.t === '') return false
    if (meaningfulRatio(block.t) < 0.45) return false
    if (block.k !== 'fig' && block.t.length > 50 && fullwidthLatinRatio(block.t) > 0.5) return false
    return true
  })

  const labels = []
  const seen = new Set()
  for (const item of noise) {
    const text = lineText(item.line).trim()
    if (text.length < 2 || meaningfulRatio(text) < 0.5) continue
    if (/^[\d\s.,%×x+\-–—/]+$/.test(text)) continue
    if (seen.has(text)) continue
    seen.add(text)
    labels.push(text)
  }
  if (labels.length > 0) kept.push({ k: 'fig', t: labels.join(' · ') })
  return kept
}

/** 页眉/页脚：出现在 ≥30% 页面同一位置行的重复文本、纯页码、纯符号行全部丢掉。 */
function stripRunningFurniture(pages) {
  const counts = new Map()
  for (const page of pages) {
    const top = page.height * 0.085
    const bottom = page.height * 0.915
    for (const line of page.lines) {
      if (line.y0 > top && line.y1 < bottom) continue
      const key = normalizeWidths(lineText(line)).replace(/\s+/g, ' ').replace(/\d+/g, '#').trim()
      if (key === '') continue
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.3))
  const repeated = new Set()
  for (const entry of counts) if (entry[1] >= threshold) repeated.add(entry[0])
  for (const page of pages) {
    const top = page.height * 0.085
    const bottom = page.height * 0.915
    page.lines = page.lines.filter(function (line) {
      if (line.y0 > top && line.y1 < bottom) return true
      const raw = lineText(line).trim()
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
      const tokens = lineText(line).toLowerCase().split(/[^\p{L}\p{N}]+/u)
      for (const token of tokens) if (token.length > 2) vocab.add(token)
    }
  }
  return vocab
}

/** bbox-layout XHTML → 每页 [{k:'h'|'p'|'cap'|'fig', t}] */
function layoutToPages(xml) {
  const pages = parseLayoutPages(xml)
  if (pages.length === 0) return null
  stripRunningFurniture(pages)
  const vocab = buildVocab(pages)
  return pages.map(function (page) {
    const allHeights = page.lines.map(function (l) { return l.y1 - l.y0 }).filter(function (h) { return h > 0 })
    const longHeights = page.lines
      .filter(function (l) { return l.x1 - l.x0 >= page.width * 0.3 })
      .map(function (l) { return l.y1 - l.y0 })
      .filter(function (h) { return h > 0 })
    const bodyHeight = (longHeights.length >= 8 ? modeValue(longHeights) : 0) || modeValue(allHeights) || 10
    const layout = detectColumns(page)
    const regions = typeof findFigureRegions === 'function' ? findFigureRegions(page, layout) : []
    const captionLines = new Set(regions.flatMap(function (region) { return region.captionLines }))
    const tagged = page.lines.map(function (line) {
      const col = layout === null
        ? 'full'
        : line.x1 - line.x0 >= layout.fullWidthCut
          ? 'full'
          : (line.x0 + line.x1) / 2 < layout.boundary ? 'L' : 'R'
      return { line: line, col: col, label: false }
    }).filter(function (item) {
      if (captionLines.has(item.line)) return true
      const x = (item.line.x0 + item.line.x1) / 2
      const y = (item.line.y0 + item.line.y1) / 2
      return !regions.some(function (r) { return x >= r.rect.x0 && x <= r.rect.x1 && y >= r.rect.y0 && y <= r.rect.y1 })
    })
    markNoiseLines(tagged, page, bodyHeight)
    for (const item of tagged) if (captionLines.has(item.line)) item.label = false
    regions.forEach(function (region, index) {
      const anchor = region.kind === 'table' ? region.captionLines[region.captionLines.length - 1] : region.captionLines[0]
      const item = tagged.find(function (entry) { return entry.line === anchor })
      if (item) item[region.kind === 'table' ? 'imageAfter' : 'imageBefore'] = {
        k: 'image', t: '', figureIndex: index, rect: region.rect, label: region.label,
        sourceText: page.lines.filter(function (line) {
          const x = (line.x0 + line.x1) / 2, y = (line.y0 + line.y1) / 2
          return x >= region.rect.x0 && x <= region.rect.x1 && y >= region.rect.y0 && y <= region.rect.y1
        }).map(lineText).join('\n'),
      }
    })
    const ordered = orderPageLines(tagged, page, layout)
    return buildPageBlocks(ordered, page, bodyHeight, vocab)
  })
}

/** 兜底：没有坐标就直接用 pdftotext 纯文本，按 \f 分页 */
function plainTextToPages(text) {
  const parts = String(text || '').split('\f')
  while (parts.length > 0 && parts[parts.length - 1].trim() === '') parts.pop()
  return parts.map(function (part) {
    const cleaned = part
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+$/gm, '')
      .replace(/^\n+/, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return cleaned === '' ? [] : [{ k: 'p', t: cleaned }]
  })
}

return {
  apply(ctx) {
    const fsService = ctx.get('fs')
    const shellService = ctx.get('shell')
    const sandboxPolicy = ctx.get('sandboxPolicy')
    const webServer = ctx.get('webServer')
    const llmService = ctx.get('llm')
    const defaultModel = ctx.get('agentDefaultModel')
    let requestSeq = 0

    /** 用宿主 llm 服务直连模型做翻译/讲解（不经过 agent 循环，快且不污染会话）。 */
    async function translateText(text, kind, progress) {
      if (llmService === undefined) return { ok: false, error: 'llm 服务不可用' }
      let selection
      try {
        selection = defaultModel && typeof defaultModel.currentSelection === 'function' ? defaultModel.currentSelection() : undefined
      } catch (error) {
        selection = undefined
      }
      if (!selection || typeof selection.provider !== 'string' || typeof selection.model !== 'string') {
        return { ok: false, error: '没有可用的默认模型（先在设置里选一个模型）' }
      }
      requestSeq += 1
      const message = {
        id: 'paperdock-' + Date.now().toString(36) + '-' + String(requestSeq),
        role: 'user',
        content: [{ type: 'text', text: text }],
        source: { kind: 'plugin', plugin: 'paperdock' },
      }
      const options = {
        provider: selection.provider,
        model: selection.model,
        messages: [message],
        system: kind === 'ask' ? ASK_SYSTEM : kind === 'explain' ? EXPLAIN_SYSTEM : TRANSLATE_SYSTEM,
        temperature: 0.2,
        maxTokens: 8000,
        signal: progress?.signal,
      }
      if (typeof selection.reasoningEffort === 'string') options.reasoningEffort = selection.reasoningEffort
      let output = ''
      let finishReason = ''
      try {
        for await (const chunk of llmService.stream(options)) {
          if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {output += chunk.text;progress?.delta?.(chunk.text)}
          else if (chunk.type === 'finish') finishReason = String(chunk.reason || '')
        }
      } catch (error) {
        return { ok: false, error: describeError(error), model: selection.provider + '/' + selection.model }
      }
      if(['length','max_tokens','max-tokens'].includes(finishReason))return {ok:false,error:'输出达到模型上限，当前内容未完成，请缩小翻译范围后重试',model:selection.provider+'/'+selection.model}
      const trimmed = output.trim()
      if (trimmed === '') {
        return {
          ok: false,
          error: '模型没有返回文本' + (finishReason !== '' ? '（finish=' + finishReason + '）' : ''),
          model: selection.provider + '/' + selection.model,
        }
      }
      return { ok: true, text: trimmed, model: selection.provider + '/' + selection.model }
    }

    function workspaceRoot() {
      if (sandboxPolicy && typeof sandboxPolicy.workspaceRoot === 'string' && sandboxPolicy.workspaceRoot !== '') {
        return sandboxPolicy.workspaceRoot
      }
      return ''
    }

    /** 跑一条命令，永远不 reject。 */
    async function runCommand(command, workdir) {
      if (shellService === undefined) return { ok: false, code: null, out: '', err: 'shell 服务不可用', truncated: false }
      let spec
      try {
        const policy = sandboxPolicy && typeof sandboxPolicy.resolve === 'function' ? sandboxPolicy.resolve() : undefined
        if (!policy) throw new Error('无法取得 DSH 沙箱策略，未执行 PDF 提取命令')
        spec = shellService.resolve({
          sandboxPolicy: Object.assign({}, policy, { mode: 'read-only', additionalWritableRoots: [] }),
          command: command,
          workdir: workdir === '' ? undefined : workdir,
          timeoutMs: 180000,
          stdoutMaxBytes: 24 * 1024 * 1024,
        })
      } catch (error) {
        return { ok: false, code: null, out: '', err: describeError(error), truncated: false }
      }
      try {
        const execution = await shellService.execute(spec)
        const result = await execution.result()
        const out = result && result.stdout && typeof result.stdout.text === 'string' ? result.stdout.text : ''
        const err = result && result.stderr && typeof result.stderr.text === 'string' ? result.stderr.text : ''
        const truncated = Boolean(result && result.stdout && result.stdout.truncated)
        return { ok: result ? result.exitCode === 0 : false, code: result ? result.exitCode : null, out: out, err: err, truncated: truncated }
      } catch (error) {
        return { ok: false, code: null, out: '', err: describeError(error), truncated: false }
      }
    }

    async function listPdfs(dir) {
      if (fsService === undefined) return { ok: false, error: 'fs 服务不可用' }
      const root = String(dir || '').trim() !== '' ? String(dir).trim() : workspaceRoot()
      if (root === '') return { ok: false, error: '当前没有工作区目录，请直接填写 PDF 绝对路径' }
      const resolveOptions = isAbsolutePath(root) || workspaceRoot() === '' ? {} : { cwd: workspaceRoot() }
      let start
      try {
        start = await fsService.resolve(root, resolveOptions)
      } catch (error) {
        return { ok: false, error: '无法解析目录：' + describeError(error) }
      }
      const files = []
      const skipped = {
        node_modules: true, dist: true, build: true, out: true, target: true,
        __pycache__: true, venv: true, '.venv': true, '.git': true,
      }
      async function walk(target, depth) {
        if (depth > 5 || files.length >= 240) return
        let entries
        try {
          entries = await fsService.listDir(target)
        } catch (error) {
          return
        }
        for (let index = 0; index < entries.length; index += 1) {
          if (files.length >= 240) return
          const entry = entries[index]
          if (entry.type === 'directory') {
            if (skipped[entry.name] === true || entry.name.charAt(0) === '.') continue
            await walk(entry.target, depth + 1)
          } else if (entry.type === 'file' && /\.pdf$/i.test(entry.name)) {
            files.push({
              path: entry.target.displayPath,
              name: entry.name,
              size: typeof entry.size === 'number' ? entry.size : 0,
            })
          }
        }
      }
      await walk(start, 0)
      files.sort(function (a, b) { return a.name.localeCompare(b.name) })
      return { ok: true, root: start.displayPath, files: files }
    }

    async function extractPages(processPath, workdir, pageCount) {
      const total = Math.max(1, Math.min(pageCount || 1, MAX_PAGES))
      const chunks = []
      for (let start = 1; start <= total; start += CHUNK_PAGES) {
        const end = Math.min(total, start + CHUNK_PAGES - 1)
        const result = await runCommand(
          'pdftotext -cropbox -bbox-layout -enc UTF-8 -f ' + start + ' -l ' + end + ' ' + quoteArg(processPath) + ' -',
          workdir,
        )
        if (result.truncated) return null
        if (result.out.trim() === '') return null
        chunks.push(result.out)
      }
      const pages = layoutToPages(chunks.join(''))
      if (pages === null || pages.length === 0) return null
      while (pages.length < total) pages.push([])
      return pages.slice(0, total)
    }

    async function openDocument(rawPath) {
      if (fsService === undefined) return { ok: false, error: 'fs 服务不可用' }
      const cleaned = String(rawPath || '').trim().replace(/^"(.*)"$/, '$1')
      if (cleaned === '') return { ok: false, error: '请先填写 PDF 路径' }
      const root = workspaceRoot()
      const resolveOptions = !isAbsolutePath(cleaned) && root !== '' ? { cwd: root } : {}
      let target
      try {
        target = await fsService.resolve(cleaned, resolveOptions)
      } catch (error) {
        return { ok: false, error: '无法解析路径：' + describeError(error) }
      }
      let info
      try {
        info = await fsService.stat(target)
      } catch (error) {
        info = undefined
      }
      if (info === undefined) return { ok: false, error: '文件不存在：' + target.displayPath }
      if (info.type !== 'file') return { ok: false, error: '不是普通文件：' + target.displayPath }
      let processPath
      try {
        processPath = fsService.processPath(target)
      } catch (error) {
        processPath = target.displayPath
      }
      if (!/\.pdf$/i.test(processPath)) return { ok: false, error: '只支持 PDF 文件' }
      if (typeof info.size === 'number' && info.size > MAX_PDF_BYTES) return { ok: false, error: 'PDF 超过 256MB，未打开' }

      const cacheKey = processPath
      const cached = pageCache.get(cacheKey)
      let pages
      let pageCount
      let mode = 'layout'
      if (cached !== undefined && cached.version === info.version) {
        pages = cached.pages
        pageCount = cached.pageCount
        mode = cached.mode
      } else {
        const infoResult = await runCommand('pdfinfo -enc UTF-8 ' + quoteArg(processPath), root)
        pageCount = 1
        const pagesMatch = /^Pages:\s+(\d+)/m.exec(infoResult.out || '')
        if (pagesMatch) pageCount = Number(pagesMatch[1]) || 1
        if (pageCount > MAX_PAGES) pageCount = MAX_PAGES

        pages = await extractPages(processPath, root, pageCount)
        if (pages === null) {
          mode = 'plain'
          const textResult = await runCommand('pdftotext -enc UTF-8 ' + quoteArg(processPath) + ' -', root)
          const plainPages = plainTextToPages(textResult.out)
          if (plainPages.length === 0) {
            const reason = textResult.err.trim() !== '' ? commandError(textResult.err) : '没有可提取的文字（扫描版 PDF？）'
            return { ok: false, error: '文字提取失败：' + reason }
          }
          pages = plainPages
          if (pages.length > pageCount) pageCount = pages.length
          while (pages.length < pageCount) pages.push([])
        }
        pageCache.set(cacheKey, { version: info.version, pages: pages, pageCount: pageCount, mode: mode })
      }

      documentSeq += 1
      const docId = 'doc' + documentSeq + '-' + Date.now().toString(36)
      const name = processPath.split(/[\\/]/).pop() || processPath
      documents.set(docId, { path: processPath, name: name, version: info.version, pages: pages })
      const displayPages = pages.map(function (blocks, pageIndex) {
        return blocks.map(function (block) {
          if (block.k !== 'image') return block
          return Object.assign({}, block, { url: webServer === undefined ? '' : '/cordis-pdfdock/figure/' + docId + '/' + (pageIndex + 1) + '/' + block.figureIndex + '.png' })
        })
      })
      return {
        ok: true,
        doc: {
          docId: docId,
          version: String(info.version || ''),
          name: name,
          path: processPath,
          pageCount: pageCount,
          pages: displayPages,
          mode: mode,
          rawUrl: webServer === undefined ? '' : '/cordis-pdfdock/raw/' + docId,
        },
      }
    }

    harness.handle('health', function () {
      let model = ''
      try {
        const selection = defaultModel && typeof defaultModel.currentSelection === 'function' ? defaultModel.currentSelection() : undefined
        if (selection && typeof selection.provider === 'string') model = selection.provider + '/' + selection.model
      } catch (error) {
        model = ''
      }
      return {
        fs: fsService !== undefined,
        shell: shellService !== undefined,
        webServer: webServer !== undefined,
        llm: llmService !== undefined,
        model: model,
        root: workspaceRoot(),
      }
    })

    harness.handle('list', async function (args) {
      const payload = args !== null && typeof args === 'object' ? args : {}
      const dir = typeof payload.dir === 'string' ? payload.dir : ''
      try {
        return await listPdfs(dir)
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
    })

    harness.handle('open', async function (args) {
      const payload = args !== null && typeof args === 'object' ? args : {}
      const path = typeof payload.path === 'string' ? payload.path : ''
      try {
        const localPath = /^https?:\/\//i.test(path.trim()) ? await downloadArxiv(path, workspaceRoot()) : path
        return await openDocument(localPath)
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
    })

    harness.handle('translate', async function (args, progress) {
      const payload = args !== null && typeof args === 'object' ? args : {}
      const text = typeof payload.text === 'string' ? payload.text.trim() : ''
      const kind = payload.kind === 'explain' ? 'explain' : payload.kind === 'ask' ? 'ask' : 'translate'
      if (text === '') return { ok: false, error: '没有可处理的文本' }
      // 追问带整篇论文正文，上限放宽；翻译/讲解只需要片段
      const limit = kind === 'ask' ? 240000 : 12000
      try {
        if(text.length>limit)return {ok:false,error:'文本过长，请分段处理'}
        return await translateText(text, kind, progress)
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
    })

    if (webServer !== undefined && fsService !== undefined) {
      ctx.effect(function () {
        return webServer.register({
          kind: 'prefix',
          path: '/cordis-pdfdock',
          handler: async function (req, res) {
            try {
              const url = String(req && req.url ? req.url : '')
              const figureMatch = /^\/cordis-pdfdock\/figure\/([A-Za-z0-9-]+)\/([1-9][0-9]*)\/(0|[1-9][0-9]*)\.png$/.exec(url.split('?')[0])
              if (figureMatch) {
                const doc = documents.get(figureMatch[1])
                const page = Number(figureMatch[2])
                const block = doc && doc.pages[page - 1] && doc.pages[page - 1].find(function (b) {
                  return b.k === 'image' && b.figureIndex === Number(figureMatch[3])
                })
                if (!block) {
                  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
                  res.end('unknown figure')
                  return
                }
                const target = await fsService.resolve(doc.path, {})
                const info = await fsService.stat(target)
                if (!info || info.version !== doc.version) {
                  res.writeHead(409, { 'content-type': 'text/plain; charset=utf-8' })
                  res.end('PDF 已更改，请重新打开')
                  return
                }
                if (typeof renderFigure !== 'function') throw new Error('图表渲染不可用，请更新插件包')
                const bytes = await renderFigure({ path: fsService.processPath(target), version: doc.version, page: page, rect: block.rect })
                res.writeHead(200, { 'content-type': 'image/png', 'content-length': String(bytes.length), 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' })
                res.end(bytes)
                return
              }
              const match = /^\/cordis-pdfdock\/raw\/([A-Za-z0-9-]+)/.exec(url)
              const doc = match ? documents.get(match[1]) : undefined
              if (doc === undefined) {
                res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
                res.end('unknown pdf document')
                return
              }
              const target = await fsService.resolve(doc.path, {})
              const bytes = await fsService.readBytes(target, undefined, MAX_PDF_BYTES)
              const total = bytes.byteLength
              const headers = function (extra) {
                return Object.assign({
                  'content-type': 'application/pdf',
                  'accept-ranges': 'bytes',
                  'cache-control': 'no-store',
                  'content-disposition': 'inline; filename="document.pdf"',
                }, extra)
              }
              const rangeHeader = req.headers && req.headers.range ? String(req.headers.range) : ''
              const rangeMatch = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
              if (rangeMatch && total > 0) {
                let start = 0
                let end = total - 1
                if (rangeMatch[1] === '' && rangeMatch[2] !== '') {
                  start = Math.max(0, total - Number(rangeMatch[2]))
                } else {
                  start = Number(rangeMatch[1] || 0)
                  if (rangeMatch[2] !== '') end = Math.min(Number(rangeMatch[2]), total - 1)
                }
                if (start > end || start >= total) {
                  res.writeHead(416, { 'content-range': 'bytes */' + String(total) })
                  res.end()
                  return
                }
                const chunk = bytes.subarray(start, end + 1)
                res.writeHead(206, headers({
                  'content-length': String(chunk.byteLength),
                  'content-range': 'bytes ' + String(start) + '-' + String(end) + '/' + String(total),
                }))
                res.end(chunk)
                return
              }
              res.writeHead(200, headers({ 'content-length': String(total) }))
              res.end(bytes)
            } catch (error) {
              try {
                res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
                res.end('paperdock error: ' + describeError(error))
              } catch (ignored) {
                /* 响应已结束 */
              }
            }
          },
        })
      }, 'paperdock-route')
    }
  },
}
