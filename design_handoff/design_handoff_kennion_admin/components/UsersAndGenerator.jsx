// Users and Proposal Generator tabs
function UserManagement() {
  const [q, setQ] = useState("");
  const users = window.MOCK.users;
  const filtered = users.filter(u =>
    u.fullName.toLowerCase().includes(q.toLowerCase()) ||
    u.email.toLowerCase().includes(q.toLowerCase()) ||
    (u.companyName || "").toLowerCase().includes(q.toLowerCase())
  );
  return (
    <>
      <div className="toolbar">
        <div className="search-input">
          <span className="icon-left"><Icon name="search" size={14}/></span>
          <input placeholder="Search users..." value={q} onChange={e => setQ(e.target.value)}/>
        </div>
        <Badge variant="gray">{filtered.length} {filtered.length === 1 ? "user" : "users"}</Badge>
      </div>
      <div className="card" style={{overflow: "hidden"}}>
        <div style={{overflowX: "auto"}}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Company</th><th>Phone</th>
                <th>Role</th><th>Verified</th><th>Joined</th><th className="center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id}>
                  <td className="cell-strong">{u.fullName}</td>
                  <td className="cell-muted">{u.email}</td>
                  <td>{u.companyName || "—"}</td>
                  <td>{u.phone || "—"}</td>
                  <td><Badge variant={u.role === "admin" ? "blue" : "gray"}>{u.role}</Badge></td>
                  <td>{u.verified ? <Icon name="check-only" size={16} style={{color: "var(--green-600)"}}/> : <Icon name="x-circle" size={16} style={{color: "var(--muted-foreground)"}}/>}</td>
                  <td className="cell-muted">{formatDate(u.createdAt, {full: false})}</td>
                  <td className="center">
                    <div style={{display: "inline-flex", gap: 4}}>
                      <Btn variant="ghost" size="sm">Edit</Btn>
                      <Btn variant="ghost" size="sm" icon="trash" style={{color: "var(--destructive)"}}/>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ProposalGenerator() {
  const t = window.MOCK.template;
  const [selectedSheet, setSelectedSheet] = useState("Census");
  const [generatingId, setGeneratingId] = useState(null);
  const [generated, setGenerated] = useState(new Set(["k1l2m3n4o5", "p6q7r8s9t0"]));

  const generate = (id) => {
    setGeneratingId(id);
    setTimeout(() => {
      const n = new Set(generated); n.add(id); setGenerated(n);
      setGeneratingId(null);
    }, 1400);
  };

  // Unique companies to dedupe generator list
  const unique = [];
  const seen = new Set();
  for (const g of window.MOCK.groups) {
    if (!seen.has(g.companyName)) { seen.add(g.companyName); unique.push(g); }
  }

  return (
    <div style={{display: "flex", flexDirection: "column", gap: 24}}>
      <div className="card card-padded">
        <h3 style={{margin: "0 0 4px", fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8}}>
          <Icon name="file-spreadsheet" size={18} style={{color: "var(--primary)"}}/>XLSM Template
        </h3>
        <p style={{color: "var(--muted-foreground)", fontSize: 13, margin: "0 0 16px"}}>
          Upload the actuary's XLSM document. Census data will be injected into the designated sheet to generate proposals.
        </p>

        {t.uploaded ? (
          <div className="template-slot">
            <div className="template-slot-left">
              <div className="template-icon-box"><Icon name="file-spreadsheet" size={18}/></div>
              <div>
                <div className="template-info-name">{t.fileName}</div>
                <div className="template-info-meta">{formatFileSize(t.fileSize)} — Uploaded {formatDate(t.uploadedAt, {full: true})}</div>
              </div>
            </div>
            <div style={{display: "flex", gap: 8}}>
              <Btn variant="outline" size="sm" icon="upload">Replace</Btn>
              <Btn variant="ghost" size="sm" icon="x" style={{color: "var(--destructive)"}}/>
            </div>
          </div>
        ) : (
          <div className="dropzone">
            <Icon name="upload" size={28} style={{color: "var(--muted-foreground)"}}/>
            <div className="dropzone-title">Click to upload XLSM template</div>
            <div className="dropzone-sub">Accepts .xlsm files with macros</div>
          </div>
        )}

        <div style={{marginTop: 16}}>
          <label className="field-label">Target sheet for census data</label>
          <select className="field-select" value={selectedSheet} onChange={e => setSelectedSheet(e.target.value)} style={{marginTop: 6, maxWidth: 256}}>
            {t.sheets.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="card card-padded">
        <h3 style={{margin: "0 0 4px", fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8}}>
          <Icon name="file-chart" size={18} style={{color: "var(--primary)"}}/>Generate Proposals
        </h3>
        <p style={{color: "var(--muted-foreground)", fontSize: 13, margin: "0 0 16px"}}>
          Select a group below to inject its census data into the template and download the generated proposal.
        </p>

        <div className="card" style={{overflow: "hidden"}}>
          {unique.map(g => {
            const isGen = generated.has(g.id);
            const loading = generatingId === g.id;
            return (
              <div key={g.id} className="gen-row">
                <div>
                  <div className="cell-strong">{g.companyName}</div>
                  <div className="cell-muted">{g.totalLives} lives · {censusId(g.id)}</div>
                </div>
                <div className="cell-muted">{formatDate(g.submittedAt)}</div>
                <StatusBadge status={g.status}/>
                <div>
                  {isGen ? (
                    <Btn variant="outline" size="sm" icon="file" style={{color: "var(--green-700)", borderColor: "var(--green-500-20)"}}>View PDF</Btn>
                  ) : <span className="cell-muted">No PDF</span>}
                </div>
                <Btn variant="default" size="sm" icon={loading ? "loader" : "file-chart"} onClick={() => generate(g.id)} disabled={loading}>
                  {loading ? "Generating..." : "Generate"}
                </Btn>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { UserManagement, ProposalGenerator });
