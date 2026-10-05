import { useState } from 'react'
import GroupsManager from './GroupsManager'
import EventsManager from './EventsManager'

export default function GroupsAndEvents() {
  const [subtab, setSubtab] = useState('groups')

  return (
    <div>
      <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>
        Ovde uređuješ osnovne podatke o grupama i događajima (naziv, cena, termin, opis, arhiviranje).
        Spiskovi prijavljenih članova i uplate su u tabu „Termini i uplate".
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setSubtab('groups')} style={{ fontWeight: subtab === 'groups' ? 700 : 400 }}>Grupe</button>
        <button onClick={() => setSubtab('events')} style={{ fontWeight: subtab === 'events' ? 700 : 400 }}>Događaji</button>
      </div>
      {subtab === 'groups' ? <GroupsManager /> : <EventsManager />}
    </div>
  )
}
