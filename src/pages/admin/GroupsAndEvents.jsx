import { useState } from 'react'
import GroupsManager from './GroupsManager'
import EventsManager from './EventsManager'

export default function GroupsAndEvents() {
  const [subtab, setSubtab] = useState('groups')

  return (
    <div>
      <p className="muted small">
        Ovde uređuješ osnovne podatke o grupama i događajima (naziv, cena, termin, opis, arhiviranje).
        Spiskovi prijavljenih članova i uplate su u tabu „Termini i uplate".
      </p>
      <div className="row mb">
        <button className={subtab === 'groups' ? '' : 'btn-ghost'} onClick={() => setSubtab('groups')}>Grupe</button>
        <button className={subtab === 'events' ? '' : 'btn-ghost'} onClick={() => setSubtab('events')}>Događaji</button>
      </div>
      {subtab === 'groups' ? <GroupsManager /> : <EventsManager />}
    </div>
  )
}
