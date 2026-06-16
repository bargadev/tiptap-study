import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// Uma coluna: contém blocos editáveis (parágrafos, imagem, listas...).
export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,

  addAttributes() {
    return {
      // largura relativa (fr); null = igual às demais
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute('data-width')
          return w ? parseFloat(w) : null
        },
        renderHTML: (attrs) =>
          attrs.width ? { 'data-width': attrs.width } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'column', class: 'col' }),
      0,
    ]
  },
})

// Bloco de 3 colunas. Tudo dentro é editável no Tiptap.
export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,3}',
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'columns',
        class: 'cols-editable',
      }),
      0,
    ]
  },

  addCommands() {
    const col = (text) => ({
      type: 'column',
      content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
    })
    return {
      insertColumns:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: 'columns',
            content: [col('Coluna esquerda…'), col('Centro…'), col('Coluna direita…')],
          }),
    }
  },

  // aplica grid-template-columns a partir das larguras (fr) de cada coluna,
  // sem mexer na renderização do nó (evita quebrar o grid)
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decos = []
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'columns') return
              const widths = []
              node.forEach((c) => widths.push(c.attrs.width || 1))
              const tpl = widths.map((w) => `${w}fr`).join(' ')
              decos.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  style: `grid-template-columns:${tpl}`,
                })
              )
            })
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})
