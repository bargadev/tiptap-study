import { useEffect, useRef, useState } from 'react'
import { startBlockDrag } from './blockDrag.js'

// bloco mais interno sob o cursor (ignora os contêineres columns/column)
const blockAt = (editor, x, y) => {
  const hit = editor.view.posAtCoords({ left: x, top: y })
  if (!hit) return null
  const $pos = editor.state.doc.resolve(hit.pos)
  let depth = $pos.depth
  while (depth > 0) {
    const n = $pos.node(depth)
    if (n.isBlock && n.type.name !== 'columns' && n.type.name !== 'column') break
    depth--
  }
  if (depth < 1) return null
  const pos = $pos.before(depth)
  const node = $pos.node(depth)
  const dom = editor.view.nodeDOM(pos)
  if (!dom || dom.nodeType !== 1) return null
  return { pos, node, dom }
}

// Handle estilo Notion (+ ⠿):
// - "+"  insere um parágrafo abaixo do bloco
// - "⠿"  arrasta (fantasma + linha azul: colunas/reordenar) e clica abre "Turn into"
export default function CustomDragHandle({ editor }) {
  const groupRef = useRef(null)
  const target = useRef(null)
  const [menu, setMenu] = useState(null)

  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const wrapper = dom.closest('.editor') || dom
    const group = groupRef.current

    const show = (info) => {
      const rect = info.dom.getBoundingClientRect()
      group.style.opacity = '1'
      group.style.pointerEvents = 'auto'
      group.style.left = `${rect.left - 46}px`
      group.style.top = `${rect.top + Math.min(2, rect.height / 2)}px`
    }
    const hide = () => {
      group.style.opacity = '0'
      group.style.pointerEvents = 'none'
    }
    const onMove = (e) => {
      const info = blockAt(editor, e.clientX, e.clientY)
      if (info) {
        target.current = info
        show(info)
      }
    }
    dom.addEventListener('mousemove', onMove)
    wrapper.addEventListener('mouseleave', hide)
    return () => {
      dom.removeEventListener('mousemove', onMove)
      wrapper.removeEventListener('mouseleave', hide)
    }
  }, [editor])

  useEffect(() => {
    const onClickOutside = (e) => {
      if (!e.target.closest?.('.dh-menu') && !e.target.closest?.('.dh-group')) setMenu(null)
    }
    const onKey = (e) => e.key === 'Escape' && setMenu(null)
    document.addEventListener('click', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  // "+" insere parágrafo abaixo
  const addBlock = () => {
    const t = target.current
    if (!t || !editor) return
    const at = t.pos + t.node.nodeSize
    editor.chain().insertContentAt(at, { type: 'paragraph' }).setTextSelection(at + 1).focus().run()
  }

  // "⠿" arrasta ou (clique) abre menu
  const onGripDown = (e) => {
    if (e.button !== 0) return
    const blk = target.current
    if (!blk) return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    let dragging = false

    const onMove = (ev) => {
      if (dragging) return
      if (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4) {
        dragging = true
        cleanup()
        startBlockDrag(editor, blk.pos, blk.node, ev)
      }
    }
    const onUp = () => {
      cleanup()
      if (!dragging) {
        const r = groupRef.current.getBoundingClientRect()
        setMenu({ x: r.right + 6, y: r.top, target: blk })
      }
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const turnIntoColumns = (n) => {
    const t = menu?.target
    setMenu(null)
    if (!t || !editor) return
    const { node, pos } = t
    const { schema } = editor.state
    const columnType = schema.nodes.column
    const columnsType = schema.nodes.columns
    if (!columnType || !columnsType || node.type === columnsType) return

    const first = node.isBlock ? node : schema.nodes.paragraph.create()
    const cols = [columnType.create(null, first)]
    for (let i = 1; i < n; i++) cols.push(columnType.create(null, schema.nodes.paragraph.create()))

    editor.view.dispatch(
      editor.state.tr.replaceWith(pos, pos + node.nodeSize, columnsType.create(null, cols))
    )
    editor.view.focus()
  }

  const item = (n, label) => (
    <button className="dh-item" onClick={() => turnIntoColumns(n)}>
      <span className="dh-ic">
        {Array.from({ length: n }).map((_, i) => (
          <i key={i} />
        ))}
      </span>
      {label}
    </button>
  )

  return (
    <>
      <div ref={groupRef} className="dh-group">
        <button className="dh-plus" onClick={addBlock} title="Inserir bloco abaixo">
          +
        </button>
        <div className="dh-grip" onPointerDown={onGripDown} title="Arraste para mover • clique para opções" />
      </div>
      {menu && (
        <div className="dh-menu" style={{ left: menu.x, top: menu.y }}>
          <div className="dh-menu-label">Turn into</div>
          {item(2, '2 colunas')}
          {item(3, '3 colunas')}
        </div>
      )}
    </>
  )
}
