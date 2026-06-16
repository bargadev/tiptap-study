import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import ResizableImage from './ResizableImage.js'
import { Columns, Column } from './ColumnsNodes.js'
import CustomDragHandle from './CustomDragHandle.jsx'
import ColumnResizers from './ColumnResizers.jsx'
import { useRef } from 'react'

const STORAGE_KEY = 'tiptap-columns-content'

const IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#1e3a8a"/>
      </linearGradient></defs>
      <rect width="200" height="200" rx="14" fill="url(#g)"/>
      <text x="100" y="108" font-family="sans-serif" font-size="20"
            fill="#fff" text-anchor="middle">Imagem</text>
    </svg>`
  )

const CONTENT = `
  <p>Tudo aqui é editável. A imagem fica na coluna central, com texto à esquerda, à direita, acima e abaixo. Clique em qualquer parte e digite.</p>
  <div data-type="columns">
    <div data-type="column">
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus luctus urna sed urna ultricies ac tempor dui sagittis.</p>
      <p>Nulla fringilla, orci ac euismod semper, magna diam porttitor mauris.</p>
    </div>
    <div data-type="column">
      <p>Acima da imagem.</p>
      <img src="${IMG}" data-align="center" width="180" />
      <p>Abaixo da imagem.</p>
    </div>
    <div data-type="column">
      <p>Quisque lacus quam, egestas ac tincidunt a, lacinia vel velit. Aenean facilisis nulla vitae urna tincidunt congue.</p>
      <p>Vivamus id mollis quam. Morbi ac commodo nulla.</p>
    </div>
  </div>
`

export default function ColumnsEditor() {
  const fileInputRef = useRef(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      ResizableImage.configure({ allowBase64: true }),
      Columns,
      Column,
    ],
    content: localStorage.getItem(STORAGE_KEY) || CONTENT,
    onUpdate: ({ editor }) => localStorage.setItem(STORAGE_KEY, editor.getHTML()),
  })

  if (!editor) return null

  const onPickFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => editor.chain().focus().setImage({ src: reader.result }).run()
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const btn = (active) => 'tb-btn' + (active ? ' is-active' : '')

  return (
    <div className="editor">
      <div className="toolbar">
        <button className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()}>
          B
        </button>
        <button className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <em>I</em>
        </button>
        <button className={btn(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </button>
        <span className="tb-sep" />
        <button className="tb-btn" onClick={() => editor.chain().focus().insertColumns().run()}>
          + Colunas
        </button>
        <button className="tb-btn" onClick={() => fileInputRef.current?.click()}>
          Imagem (upload)
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onPickFile} />
        <span className="tb-sep" />
        <button
          className="tb-btn"
          onClick={() => {
            localStorage.removeItem(STORAGE_KEY)
            editor.commands.setContent(CONTENT)
          }}
        >
          Limpar
        </button>
      </div>

      <EditorContent editor={editor} className="editor-content" />
      <CustomDragHandle editor={editor} />
      <ColumnResizers editor={editor} />
    </div>
  )
}
