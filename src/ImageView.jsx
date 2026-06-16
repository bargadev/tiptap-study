import { NodeViewWrapper } from '@tiptap/react'
import { useRef } from 'react'

export default function ImageView({ node, updateAttributes, selected, editor, getPos }) {
  const imgRef = useRef(null)
  const align = node.attrs.align || 'none'

  // dentro de coluna? -> mover entre colunas. senão -> drag Notion (linha azul + colunas/reordenar)
  const inColumn = (() => {
    if (typeof getPos !== 'function') return false
    try {
      const $pos = editor.state.doc.resolve(getPos())
      for (let d = $pos.depth; d >= 0; d--) {
        if ($pos.node(d).type.name === 'column') return true
      }
    } catch {
      /* posição ainda não resolvível */
    }
    return false
  })()

  // ---------- dentro de coluna: mover entre colunas ----------
  const startColumnMove = (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    let moved = false
    const cols = [...editor.view.dom.querySelectorAll('.cols-editable .col')]
    const clearHl = () => cols.forEach((c) => c.classList.remove('col-drop-target'))
    const colUnder = (x, y) =>
      cols.findIndex((c) => {
        const r = c.getBoundingClientRect()
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
      })

    let last = -1
    const onMove = (e) => {
      if (!moved && Math.abs(e.clientX - startX) < 4 && Math.abs(e.clientY - startY) < 4) return
      moved = true
      const idx = colUnder(e.clientX, e.clientY)
      if (idx !== last) {
        clearHl()
        if (idx >= 0) cols[idx].classList.add('col-drop-target')
        last = idx
      }
    }
    const onUp = (e) => {
      clearHl()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (!moved) {
        if (typeof getPos === 'function') editor.commands.setNodeSelection(getPos())
        return
      }
      const targetIdx = colUnder(e.clientX, e.clientY)
      if (targetIdx < 0) return
      let i = 0
      let targetPos = null
      let targetNode = null
      editor.state.doc.descendants((n, pos) => {
        if (n.type.name === 'column') {
          if (i === targetIdx) {
            targetPos = pos
            targetNode = n
          }
          i++
        }
      })
      if (targetPos == null) return
      const imgPos = getPos()
      if (imgPos == null) return
      if (imgPos > targetPos && imgPos < targetPos + targetNode.nodeSize) return
      const insertAt = targetPos + targetNode.nodeSize - 1
      const tr = editor.state.tr
      tr.delete(imgPos, imgPos + node.nodeSize)
      const mapped = tr.mapping.map(insertAt)
      tr.insert(mapped, node.type.create(node.attrs))
      editor.view.dispatch(tr)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // ---------- barras laterais: redimensiona ----------
  const startResize = (side) => (event) => {
    event.preventDefault()
    event.stopPropagation()
    const dir = side === 'left' ? -1 : 1
    const startX = event.clientX
    const startWidth = imgRef.current.offsetWidth
    const onMove = (e) => {
      const newWidth = Math.max(40, startWidth + dir * (e.clientX - startX))
      updateAttributes({ width: Math.round(newWidth) })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // só a imagem dentro de coluna arrasta por si (mover entre colunas);
  // em fluxo normal, quem arrasta é o handle ⠿ externo.
  const onDrag = inColumn ? startColumnMove : undefined
  const dragTitle = inColumn ? 'Arraste para mover entre colunas' : undefined

  return (
    <NodeViewWrapper
      className={`img-wrapper align-${align}` + (selected ? ' is-selected' : '')}
    >
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt || ''}
        style={{ width: node.attrs.width ? node.attrs.width + 'px' : undefined }}
        draggable="false"
        onPointerDown={onDrag}
        title={dragTitle}
      />
      <span
        className="img-handle img-handle-left"
        onPointerDown={startResize('left')}
        onDragStart={(e) => e.preventDefault()}
        title="Arraste para redimensionar"
      />
      <span
        className="img-handle img-handle-right"
        onPointerDown={startResize('right')}
        onDragStart={(e) => e.preventDefault()}
        title="Arraste para redimensionar"
      />
    </NodeViewWrapper>
  )
}
