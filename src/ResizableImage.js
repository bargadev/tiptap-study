import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import ImageView from './ImageView.jsx'

// Estende a extensão Image padrão adicionando:
// - atributo `width` (redimensionamento via alça de arraste)
// - atributo `align` (none | left | right | center; left/right usam float p/ o texto fluir ao lado)
export default Image.extend({
  // o arraste é feito só pelo handle ⠿ (DnD nativo desligado)
  draggable: false,

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('width'),
        renderHTML: (attributes) =>
          attributes.width ? { width: attributes.width } : {},
      },
      align: {
        default: 'none',
        parseHTML: (element) => element.getAttribute('data-align') || 'none',
        renderHTML: (attributes) =>
          attributes.align && attributes.align !== 'none'
            ? { 'data-align': attributes.align }
            : {},
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView)
  },
})
