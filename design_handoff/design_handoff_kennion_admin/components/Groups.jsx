// Admin page — Groups tab with stats and expandable table
function StatsOverview({ groups }) {
  const counts = {};
  for (const g of groups) counts[g.status] = (counts[g.status] || 0) + 1;
  const stats = window.STATUS_OPTIONS.map(s => ({ ...s, value: counts[s.value] || 0 }));
  return (
    <div className="stats-grid">
      {stats.map(s => (
        <div key={s.value + s.label} className="card stat-card">
          <div className="stat-icon"><Icon name={s.icon} size={16}/></div>
          <div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function GroupsTable({ groups, onRowClick, onViewReport }) {
  const [expanded, setExpanded] = useState(new Set(["Cedar Ridge Dental"]));
  const [sortField, setSortField] = useState("submittedAt");
  const [sortDir, setSortDir] = useState("desc");

  const grouped = useMemo(() => {
    const byCo = {};
    for (const g of groups) {
      if (!byCo[g.companyName]) byCo[g.companyName] = [];
      byCo[g.companyName].push(g);
    }
    return Object.entries(byCo);
  }, [groups]);

  const toggle = (co) => {
    const n = new Set(expanded);
    n.has(co) ? n.delete(co) : n.add(co);
    setExpanded(n);
  };

  const sortIcon = (f) => sortField === f ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="card" style={{overflow: "hidden"}}>
      <div style={{overflowX: "auto"}}>
        <table className="data-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => { setSortField("submittedAt"); setSortDir(sortDir === "asc" ? "desc" : "asc"); }}>Submitted{sortIcon("submittedAt")}</th>
              <th className="sortable" onClick={() => { setSortField("companyName"); setSortDir(sortDir === "asc" ? "desc" : "asc"); }}>Company{sortIcon("companyName")}</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Phone</th>
              <th className="center">Status</th>
              <th className="center">View</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([co, list]) => {
              const isExp = expanded.has(co);
              const latest = list.reduce((a, b) => new Date(a.submittedAt) > new Date(b.submittedAt) ? a : b);
              return (
                <React.Fragment key={co}>
                  <tr className="company-row" onClick={() => toggle(co)}>
                    <td>
                      <div>{formatDate(latest.submittedAt)}</div>
                      <div className="cell-muted">Latest</div>
                    </td>
                    <td>
                      <div style={{display: "flex", alignItems: "center", gap: 8}}>
                        <span className={`chev ${isExp ? "rotated" : ""}`}><Icon name="chev-down" size={16}/></span>
                        <div>
                          <div className="cell-strong">{co}</div>
                          <div className="cell-muted">{list.length} census submission{list.length > 1 ? "s" : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td>{latest.contactName}</td>
                    <td><a href={`mailto:${latest.contactEmail}`} onClick={e => e.stopPropagation()}>{latest.contactEmail}</a></td>
                    <td>{latest.contactPhone || "—"}</td>
                    <td className="center"><StatusBadge status={latest.status}/></td>
                    <td className="center">
                      <Btn variant="ghost" size="sm" onClick={e => { e.stopPropagation(); toggle(co); }}>{isExp ? "Collapse" : "Expand"}</Btn>
                    </td>
                  </tr>
                  {isExp && list.map(g => (
                    <tr key={g.id} className="census-row" onClick={() => onRowClick(g)}>
                      <td style={{paddingLeft: 48}}>
                        <div>{formatDate(g.submittedAt)}</div>
                        <div className="cell-muted">{formatDate(g.submittedAt, {time: true})}</div>
                      </td>
                      <td style={{paddingLeft: 48}} className="cell-muted">{censusId(g.id)}</td>
                      <td>{g.contactName}</td>
                      <td><a href={`mailto:${g.contactEmail}`} onClick={e => e.stopPropagation()}>{g.contactEmail}</a></td>
                      <td>{g.contactPhone || "—"}</td>
                      <td className="center"><StatusBadge status={g.status}/></td>
                      <td className="center">
                        <Btn variant="default" size="sm" icon="eye" onClick={e => { e.stopPropagation(); onViewReport(g); }}>View Dashboard</Btn>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupDetailDialog({ group, onClose }) {
  const [status, setStatus] = useState(group.status);
  const [notes, setNotes] = useState(group.adminNotes || "");
  const [saving, setSaving] = useState(false);
  const tier = group.riskTier ? window.TIER_CONFIG[group.riskTier] : null;

  const save = () => {
    setSaving(true);
    setTimeout(() => { setSaving(false); onClose(); }, 600);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 className="dialog-title"><Icon name="building" size={22} style={{color: "var(--primary)"}}/>{group.companyName}</h2>
          <p className="dialog-desc">Census ID: <code style={{fontFamily: "var(--font-mono)", fontSize: 11}}>{censusId(group.id)}</code> · Submitted {formatDate(group.submittedAt, {full: true})}</p>
        </div>

        <div className="dialog-section">
          <h3><Icon name="user" size={14}/>Contact Information</h3>
          <div className="dialog-kv-grid">
            <div><div className="kv-label">Contact Name</div><div className="kv-value">{group.contactName}</div></div>
            <div><div className="kv-label">Email</div><div className="kv-value">{group.contactEmail}</div></div>
          </div>
        </div>

        <div className="dialog-section">
          <h3><Icon name="users" size={14}/>Census Details</h3>
          <div className="dialog-kv-grid">
            <div><div className="kv-label">Total Lives</div><div className="kv-value" style={{fontSize: 20, fontWeight: 700}}>{group.totalLives}</div></div>
            <div><div className="kv-label">Breakdown</div><div className="kv-value">{group.employeeCount}e · {group.spouseCount}s · {group.childrenCount}c</div></div>
            <div><div className="kv-label">Average Age</div><div className="kv-value">{group.averageAge?.toFixed(1) || "—"}</div></div>
            <div><div className="kv-label">Gender Split</div><div className="kv-value">{group.maleCount}M · {group.femaleCount}F</div></div>
          </div>
        </div>

        {group.riskScore != null && (
          <div className="dialog-section">
            <h3><Icon name="chart" size={14}/>Risk Analysis</h3>
            <div className="dialog-kv-grid">
              <div><div className="kv-label">Risk Score</div><div style={{fontSize: 28, fontWeight: 700, color: "var(--primary)"}}>{group.riskScore.toFixed(2)}</div></div>
              {tier && <div><div className="kv-label">Risk Tier</div><div style={{fontSize: 18, fontWeight: 700, color: tier.color}}>{tier.label}</div></div>}
            </div>
          </div>
        )}

        <div className="dialog-section">
          <label className="field-label"><Icon name="activity" size={14}/>Status</label>
          <select className="field-select" value={status} onChange={e => setStatus(e.target.value)} style={{marginTop: 8}}>
            {window.STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="dialog-section">
          <label className="field-label"><Icon name="file" size={14}/>Admin Notes</label>
          <textarea className="field-textarea" rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes about this group..." style={{marginTop: 8}}/>
        </div>

        <div className="dialog-footer">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn variant="default" icon={saving ? "loader" : "save"} onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Btn>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { StatsOverview, GroupsTable, GroupDetailDialog });
