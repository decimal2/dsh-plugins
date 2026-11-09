/** Caption-anchored crops in PDF points. Deliberately conservative: no caption,
 * no inferred figure. Rendering the page crop preserves vector graphics too. */
function findFigureRegions(page, layout) {
  const textOf = function (line) { return line.words.map(function (w) { return w.t }).join(' ').trim() }
  const captionPattern = /^(figure|fig\.?|table|图|表)\s*(?:[A-Z]\.?\s*)?\d+(?:[.-]\d+)*\s*[:：.．]/i
  const lines = page.lines.slice().sort(function (a, b) { return a.y0 - b.y0 || a.x0 - b.x0 })
  const captions = lines.filter(function (line) { return captionPattern.test(textOf(line)) })
  const regions = []
  for (const caption of captions) {
    const height = caption.y1 - caption.y0
    const match = captionPattern.exec(textOf(caption))
    const kind = /^(table|表)$/i.test(match[1]) ? 'table' : 'figure'
    const boundary = layout && layout.boundary
    const full = !boundary || (caption.x0 < boundary && caption.x1 > boundary)
    const leftSide = !full && caption.x1 <= boundary
    const lane = lines.filter(function (line) {
      const center = (line.x0 + line.x1) / 2
      return full || (leftSide ? center < boundary : center >= boundary)
    })
    const aligned = lane.filter(function (line) { return line.x1 - line.x0 > (full ? page.width * 0.55 : page.width * 0.24) })
    const x0 = Math.max(0, Math.min(caption.x0, ...aligned.map(function (l) { return l.x0 })) - 4)
    const x1 = Math.min(page.width, Math.max(caption.x1, ...aligned.map(function (l) { return l.x1 })) + 4,
      !full && leftSide ? boundary - 4 : page.width)
    const cropLeft = !full && !leftSide ? Math.max(boundary + 4, x0) : x0
    const captionLines = [caption]
    // Caption continuations have similar font height, line spacing and left edge.
    for (const line of lane) {
      const last = captionLines[captionLines.length - 1]
      if (line.y0 <= last.y0 || line.y0 - last.y1 > height * 0.65) continue
      if (Math.abs(line.x0 - caption.x0) > height * 1.5 ||
          Math.abs(line.y1 - line.y0 - height) > height * 0.15 || captionPattern.test(textOf(line))) continue
      if (captionLines.length < 12) captionLines.push(line)
    }
    const lastCaption = captionLines[captionLines.length - 1]
    const hasPeers = function (line) {
      return lane.some(function (other) {
        return other !== line && Math.abs(other.y0 - line.y0) < height * 0.6 &&
          (other.x0 >= line.x1 + 8 || other.x1 <= line.x0 - 8)
      })
    }
    const isBody = function (line) {
      return !hasPeers(line) && line.y1 - line.y0 <= height * 1.8 && line.y1 - line.y0 >= height * 0.98 &&
        Math.abs(line.x0 - caption.x0) < height * 1.4 && textOf(line).length > 6
    }
    let top, bottom
    if (kind === 'figure') {
      bottom = caption.y0 - 3
      // A preceding caption/table or aligned body paragraph is a hard boundary.
      const barriers = lane.filter(function (line) {
        return line.y1 < caption.y0 && (isBody(line) || captions.includes(line))
      }).map(function (line) { return line.y1 })
      for (const region of regions) {
        if (region.rect.x0 < x1 && region.rect.x1 > cropLeft && region.rect.y1 < caption.y0) {
          barriers.push(region.rect.y1)
          barriers.push(region.captionLines[region.captionLines.length - 1].y1)
        }
      }
      top = barriers.length ? Math.max(...barriers) + 3 : Math.max(0, Math.min(page.height * 0.09, ...lane.map(function (l) { return l.y0 - 12 })))
    } else {
      top = lastCaption.y1 + 3
      const rows = lane.filter(function (line) { return line.y0 >= top })
      bottom = top
      for (const line of rows) {
        if (captionPattern.test(textOf(line)) || isBody(line)) break
        if (bottom > top && line.y0 - bottom > height * 1.2 &&
            !(line.y0 - bottom <= height * 2.2 && hasPeers(line) && Math.abs(line.y1 - line.y0 - height) <= height * 0.15)) break
        if (bottom === top && line.y0 - top > height * 3) break
        bottom = Math.max(bottom, line.y1)
      }
      bottom += 4
    }
    if (bottom - top < 32 || x1 - cropLeft < 60) continue
    regions.push({ kind: kind, rect: { x0: cropLeft, y0: top, x1: x1, y1: Math.min(page.height, bottom) }, captionLines: captionLines, label: textOf(caption).slice(0, 160) })
  }
  return regions
}
