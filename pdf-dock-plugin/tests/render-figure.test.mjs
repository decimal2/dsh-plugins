import { test } from 'node:test'
import assert from 'node:assert/strict'
let createFigureRenderer
try { ({ createFigureRenderer } = await import('../../paperdock-plugin/src/render-figure.mjs')) } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e }
const rect = { x0: 50, y0: 100, x1: 250, y1: 300 }
const png = Buffer.from('89504e470d0a1a0a00000000', 'hex')
test('renderer deduplicates concurrent crops and passes argument array without a shell', async () => {
  assert.equal(typeof createFigureRenderer, 'function')
  let calls = 0
  const render = createFigureRenderer(async (file, args, options) => {
    calls++
    assert.equal(file, 'pdftoppm')
    assert.equal(args.at(-1), 'C:\\papers\\a & b.pdf')
    assert.equal(args[args.indexOf('-W') + 1], '400')
    assert.equal(options.shell, false)
    return { stdout: png }
  })
  const req = { path: 'C:\\papers\\a & b.pdf', version: '1', page: 2, rect }
  const images = await Promise.all([render(req), render(req)])
  assert.deepEqual(images, [png, png])
  await render(req)
  assert.equal(calls, 1)
  await render({ ...req, version: '2' })
  assert.equal(calls, 2)
})
test('renderer rejects malformed crops before launching a process', async () => {
  assert.equal(typeof createFigureRenderer, 'function')
  const render = createFigureRenderer(() => { throw new Error('must not launch') })
  await assert.rejects(render({ path: 'a.pdf', page: 0, rect }), /invalid/i)
  await assert.rejects(render({ path: 'a.pdf', page: 1, rect: { ...rect, x0: NaN } }), /invalid/i)
  await assert.rejects(render({ path: 'a.pdf', page: 1, rect: { ...rect, x1: -1 } }), /invalid/i)
})
test('failed renders are retriable and not cached', async () => {
  assert.equal(typeof createFigureRenderer, 'function')
  let calls = 0
  const render = createFigureRenderer(async () => { if (++calls === 1) throw new Error('renderer missing'); return { stdout: png } })
  const req = { path: 'a.pdf', page: 1, rect }
  await assert.rejects(render(req), /renderer missing/)
  assert.deepEqual(await render(req), png)
})

test('renderer limits concurrent processes to two and releases slots after errors', async () => {
  let active = 0, peak = 0
  const render = createFigureRenderer(async () => {
    active++; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 5))
    active--
    return { stdout: png }
  })
  await Promise.all(Array.from({ length: 6 }, (_, index) => render({ path: 'a.pdf', page: index + 1, rect })))
  assert.equal(peak, 2)
})

test('non-PNG output is rejected instead of cached as an image', async () => {
  const render = createFigureRenderer(async () => ({ stdout: Buffer.from('not a png') }))
  await assert.rejects(render({ path: 'a.pdf', page: 1, rect }), /PNG/)
})
