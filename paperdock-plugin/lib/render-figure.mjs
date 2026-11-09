import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/** Instance-local, bounded cache; PNG stays binary (never shell stdout text). */
export function createFigureRenderer(run = promisify(execFile)) {
  const cache = new Map()
  const pending = new Map()
  const waiters = []
  let bytes = 0
  let active = 0
  const budget = 32 * 1024 * 1024
  return async function renderFigure({ path, version, page, rect }) {
    if (typeof path !== 'string' || !path || !Number.isInteger(page) || page < 1 || page > 400 ||
        !rect || !['x0', 'y0', 'x1', 'y1'].every(k => Number.isFinite(rect[k])) ||
        rect.x0 < 0 || rect.y0 < 0 || rect.x1 <= rect.x0 || rect.y1 <= rect.y0 ||
        rect.x1 > 14400 || rect.y1 > 14400) throw new Error('invalid figure crop')
    const key = JSON.stringify([path, version, page, rect])
    if (cache.has(key)) {
      const value = cache.get(key)
      cache.delete(key)
      cache.set(key, value)
      return value
    }
    if (pending.has(key)) return pending.get(key)
    if (pending.size >= 64) throw new Error('图表加载繁忙，请稍后重试')
    const task = (async () => {
      if (active >= 2) await new Promise(resolve => waiters.push(resolve))
      else active++
      try {
        const scale = Math.min(2, 4096 / Math.max(rect.x1 - rect.x0, rect.y1 - rect.y0))
        const x = Math.floor(rect.x0 * scale), y = Math.floor(rect.y0 * scale)
        const args = ['-f', String(page), '-l', String(page), '-singlefile', '-cropbox', '-r', String(72 * scale),
          '-x', String(x), '-y', String(y), '-W', String(Math.ceil(rect.x1 * scale) - x),
          '-H', String(Math.ceil(rect.y1 * scale) - y), '-png', path]
        const result = await run('pdftoppm', args, {
          encoding: 'buffer', shell: false, windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024,
        })
        const output = result.stdout
        if (!Buffer.isBuffer(output) || output.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
          throw new Error('图表渲染没有返回 PNG 图片')
        }
        while (bytes + output.length > budget && cache.size) {
          const oldest = cache.keys().next().value
          bytes -= cache.get(oldest).length
          cache.delete(oldest)
        }
        cache.set(key, output)
        bytes += output.length
        return output
      } finally {
        const next = waiters.shift()
        if (next) next()
        else active--
      }
    })()
    pending.set(key, task)
    try { return await task } finally { pending.delete(key) }
  }
}
