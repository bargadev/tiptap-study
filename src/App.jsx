import { useState } from 'react'
import Editor from './Editor.jsx'
import ColumnsEditor from './ColumnsEditor.jsx'

export default function App() {
  const [tab, setTab] = useState('editor')

  return (
    <div className="page">
      <h1>Tiptap Playground</h1>
      <p className="subtitle">Adicione texto e imagens no editor abaixo.</p>

      <div className="tabs">
        <button
          className={'tab' + (tab === 'editor' ? ' is-active' : '')}
          onClick={() => setTab('editor')}
        >
          1. Editor
        </button>
        <button
          className={'tab' + (tab === 'colunas' ? ' is-active' : '')}
          onClick={() => setTab('colunas')}
        >
          2. Colunas (texto dos 2 lados)
        </button>
      </div>

      {tab === 'editor' ? <Editor /> : <ColumnsEditor />}
    </div>
  )
}
