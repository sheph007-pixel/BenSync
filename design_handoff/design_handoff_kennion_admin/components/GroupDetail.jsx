// Group Detail view with tabs
function GroupDetail({ group, allSubmissions, onBack, onOpenSubmission, activeSubmissionId }) {
  const [tab, setTab] = useState("overview");
  const [status, setStatus] = useState(group.status);
  const [notes, setNotes] = useState(group.adminNotes || "");
  const tier = group.riskTier ? window.TIER_CONFIG[group.riskTier] : null;
  const risk = group.riskScore || 0;
  const riskPct = Math.min(100, Math.max(0, (risk / 1.5) * 100));

  const activity = [
    { icon: "check", title: "Status updated", meta: formatDate(group.submittedAt, {full: true}), active: true },
    { icon: "file-chart", title: "Census submitted", meta: formatDate(group.submittedAt, {full: true}), active: true },
    { icon: "user", title: "Contact created — " + group.contactName, meta: formatDate(group.submittedAt, {full: true}) },
  ];

  const ageBuckets = [
    { label: "18–29", count: Math.round(group.totalLives * 0.22) },
    { label: "30–39", count: Math.round(group.totalLives * 0.34) },
    { label: "40–49", count: Math.round(group.totalLives * 0.26) },
    { label: "50–59", count: Math.round(group.totalLives * 0.14) },
    { label: "60+",   count: Math.round(group.totalLives * 0.04) },
  ];
  const maxBucket = Math.max(...ageBuckets.map(b => b.count));

  return (
    <div className="fade-in">
      <div className="detail-header">
        <div style={{flex: 1, minWidth: 0}}>
          <div className="detail-title-row">
            <h1 className="detail-title">{group.companyName}</h1>
            <StatusBadge status={group.status}/>
            {tier && <Badge variant={group.riskTier === "preferred" ? "green" : group.riskTier === "high" ? "red" : "blue"}>{tier.label}</Badge>}
          </div>
          <div className="detail-sub">
            <span style={{fontFamily: "var(--font-mono)", fontSize: 11}}>{censusId(group.id)}</span>
            <span className="dot"/><span>{group.contactName}</span>
            <span className="dot"/><a href={`mailto:${group.contactEmail}`}>{group.contactEmail}</a>
            <span className="dot"/><span>Submitted {formatDate(group.submittedAt, {full: true})}</span>
          </div>
        </div>
        <div style={{display: "flex", gap: 8}}>
          <Btn variant="outline" icon="download" size="sm">Export</Btn>
          <Btn variant="outline" icon="file-chart" size="sm">Generate Proposal</Btn>
          <Btn variant="default" icon="mail" size="sm">Contact Client</Btn>
        </div>
      </div>

      <div className="detail-tabs">
        {[
          { k: "overview", l: "Overview" },
          { k: "census", l: "Census Data" },
          { k: "risk", l: "Risk Analysis" },
          { k: "submissions", l: `Submissions (${allSubmissions.length})` },
          { k: "notes", l: "Notes & Status" },
          { k: "activity", l: "Activity" },
        ].map(t => (
          <button key={t.k} className={`detail-tab ${tab === t.k ? "active" : ""}`} onClick={() => setTab(t.k)}>{t.l}</button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="kv-grid-4">
            <div className="kv-card">
              <div className="kv-card-label">Total Lives</div>
              <div className="kv-card-value">{group.totalLives}</div>
            </div>
            <div className="kv-card">
              <div className="kv-card-label">Employees</div>
              <div className="kv-card-value">{group.employeeCount}</div>
            </div>
            <div className="kv-card">
              <div className="kv-card-label">Average Age</div>
              <div className="kv-card-value">{group.averageAge?.toFixed(1) || "—"}</div>
            </div>
            <div className="kv-card">
              <div className="kv-card-label">Risk Score</div>
              <div className="kv-card-value" style={{color: tier ? tier.color : "var(--primary)"}}>{risk.toFixed(2)}</div>
            </div>
          </div>

          <div className="section-row">
            <div className="card card-padded">
              <h3 style={{margin: "0 0 14px", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8}}>
                <Icon name="users" size={14}/>Age Distribution
              </h3>
              <div className="bar-chart">
                {ageBuckets.map(b => (
                  <div key={b.label} className="bar-row">
                    <span style={{color: "var(--muted-foreground)"}}>{b.label}</span>
                    <div className="bar-track"><div className="bar-fill" style={{width: `${(b.count/maxBucket)*100}%`}}/></div>
                    <span style={{fontWeight: 600, textAlign: "right"}}>{b.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card card-padded">
              <h3 style={{margin: "0 0 14px", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8}}>
                <Icon name="chart" size={14}/>Composition
              </h3>
              <div style={{marginBottom: 14}}>
                <div style={{fontSize: 11, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em"}}>Enrollment</div>
                <div style={{display: "flex", gap: 4, height: 28, borderRadius: 4, overflow: "hidden"}}>
                  <div style={{flex: group.employeeCount, background: "var(--blue-500-20)", display: "flex", alignItems: "center", paddingLeft: 8, fontSize: 11, fontWeight: 600, color: "var(--blue-700)"}}>{group.employeeCount} EE</div>
                  {group.spouseCount > 0 && <div style={{flex: group.spouseCount, background: "var(--purple-500-20)", display: "flex", alignItems: "center", paddingLeft: 8, fontSize: 11, fontWeight: 600, color: "var(--purple-700)"}}>{group.spouseCount} SP</div>}
                  {group.childrenCount > 0 && <div style={{flex: group.childrenCount, background: "var(--green-500-20)", display: "flex", alignItems: "center", paddingLeft: 8, fontSize: 11, fontWeight: 600, color: "var(--green-700)"}}>{group.childrenCount} CH</div>}
                </div>
              </div>
              <div>
                <div style={{fontSize: 11, color: "var(--muted-foreground)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em"}}>Gender</div>
                <div style={{display: "flex", gap: 4, height: 28, borderRadius: 4, overflow: "hidden"}}>
                  <div style={{flex: group.maleCount, background: "var(--blue-500-20)", display: "flex", alignItems: "center", paddingLeft: 8, fontSize: 11, fontWeight: 600, color: "var(--blue-700)"}}>{group.maleCount} Male</div>
                  <div style={{flex: group.femaleCount, background: "var(--purple-500-20)", display: "flex", alignItems: "center", paddingLeft: 8, fontSize: 11, fontWeight: 600, color: "var(--purple-700)"}}>{group.femaleCount} Female</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "census" && (
        <div className="card" style={{overflow: "hidden"}}>
          <table className="census-sub-table">
            <thead><tr><th>Metric</th><th>Value</th><th>Notes</th></tr></thead>
            <tbody>
              <tr><td>Total Lives</td><td className="cell-strong">{group.totalLives}</td><td className="cell-muted">All enrolled members</td></tr>
              <tr><td>Employees</td><td className="cell-strong">{group.employeeCount}</td><td className="cell-muted">Primary insureds</td></tr>
              <tr><td>Spouses</td><td className="cell-strong">{group.spouseCount}</td><td className="cell-muted">Dependent spouses</td></tr>
              <tr><td>Children</td><td className="cell-strong">{group.childrenCount}</td><td className="cell-muted">Dependent children</td></tr>
              <tr><td>Average Age</td><td className="cell-strong">{group.averageAge?.toFixed(1) || "—"}</td><td className="cell-muted">Across all lives</td></tr>
              <tr><td>Male / Female</td><td className="cell-strong">{group.maleCount} / {group.femaleCount}</td><td className="cell-muted">Gender split</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "risk" && (
        <div className="section-row">
          <div className="card card-padded">
            <h3 style={{margin: "0 0 14px", fontSize: 14, fontWeight: 600}}>Risk Score Breakdown</h3>
            <div style={{height: 8, background: "var(--muted)", borderRadius: 4, overflow: "hidden", marginBottom: 8}}>
              <div style={{width: `${riskPct}%`, height: "100%", background: "var(--primary)"}}/>
            </div>
            <div style={{display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted-foreground)", marginBottom: 20}}>
              <span>Preferred &lt;0.85</span><span>Standard 0.85–1.15</span><span>High &gt;1.15</span>
            </div>
            <div className="bar-chart">
              {[
                { l: "Age factor", v: 0.42 },
                { l: "Gender mix", v: 0.18 },
                { l: "Family composition", v: 0.22 },
                { l: "Industry class", v: 0.12 },
                { l: "Geography", v: 0.06 },
              ].map(f => (
                <div key={f.l} className="bar-row">
                  <span style={{color: "var(--muted-foreground)"}}>{f.l}</span>
                  <div className="bar-track"><div className="bar-fill" style={{width: `${f.v*100}%`}}/></div>
                  <span style={{fontWeight: 600, textAlign: "right"}}>{(f.v*risk).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="risk-gauge">
            <div className="risk-number" style={{color: tier ? tier.color : "var(--primary)"}}>{risk.toFixed(2)}</div>
            {tier && <div className="risk-label" style={{color: tier.color}}>{tier.label}</div>}
            <div style={{marginTop: 16, textAlign: "center", fontSize: 12, color: "var(--muted-foreground)"}}>
              Based on demographics, industry, and historical loss ratios for comparable groups.
            </div>
          </div>
        </div>
      )}

      {tab === "submissions" && (
        <div className="card" style={{overflow: "hidden"}}>
          <table className="data-table">
            <thead><tr><th>Submitted</th><th>Census ID</th><th>Total Lives</th><th>Risk Score</th><th className="center">Status</th><th className="center"></th></tr></thead>
            <tbody>
              {allSubmissions.map(s => (
                <tr key={s.id} className="census-row" style={{background: s.id === activeSubmissionId ? "var(--primary-10)" : undefined}} onClick={() => onOpenSubmission(s)}>
                  <td>{formatDate(s.submittedAt, {full: true})}</td>
                  <td style={{fontFamily: "var(--font-mono)", fontSize: 11}}>{censusId(s.id)}</td>
                  <td className="cell-strong">{s.totalLives}</td>
                  <td>{s.riskScore?.toFixed(2) || "—"}</td>
                  <td className="center"><StatusBadge status={s.status}/></td>
                  <td className="center"><Btn variant="ghost" size="sm" icon="chev-right"/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "notes" && (
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20}}>
          <div className="card card-padded">
            <h3 style={{margin: "0 0 12px", fontSize: 14, fontWeight: 600}}>Current Status</h3>
            <select className="field-select" value={status} onChange={e => setStatus(e.target.value)}>
              {window.STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div style={{marginTop: 12}}>
              <Btn variant="default" icon="save">Update Status</Btn>
            </div>
          </div>
          <div className="card card-padded">
            <h3 style={{margin: "0 0 12px", fontSize: 14, fontWeight: 600}}>Admin Notes</h3>
            <textarea className="field-textarea" rows={5} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add internal notes about this group..."/>
            <div style={{marginTop: 12, display: "flex", justifyContent: "flex-end"}}>
              <Btn variant="default" icon="save">Save Notes</Btn>
            </div>
          </div>
          {group.adminNotes && (
            <div style={{gridColumn: "1 / -1"}} className="note-card">
              <div className="note-meta">
                <span style={{fontWeight: 500, color: "var(--foreground)"}}>Previous note</span>
                <span>{formatDate(group.submittedAt, {full: true})}</span>
              </div>
              <div>{group.adminNotes}</div>
            </div>
          )}
        </div>
      )}

      {tab === "activity" && (
        <div className="card card-padded">
          {activity.map((a, i) => (
            <div key={i} className="timeline-item">
              <div className={`timeline-dot ${a.active ? "active" : ""}`}><Icon name={a.icon} size={13}/></div>
              <div>
                <div className="timeline-title">{a.title}</div>
                <div className="timeline-meta">{a.meta}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { GroupDetail });
