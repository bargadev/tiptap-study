import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  TableLayoutType,
  WidthType,
  BorderStyle,
} from 'docx'

const CONTENT_WIDTH = 9360 // twips (~6.5in)

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const NO_BORDERS = {
  top: NONE,
  bottom: NONE,
  left: NONE,
  right: NONE,
  insideHorizontal: NONE,
  insideVertical: NONE,
}

const headingLevel = (lvl) =>
  ({ 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 }[lvl] ||
    HeadingLevel.HEADING_2)

function decodeDataUrl(dataUrl) {
  const [meta, b64] = dataUrl.split(',')
  const mime = (meta.match(/data:(image\/[\w+]+)/) || [])[1] || 'image/png'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  let type = 'png'
  if (mime.includes('svg')) type = 'svg'
  else if (mime.includes('jpeg') || mime.includes('jpg')) type = 'jpg'
  else if (mime.includes('gif')) type = 'gif'
  else if (mime.includes('bmp')) type = 'bmp'
  return { data: bytes, type }
}

// coleta bytes + dimensões naturais de todas as imagens
async function buildImageCtx(editor, json) {
  const srcs = new Set()
  const walk = (n) => {
    if (!n) return
    if (n.type === 'image' && n.attrs?.src) srcs.add(n.attrs.src)
    ;(n.content || []).forEach(walk)
  }
  walk(json)

  const dom = {}
  editor.view.dom.querySelectorAll('img').forEach((img) => {
    dom[img.src] = { nw: img.naturalWidth, nh: img.naturalHeight }
  })

  const images = {}
  for (const src of srcs) {
    let data = null
    let type = 'png'
    try {
      if (src.startsWith('data:')) {
        const d = decodeDataUrl(src)
        data = d.data
        type = d.type
      } else {
        const res = await fetch(src)
        data = new Uint8Array(await res.arrayBuffer())
        type = (src.match(/\.(png|jpe?g|gif|bmp)/i) || [])[1]?.toLowerCase() || 'png'
        if (type === 'jpeg') type = 'jpg'
      }
    } catch {
      data = null
    }
    const d = dom[src] || {}
    images[src] = { data, type, nw: d.nw || 0, nh: d.nh || 0 }
  }
  return { images }
}

function inlineRuns(node) {
  if (!node.content) return []
  const runs = []
  for (const child of node.content) {
    if (child.type === 'text') {
      const marks = child.marks || []
      runs.push(
        new TextRun({
          text: child.text,
          bold: marks.some((m) => m.type === 'bold'),
          italics: marks.some((m) => m.type === 'italic'),
        })
      )
    }
  }
  return runs
}

function imageParagraph(node, ctx, maxW) {
  const info = ctx.images[node.attrs?.src]
  // svg precisa de fallback no docx; pula pra não quebrar a exportação
  if (!info || !info.data || info.type === 'svg') return new Paragraph({ children: [] })
  const nw = info.nw || 300
  const nh = info.nh || 200
  let w = node.attrs?.width || nw
  w = Math.min(w, maxW)
  const h = Math.round(w * (nh / nw || 0.66))
  return new Paragraph({
    children: [
      new ImageRun({ data: info.data, type: info.type, transformation: { width: Math.round(w), height: h } }),
    ],
  })
}

function listBlocks(listNode, ctx, maxW) {
  const out = []
  for (const li of listNode.content || []) {
    for (const child of li.content || []) {
      if (child.type === 'paragraph') {
        out.push(new Paragraph({ children: inlineRuns(child), bullet: { level: 0 } }))
      } else {
        out.push(...nodeToBlocks(child, ctx, maxW))
      }
    }
  }
  return out
}

function columnsTable(node, ctx) {
  const cols = node.content || []
  const widths = cols.map((c) => c.attrs?.width || 1)
  const sum = widths.reduce((a, b) => a + b, 0) || cols.length
  const colWidths = widths.map((w) => Math.round((w / sum) * CONTENT_WIDTH))
  const cells = cols.map((col, i) => {
    const inner = (col.content || []).flatMap((child) => nodeToBlocks(child, ctx, colWidths[i] - 200))
    return new TableCell({
      width: { size: colWidths[i], type: WidthType.DXA },
      margins: { top: 0, bottom: 0, left: 100, right: 100 },
      borders: { top: NONE, bottom: NONE, left: NONE, right: NONE },
      children: inner.length ? inner : [new Paragraph({ children: [] })],
    })
  })
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: colWidths,
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: [new TableRow({ children: cells })],
  })
}

function nodeToBlocks(node, ctx, maxW = CONTENT_WIDTH) {
  switch (node.type) {
    case 'paragraph':
      return [new Paragraph({ children: inlineRuns(node) })]
    case 'heading':
      return [new Paragraph({ heading: headingLevel(node.attrs?.level), children: inlineRuns(node) })]
    case 'bulletList':
    case 'orderedList':
      return listBlocks(node, ctx, maxW)
    case 'image':
      return [imageParagraph(node, ctx, Math.round(maxW / 14.6))] // twips->px aprox
    case 'columns':
      return [columnsTable(node, ctx)]
    default:
      return (node.content || []).flatMap((c) => nodeToBlocks(c, ctx, maxW))
  }
}

export async function exportToDocx(editor, filename = 'documento.docx') {
  const json = editor.getJSON()
  const ctx = await buildImageCtx(editor, json)
  const children = (json.content || []).flatMap((n) => nodeToBlocks(n, ctx))
  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
