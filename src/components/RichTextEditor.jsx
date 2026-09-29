import { useRef, useEffect } from 'react'

export default function RichTextEditor({ value, onChange }) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || '')) {
      ref.current.innerHTML = value || ''
    }
  }, [value])

  function exec(command) {
    document.execCommand(command)
    ref.current.focus()
    onChange(ref.current.innerHTML)
  }

  return (
    <div style={{ border: '1px solid #ccc', borderRadius: 8 }}>
      <div style={{ display: 'flex', gap: 4, padding: 6, borderBottom: '1px solid #eee' }}>
        <button type="button" onClick={() => exec('bold')} style={{ fontWeight: 700 }}>B</button>
        <button type="button" onClick={() => exec('italic')} style={{ fontStyle: 'italic' }}>I</button>
        <button type="button" onClick={() => exec('insertUnorderedList')}>• Lista</button>
      </div>
      <div
        ref={ref}
        contentEditable
        onInput={e => onChange(e.currentTarget.innerHTML)}
        style={{ minHeight: 120, padding: 10, outline: 'none' }}
      />
    </div>
  )
}