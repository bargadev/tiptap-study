import { useEffect, useState } from 'react'

const GAP = 48 // = 3rem (gap do grid de colunas)

// Desenha alças entre as colunas; arrastar redistribui as larguras (fr).
export default function ColumnResizers({ editor }) {
  const [bars, setBars] = useState([])

  useEffect(() => {
    if (!editor) return
    const view = editor.view

    const recompute = () => {
      const list = []
      view.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'columns') return
        const dom = view.nodeDOM(pos)
        if (!dom || !dom.children || dom.children.length < 2) return
        const colsRect = dom.getBoundingClientRect()
        const kids = [...dom.children]
        for (let i = 0; i < kids.length - 1; i++) {
          const a = kids[i].getBoundingClientRect()
          const b = kids[i + 1].getBoundingClientRect()
          list.push({
            x: (a.right + b.left) / 2,
            top: colsRect.top,
            height: colsRect.height,
            columnsPos: pos,
            leftIdx: i,
          })
        }
      })
      setBars(list)
    }

    recompute()
    editor.on('update', recompute)
    editor.on('selectionUpdate', recompute)
    window.addEventListener('scroll', recompute, true)
    window.addEventListener('resize', recompute)
    return () => {
      editor.off('update', recompute)
      editor.off('selectionUpdate', recompute)
      window.removeEventListener('scroll', recompute, true)
      window.removeEventListener('resize', recompute)
    }
  }, [editor])

  const startResize = (e, bar) => {
    e.preventDefault()
    const view = editor.view
    const startNode = view.state.doc.nodeAt(bar.columnsPos)
    if (!startNode) return
    const startW = []
    startNode.forEach((c) => startW.push(c.attrs.width || 1))
    const sum = startW.reduce((a, b) => a + b, 0)
    const dom = view.nodeDOM(bar.columnsPos)
    const usable = (dom ? dom.offsetWidth : 600) - (startW.length - 1) * GAP
    const startX = e.clientX

    const onMove = (ev) => {
      const node = view.state.doc.nodeAt(bar.columnsPos)
      if (!node) return
      const dFr = ((ev.clientX - startX) / usable) * sum
      const left = startW[bar.leftIdx] + dFr
      const right = startW[bar.leftIdx + 1] - dFr
      const min = sum * 0.12
      if (left < min || right < min) return
      const tr = view.state.tr
      let i = 0
      node.forEach((col, offset) => {
        const colPos = bar.columnsPos + 1 + offset
        if (i === bar.leftIdx) tr.setNodeMarkup(colPos, undefined, { ...col.attrs, width: left })
        else if (i === bar.leftIdx + 1)
          tr.setNodeMarkup(colPos, undefined, { ...col.attrs, width: right })
        i++
      })
      view.dispatch(tr)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  if (!editor) return null
  return (
    <>
      {bars.map((bar, i) => (
        <div
          key={i}
          className="col-resizer"
          style={{ left: `${bar.x}px`, top: `${bar.top}px`, height: `${bar.height}px` }}
          onPointerDown={(e) => startResize(e, bar)}
        />
      ))}
    </>
  )
}
