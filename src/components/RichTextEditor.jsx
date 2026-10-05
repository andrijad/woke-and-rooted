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
    <div className="rte-box">
      <div className="row" style={{ gap: 4, padding: 6, borderBottom: '1px solid var(--line)' }}>
        <button type="button" className="btn-ghost btn-sm" onClick={() => exec('bold')} style={{ fontWeight: 700 }}>B</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => exec('italic')} style={{ fontStyle: 'italic' }}>I</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => exec('insertUnorderedList')}>• Lista</button>
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