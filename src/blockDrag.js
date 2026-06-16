// Drag estilo Notion para QUALQUER bloco (texto ou imagem), disparado pelo handle ⠿:
// - linha azul VERTICAL na lateral de um bloco -> cria 2 colunas
// - linha azul HORIZONTAL entre blocos -> move/reordena
// - na borda externa (topo/base) de um bloco de colunas -> 1 linha por coluna
//   (largura total) -> move o bloco para fora das colunas

// bloco mais interno sob (x,y): trata textblocks aninhados E nós atômicos (imagem)
export function resolveBlock(editor, x, y) {
  const c = editor.view.posAtCoords({ left: x, top: y })
  if (!c) return null
  // nó atômico/folha (ex.: imagem): 'inside' aponta direto para ele
  if (c.inside >= 0) {
    const node = editor.state.doc.nodeAt(c.inside)
    if (node && node.isBlock && node.type.name !== 'columns' && node.type.name !== 'column') {
      const dom = editor.view.nodeDOM(c.inside)
      if (dom && dom.nodeType === 1) return { pos: c.inside, node, dom }
    }
  }
  // textblocks (parágrafo/título), inclusive aninhados em colunas
  const $pos = editor.state.doc.resolve(c.pos)
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

const getIndicator = () => {
  let el = document.getElementById('block-drop-indicator')
  if (!el) {
    el = document.createElement('div')
    el.id = 'block-drop-indicator'
    document.body.appendChild(el)
  }
  el.innerHTML = ''
  el.style.display = 'none'
  return el
}

const addLine = (indicator, { left, top, width, height }) => {
  const line = document.createElement('div')
  line.className = 'drop-indicator'
  line.style.left = `${left}px`
  line.style.top = `${top}px`
  if (width != null) line.style.width = `${width}px`
  if (height != null) line.style.height = `${height}px`
  indicator.appendChild(line)
  indicator.style.display = 'block'
}

const makeGhost = (node) => {
  let el
  if (node.type.name === 'image') {
    el = document.createElement('img')
    el.src = node.attrs.src
    el.className = 'drag-ghost'
  } else {
    el = document.createElement('div')
    el.className = 'drag-ghost drag-ghost-text'
    el.textContent = node.textContent?.slice(0, 60) || node.type.name
  }
  document.body.appendChild(el)
  return el
}

const insertAtPos = (editor, dragPos, dragNode, insertPos) => {
  try {
    const tr = editor.state.tr
    tr.delete(dragPos, dragPos + dragNode.nodeSize)
    const mapped = tr.mapping.map(insertPos)
    tr.insert(mapped, dragNode)
    editor.view.dispatch(tr)
  } catch {
    /* drop inválido — ignora */
  }
}

const createColumns = (editor, dragPos, dragNode, { targetPos, targetNode, side }) => {
  const { schema, doc } = editor.state
  const columnType = schema.nodes.column
  const columnsType = schema.nodes.columns
  if (!columnType || !columnsType) return
  if (targetNode.type === columnsType || dragNode.type === columnsType) return

  const $t = doc.resolve(targetPos)

  // alvo já está dentro de uma coluna -> adiciona nova coluna ao layout existente
  if ($t.parent.type.name === 'column') {
    const columnDepth = $t.depth
    const columnsDepth = columnDepth - 1
    const columnsNode = $t.node(columnsDepth)
    if (columnsNode.childCount >= 3) return // máx. 3 colunas
    const columnNode = $t.node(columnDepth)
    const columnPos = $t.before(columnDepth)
    const insertColPos = side === 'left' ? columnPos : columnPos + columnNode.nodeSize
    try {
      const tr = editor.state.tr
      tr.delete(dragPos, dragPos + dragNode.nodeSize)
      const mapped = tr.mapping.map(insertColPos)
      tr.insert(mapped, columnType.create(null, dragNode))
      editor.view.dispatch(tr)
    } catch {
      /* drop inválido — ignora */
    }
    return
  }

  // alvo no nível normal -> embrulha alvo + arrastado num bloco de 2 colunas
  const dragCol = columnType.create(null, dragNode)
  const tgtCol = columnType.create(null, targetNode)
  const cols = side === 'left' ? [dragCol, tgtCol] : [tgtCol, dragCol]

  try {
    const tr = editor.state.tr
    tr.delete(dragPos, dragPos + dragNode.nodeSize)
    const from = tr.mapping.map(targetPos)
    const to = tr.mapping.map(targetPos + targetNode.nodeSize)
    tr.replaceWith(from, to, columnsType.create(null, cols))
    editor.view.dispatch(tr)
  } catch {
    /* drop inválido (ex.: esvaziaria uma coluna) — ignora */
  }
}

export function startBlockDrag(editor, dragPos, dragNode, ev) {
  let drop = null
  const indicator = getIndicator()
  const ghost = makeGhost(dragNode)

  const compute = (x, y) => {
    const blk = resolveBlock(editor, x, y)
    if (!blk) return null
    const { pos: targetPos, node: targetNode, dom } = blk
    if (targetPos === dragPos) return null
    const rect = dom.getBoundingClientRect()

    const relX = (x - rect.left) / rect.width
    if (relX < 0.28) return { mode: 'col', side: 'left', targetPos, targetNode, rect }
    if (relX > 0.72) return { mode: 'col', side: 'right', targetPos, targetNode, rect }
    const top = y < rect.top + rect.height / 2

    // borda externa de um bloco de colunas?
    const $t = editor.state.doc.resolve(targetPos)
    let colsDepth = -1
    for (let d = $t.depth; d >= 0; d--) {
      if ($t.node(d).type.name === 'columns') {
        colsDepth = d
        break
      }
    }
    if (colsDepth >= 0) {
      const idx = $t.index($t.depth)
      const parent = $t.parent
      const isFirst = idx === 0
      const isLast = idx === parent.childCount - 1
      const columnsPos = $t.before(colsDepth)
      const columnsNode = $t.node(colsDepth)
      const columnsDom = editor.view.nodeDOM(columnsPos)
      const cr = columnsDom && columnsDom.getBoundingClientRect()
      // só a faixa estreita na borda externa vira "fora das colunas";
      // mais pra dentro, é reordenar dentro da coluna
      const nearTop = cr && top && isFirst && y < cr.top + 10
      const nearBottom = cr && !top && isLast && y > cr.bottom - 10
      if (nearTop || nearBottom) {
        const colRects = [...columnsDom.children].map((c) => c.getBoundingClientRect())
        return {
          mode: 'outer',
          edge: nearTop ? 'top' : 'bottom',
          columnsPos,
          columnsNode,
          colRects,
          lineY: nearTop ? cr.top - 2 : cr.bottom + 2,
        }
      }
    }
    return { mode: 'move', top, targetPos, targetNode, rect }
  }

  const update = (x, y) => {
    ghost.style.left = `${x + 12}px`
    ghost.style.top = `${y + 12}px`
    indicator.innerHTML = ''
    indicator.style.display = 'none'

    drop = compute(x, y)
    if (!drop) return

    if (drop.mode === 'col') {
      const lx = drop.side === 'left' ? drop.rect.left - 3 : drop.rect.right + 1
      addLine(indicator, { left: lx, top: drop.rect.top, width: 3, height: drop.rect.height })
    } else if (drop.mode === 'outer') {
      drop.colRects.forEach((cr) =>
        addLine(indicator, { left: cr.left, top: drop.lineY, width: cr.width, height: 3 })
      )
    } else {
      const ly = drop.top ? drop.rect.top - 2 : drop.rect.bottom + 2
      addLine(indicator, { left: drop.rect.left, top: ly, width: drop.rect.width, height: 3 })
    }
  }

  update(ev.clientX, ev.clientY)

  const onMove = (e) => update(e.clientX, e.clientY)
  const onUp = () => {
    indicator.remove()
    ghost.remove()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    if (!drop) return
    if (drop.mode === 'col') {
      createColumns(editor, dragPos, dragNode, drop)
    } else if (drop.mode === 'outer') {
      const insertPos =
        drop.edge === 'top' ? drop.columnsPos : drop.columnsPos + drop.columnsNode.nodeSize
      insertAtPos(editor, dragPos, dragNode, insertPos)
    } else {
      const insertPos = drop.top ? drop.targetPos : drop.targetPos + drop.targetNode.nodeSize
      insertAtPos(editor, dragPos, dragNode, insertPos)
    }
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
