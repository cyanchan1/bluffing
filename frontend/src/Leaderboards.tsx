import { useState } from 'react'
import { useGameStore } from './store'
import { rankRecords } from './presentation'

export function Leaderboards() {
  const room = useGameStore(s => s.room)
  const player = useGameStore(s => s.player)
  const [expanded, setExpanded] = useState(false)
  if (!room) return null
  const records = room.records ?? []
  return <section className="leaderboards" aria-label="Room leaderboards">
    <div className="records-heading"><h2>House <em>legends.</em></h2></div>
    <div className="records-grid">{(['wins', 'bestStreak'] as const).map(metric => {
      const ranks = rankRecords(records, metric)
      return <article className={`record-board board-${metric}`} key={metric}>
        <div className="record-title"><b aria-hidden="true">{metric === 'wins' ? '♛' : '✦'}</b><h3>{metric === 'wins' ? 'Total wins' : 'Best win streak'}</h3></div>
        {ranks.length ? <ol>{ranks.slice(0, expanded ? undefined : 5).map(record => <li className={`${record.rank === 1 ? 'record-leader' : ''} ${record.playerId === player?.id ? 'your-record' : ''}`} key={record.playerId}>
          <span className="record-rank">{String(record.rank).padStart(2, '0')}</span>
          <div className="record-name"><strong>{record.displayName}<small>#{record.identityTag}</small></strong>
            <span>{record.playerId === player?.id ? 'You' : 'Contender'}</span></div>
          <strong className="record-score">{record[metric].toLocaleString()}</strong>
        </li>)}</ol> : <div className="record-empty">{metric === 'wins' ? 'The crown is unclaimed.' : 'The first streak starts here.'}</div>}
      </article>
    })}</div>
    {records.filter(r => r.wins > 0).length > 5 && <button className="text-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show top five' : 'Show all records'}</button>}
  </section>
}
