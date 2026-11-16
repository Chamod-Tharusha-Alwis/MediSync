import React, { useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { buildAuditFeed } from '../../utils/auditFeed';

// Readable audit feed: actor role, plain action, target type, relative time. Transport noise (heartbeats,
// plain GET requests, polling) is hidden behind a toggle; repeats are grouped. Presentation only.
export default function AuditFeedPanel({ events = [], now }) {
  const [showSystem, setShowSystem] = useState(false);
  const { rows, hiddenSystemEvents } = useMemo(() => buildAuditFeed(events, { showSystem, now: now || Date.now() }), [events, showSystem, now]);
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-xs text-slate-400 select-none cursor-pointer">
        <input type="checkbox" checked={showSystem} onChange={e => setShowSystem(e.target.checked)} className="accent-blue-500" aria-label="Show system events" />
        Show system events{!showSystem && hiddenSystemEvents > 0 ? ` (${hiddenSystemEvents} hidden)` : ''}
      </label>
      <div className="space-y-2.5 h-64 overflow-y-auto pr-2 custom-scrollbar" data-testid="audit-feed">
        {rows.length > 0 ? rows.map(row => (
          <div key={row.key} data-testid="audit-row" className={`p-3 rounded-xl border transition-colors ${row.system ? 'bg-slate-950/10 border-white/5 opacity-70' : 'bg-slate-950/20 border-white/5 hover:border-white/10'}`}>
            <div className="flex justify-between items-start gap-3">
              <p className="text-xs text-slate-300">
                <span className="text-white font-bold">{row.actor}</span>
                <span className="text-slate-400"> · {row.text}</span>
                {row.count > 1 && <span className="ml-1 text-slate-400 font-mono" data-testid="audit-count">× {row.count}</span>}
                {row.target && <span className="block text-xs text-slate-500 mt-0.5">Target: {row.target}</span>}
              </p>
              <span className="text-xs text-slate-500 font-mono whitespace-nowrap">{row.ago}</span>
            </div>
          </div>
        )) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 select-none">
            <ScrollText className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">{hiddenSystemEvents > 0 ? `No user actions recently. ${hiddenSystemEvents} system events are hidden.` : 'No active event logging recorded.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
