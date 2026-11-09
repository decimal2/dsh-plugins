import { mkdir, realpath, lstat, open, link, unlink } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'

const MAX_BYTES = 256 * 1024 * 1024
const pending = new Map()

export function parseArxivLink(input) {
  let url
  try { url = new URL(String(input).trim()) } catch { throw new Error('请粘贴完整的 arXiv 摘要页或 PDF 链接') }
  if (!['https:', 'http:'].includes(url.protocol) || !['arxiv.org', 'www.arxiv.org', 'export.arxiv.org'].includes(url.hostname) || url.port || url.username || url.password) {
    throw new Error('仅支持 arxiv.org 的论文链接')
  }
  const match = url.pathname.match(/^\/(?:abs|pdf|html)\/(.+?)\/?$/)
  const id = match?.[1].replace(/\.pdf$/i, '')
  if (!id || !/^(?:\d{2}(?:0[1-9]|1[0-2])\.\d{4,5}|[a-z][a-z.-]*(?:\.[A-Z]{2})?\/\d{2}(?:0[1-9]|1[0-2])\d{3})(?:v[1-9]\d*)?$/.test(id)) {
    throw new Error('无法识别 arXiv 论文编号，请使用摘要页或 PDF 链接')
  }
  return { id, url: 'https://arxiv.org/pdf/' + id, filename: 'arxiv-' + id.replace('/', '-') + '.pdf' }
}

async function existingPdf(path, maxBytes) {
  let stat
  try { stat = await lstat(path) } catch (error) { if (error.code === 'ENOENT') return false; throw error }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) throw new Error('目标文件不是可复用的 PDF，请检查：' + path)
  const file = await open(path, 'r')
  try {
    const header = Buffer.alloc(5)
    await file.read(header, 0, 5, 0)
    if (header.toString() !== '%PDF-') throw new Error('本地同名文件不是 PDF，请先移走：' + path)
  } finally { await file.close() }
  return true
}

export async function downloadArxiv(input, workspace, { fetchImpl = fetch, maxBytes = MAX_BYTES, timeoutMs = 120000 } = {}) {
  const paper = parseArxivLink(input)
  if (!workspace || !isAbsolute(workspace)) throw new Error('请先打开一个工作区，再下载 arXiv 论文')
  const root = await realpath(workspace)
  const folder = join(root, 'paper_pdfs')
  await mkdir(folder, { recursive: true })
  const actualFolder = await realpath(folder)
  const rel = relative(root, actualFolder)
  if (rel === '..' || rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(rel)) throw new Error('paper_pdfs 目录指向工作区外，未下载')
  const path = join(actualFolder, paper.filename)
  if (pending.has(path)) return pending.get(path)
  const operation = (async () => {
    if (await existingPdf(path, maxBytes)) return path
    let temporary, file
    const signal = AbortSignal.timeout(timeoutMs)
    try {
      let url = paper.url, response
      for (let redirects = 0; redirects <= 3; redirects++) {
        response = await fetchImpl(url, { redirect: 'manual', signal, headers: { Accept: 'application/pdf' } })
        if (![301,302,303,307,308].includes(response.status)) break
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location || redirects === 3) throw new Error('arXiv 下载重定向异常')
        const next = new URL(location, url)
        parseArxivLink(next.href)
        if (next.protocol !== 'https:') throw new Error('arXiv 下载重定向必须使用 HTTPS')
        url = next.href
      }
      if (!response.ok) { await response.body?.cancel(); throw new Error('arXiv 下载失败：HTTP ' + response.status) }
      if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('PDF 超过下载大小限制') }
      if (!response.body) throw new Error('arXiv 返回了空文件')
      temporary = path + '.' + randomUUID() + '.part'
      file = await open(temporary, 'wx')
      let size = 0, header = Buffer.alloc(0)
      for await (const chunk of response.body) {
        signal.throwIfAborted()
        size += chunk.length
        if (size > maxBytes) throw new Error('PDF 超过下载大小限制')
        if (header.length < 5) header = Buffer.concat([header, Buffer.from(chunk).subarray(0, 5 - header.length)])
        if (header.length === 5 && header.toString() !== '%PDF-') throw new Error('arXiv 返回的不是 PDF，可能被限流或需要稍后重试')
        await file.writeFile(chunk)
      }
      if (size < 5 || header.toString() !== '%PDF-') throw new Error('arXiv 返回了空文件或无效 PDF')
      await file.close(); file = null
      try { await link(temporary, path) } catch (error) {
        if (error.code !== 'EEXIST') throw error
        await existingPdf(path, maxBytes)
      }
      return path
    } catch (error) {
      if (signal.aborted) throw new Error('arXiv 下载超时，请检查网络后重试')
      throw error
    } finally {
      await file?.close()
      if (temporary) await unlink(temporary).catch(() => {})
    }
  })()
  pending.set(path, operation)
  try { return await operation } finally { pending.delete(path) }
}
