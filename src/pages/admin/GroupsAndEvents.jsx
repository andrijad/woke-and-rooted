import { useState } from 'react'
import GroupsManager from './GroupsManager'
import EventsManager from './EventsManager'

export default function GroupsAndEvents() {
  const [subtab, setSubtab] = useState('groups')
  const [draft, setDraft] = useState(null) // kopija događaja za novi unos

  function handleDuplicate(form) {
    setDraft(form)
    setSubtab('events')
  }

  return (
    <div>
      <p className="muted small">
        Ovde uređuješ osnovne podatke o grupama i događajima. „Aktivno“ znači da je vidljivo članovima.
        Spiskovi prijavljenih članova i uplate su u tabu „Termini i uplate".
      </p>
      <div className="row mb">
        <button className={subtab === 'groups' ? '' : 'btn-ghost'} onClick={() => setSubtab('groups')}>Joga grupe</button>
        <button className={subtab === 'events' ? '' : 'btn-ghost'} onClick={() => setSubtab('events')}>Događaji</button>
        <button className={subtab === 'past' ? '' : 'btn-ghost'} onClick={() => setSubtab('past')}>Prethodni događaji</button>
      </div>
      {subtab === 'groups' && <GroupsManager />}
      {subtab === 'events' && <EventsManager draft={draft} onDraftUsed={() => setDraft(null)} />}
      {subtab === 'past' && <EventsManager past onDuplicate={handleDuplicate} />}
    </div>
  )
}
