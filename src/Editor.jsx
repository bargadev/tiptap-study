import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import ResizableImage from './ResizableImage.js'
import { Columns, Column } from './ColumnsNodes.js'
import CustomDragHandle from './CustomDragHandle.jsx'
import ColumnResizers from './ColumnResizers.jsx'
import { loadContent, saveContent, clearContent } from './storage.js'
import { useEffect, useRef } from 'react'

const STORAGE_KEY = 'tiptap-playground-content'

const CONTENT = `
  <h2>Bem-vindo 👋</h2>
  <p>Este é um editor <strong>Tiptap</strong>. Você pode escrever texto formatado e inserir imagens.</p>
  <ul>
    <li>Use a barra de ferramentas acima</li>
    <li>Cole, arraste ou faça upload de imagens</li>
  </ul>
`

export default function Editor() {
  const fileInputRef = useRef(null)
  const saveTimer = useRef(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      ResizableImage.configure({ inline: false, allowBase64: true }),
      Columns,
      Column,
    ],
    content: CONTENT,
    onUpdate: ({ editor }) => {
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => saveContent(STORAGE_KEY, editor.getHTML()), 400)
    },
  })

  // carrega o conteúdo salvo (IndexedDB) depois que o editor monta
  useEffect(() => {
    if (!editor) return
    let cancelled = false
    loadContent(STORAGE_KEY).then((html) => {
      if (!cancelled && html) editor.commands.setContent(html, false)
    })
    return () => {
      cancelled = true
    }
  }, [editor])

  if (!editor) return null

  const addImageByUrl = () => {
    const url = window.prompt('URL da imagem:')
    if (url) editor.chain().focus().setImage({ src: url }).run()
  }

  const onPickFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result }).run()
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const btn = (active) => 'tb-btn' + (active ? ' is-active' : '')

  return (
    <div className="editor">
      <div className="toolbar">
        <button
          className={btn(editor.isActive('bold'))}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </button>
        <button
          className={btn(editor.isActive('italic'))}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </button>
        <button
          className={btn(editor.isActive('heading', { level: 2 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </button>
        <button
          className={btn(editor.isActive('bulletList'))}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • Lista
        </button>
        <span className="tb-sep" />
        <button className="tb-btn" onClick={addImageByUrl}>
          Imagem (URL)
        </button>
        <button className="tb-btn" onClick={() => fileInputRef.current?.click()}>
          Imagem (upload)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onPickFile}
        />
        <span className="tb-sep" />
        <button
          className="tb-btn"
          onClick={() => {
            clearContent(STORAGE_KEY)
            editor.commands.setContent(CONTENT)
          }}
        >
          Limpar
        </button>
        <button
          className="tb-btn"
          onClick={() =>
            import('./exportDocx.js').then((m) => m.exportToDocx(editor, 'editor.docx'))
          }
        >
          Exportar DOCX (InDesign)
        </button>
        <button
          className="tb-btn"
          onClick={() =>
            import('./exportIdml.js').then((m) => m.exportToIdml(editor, 'editor.idml'))
          }
        >
          Exportar IDML
        </button>
      </div>

      <EditorContent editor={editor} className="editor-content" />
      <CustomDragHandle editor={editor} />
      <ColumnResizers editor={editor} />
    </div>
  )
}
