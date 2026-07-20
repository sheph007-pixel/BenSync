// App shell — sidebar layout with detail views
function Sidebar({ view, setView, counts }) {
  const navItems = [
    { k: "dashboard", icon: "home", label: "Dashboard" },
    { k: "groups", icon: "building", label: "Groups", count: counts.groups },
    { k: "users", icon: "users", label: "Users", count: counts.users },
    { k: "generator", icon: "file-chart", label: "Proposal Generator" },
  ];
  const secondary = [
    { k: "templates", icon: "file-spreadsheet", label: "Templates" },
    { k: "settings", icon: "settings", label: "Settings" },
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <KennionLogo/>
      </div>
      <nav className="sidebar-nav">
        <div className="sidebar-group-label">Workspace</div>
        {navItems.map(i => (
          <button key={i.k} className={`sidebar-item ${view === i.k ? "active" : ""}`} onClick={() => setView(i.k)}>
            <Icon name={i.icon} size={15}/>
            <span>{i.label}</span>
            {i.count != null && <span className="count-pill">{i.count}</span>}
          </button>
        ))}
        <div className="sidebar-group-label">Settings</div>
        {secondary.map(i => (
          <button key={i.k} className={`sidebar-item ${view === i.k ? "active" : ""}`} onClick={() => setView(i.k)}>
            <Icon name={i.icon} size={15}/>
            <span>{i.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="user-avatar">JR</div>
          <div className="user-info">
            <span className="user-name">{window.MOCK.currentUser.fullName}</span>
            <span className="user-email">Admin</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ crumbs, onCrumbClick, dark, setDark, onTweaks, search, setSearch, searchRef }) {
  return (
    <div className="topbar">
      <div className="breadcrumbs">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <React.Fragment key={i}>
              {i > 0 && <span className="crumb-sep"><Icon name="chev-right" size={12}/></span>}
              {last
                ? <span className="crumb-current">{c.label}</span>
                : <span className="crumb-link" onClick={() => onCrumbClick(c)}>{c.label}</span>}
            </React.Fragment>
          );
        })}
      </div>
      <div className="topbar-search">
        <span className="icon-left"><Icon name="search" size={14}/></span>
        <input ref={searchRef} placeholder="Search groups, users...  ( / )" value={search} onChange={e => setSearch(e.target.value)}/>
      </div>
      <div className="topbar-right">
        <Btn variant="ghost" size="sm" icon="bell"/>
        <Btn variant="ghost" size="sm" icon={dark ? "sun" : "moon"} onClick={() => setDark(!dark)}/>
        <Btn variant="ghost" size="sm" icon="sliders" onClick={onTweaks}/>
      </div>
    </div>
  );
}

function DashboardView({ groups, onOpenGroup }) {
  const total = groups.length;
  const recent = [...groups].sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 5);
  const totalLives = groups.reduce((s, g) => s + g.totalLives, 0);
  const proposalsSent = groups.filter(g => g.status === "proposal_sent" || g.status === "proposal_accepted" || g.status === "client").length;
  const clients = groups.filter(g => g.status === "client").length;
  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 style={{fontSize: 24, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.02em"}}>Welcome back, Jordan</h1>
          <p style={{color: "var(--muted-foreground)", margin: 0, fontSize: 14}}>Here's what's happening across your book of business today.</p>
        </div>
        <Btn variant="default" icon="plus">New Submission</Btn>
      </div>
      <div className="kv-grid-4" style={{marginBottom: 20}}>
        <div className="kv-card"><div className="kv-card-label">Active Submissions</div><div className="kv-card-value">{total}</div></div>
        <div className="kv-card"><div className="kv-card-label">Total Lives</div><div className="kv-card-value">{totalLives.toLocaleString()}</div></div>
        <div className="kv-card"><div className="kv-card-label">Proposals Sent</div><div className="kv-card-value">{proposalsSent}</div></div>
        <div className="kv-card"><div className="kv-card-label">Active Clients</div><div className="kv-card-value" style={{color: "var(--green-700)"}}>{clients}</div></div>
      </div>
      <div className="card card-padded">
        <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12}}>
          <h3 style={{margin: 0, fontSize: 14, fontWeight: 600}}>Recent Submissions</h3>
          <Btn variant="ghost" size="sm" iconRight="chev-right">View all</Btn>
        </div>
        <table className="census-sub-table">
          <thead><tr><th>Company</th><th>Contact</th><th>Lives</th><th>Status</th><th>Submitted</th></tr></thead>
          <tbody>
            {recent.map(g => (
              <tr key={g.id} className="census-row" style={{cursor: "pointer"}} onClick={() => onOpenGroup(g)}>
                <td className="cell-strong">{g.companyName}</td>
                <td>{g.contactName}</td>
                <td>{g.totalLives}</td>
                <td><StatusBadge status={g.status}/></td>
                <td className="cell-muted">{formatDate(g.submittedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupsView({ groups, onOpenGroup, search }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const filtered = groups.filter(g => {
    if (statusFilter !== "all" && g.status !== statusFilter) return false;
    if (search && !g.companyName.toLowerCase().includes(search.toLowerCase()) && !g.contactEmail.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 style={{fontSize: 24, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.02em"}}>Groups</h1>
          <p style={{color: "var(--muted-foreground)", margin: 0, fontSize: 14}}>Census submissions organized by company — click any row to open its detail page.</p>
        </div>
        <Btn variant="default" icon="plus">New Group</Btn>
      </div>
      <StatsOverview groups={groups}/>
      <div className="toolbar">
        <select className="field-select" style={{width: "auto", padding: "8px 32px 8px 12px"}} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {window.STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <div style={{flex: 1}}/>
        <Badge variant="outline">{filtered.length} of {groups.length}</Badge>
        <Btn variant="outline" icon="download" size="sm">Export CSV</Btn>
      </div>
      <GroupsTable groups={filtered} onRowClick={onOpenGroup} onViewReport={onOpenGroup}/>
    </div>
  );
}

function App() {
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "dark": false,
    "density": "cozy",
    "accent": "blue"
  }/*EDITMODE-END*/;

  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);

  // Hash-based routing: #/view or #/groups/:id
  const parseHash = () => {
    const h = (window.location.hash || "").replace(/^#\/?/, "");
    const parts = h.split("/").filter(Boolean);
    if (!parts.length) return { view: "groups", id: null };
    if (parts[0] === "groups" && parts[1]) return { view: "groups", id: parts[1] };
    return { view: parts[0], id: null };
  };
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const navigate = (view, id) => {
    const next = id ? `#/groups/${id}` : `#/${view}`;
    if (window.location.hash !== next) window.location.hash = next;
    else setRoute({ view, id: id || null });
  };
  const view = route.view;
  const selectedGroupId = route.id;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", !!tweaks.dark);
    const hues = { blue: 210, teal: 185, indigo: 240, green: 160 };
    const h = hues[tweaks.accent] ?? 210;
    const r = document.documentElement.style;
    r.setProperty("--primary", `hsl(${h} 85% 35%)`);
    r.setProperty("--primary-hover", `hsl(${h} 85% 30%)`);
    r.setProperty("--primary-10", `hsl(${h} 85% 35% / 0.10)`);
    r.setProperty("--primary-20", `hsl(${h} 85% 35% / 0.20)`);
    r.setProperty("--ring", `hsl(${h} 85% 35%)`);
  }, [tweaks]);

  useEffect(() => {
    const handler = (e) => {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "__activate_edit_mode") setTweaksOpen(true);
      if (e.data.type === "__deactivate_edit_mode") setTweaksOpen(false);
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  const allGroups = window.MOCK.groups;
  const selectedGroup = selectedGroupId ? allGroups.find(g => g.id === selectedGroupId) : null;
  const uniqueCompanyCount = new Set(allGroups.map(g => g.companyName)).size;

  const companySubs = selectedGroup
    ? allGroups.filter(g => g.companyName === selectedGroup.companyName).sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    : [];

  const openGroup = (g) => navigate("groups", g.id);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable;
      if (e.key === "Escape") {
        if (tweaksOpen) { setTweaksOpen(false); return; }
        if (selectedGroupId) { navigate("groups"); return; }
      }
      if (typing) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.key === "j" || e.key === "k") && view === "groups" && !selectedGroupId) {
        e.preventDefault();
        const rows = Array.from(document.querySelectorAll("tr.census-row"));
        if (!rows.length) return;
        const cur = rows.findIndex(r => r.classList.contains("row-focused"));
        rows.forEach(r => r.classList.remove("row-focused"));
        let next = e.key === "j" ? cur + 1 : cur - 1;
        if (next < 0) next = 0;
        if (next >= rows.length) next = rows.length - 1;
        rows[next].classList.add("row-focused");
        rows[next].scrollIntoView({ block: "nearest" });
      }
      if (e.key === "Enter" && view === "groups" && !selectedGroupId) {
        const focused = document.querySelector("tr.census-row.row-focused");
        if (focused) focused.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, selectedGroupId, tweaksOpen]);

  const crumbs = useMemo(() => {
    const base = [{ label: "Admin", key: "home" }];
    if (view === "dashboard") return [...base, { label: "Dashboard" }];
    if (view === "groups") {
      const arr = [...base, { label: "Groups", key: "groups-root" }];
      if (selectedGroup) arr.push({ label: selectedGroup.companyName });
      return arr;
    }
    if (view === "users") return [...base, { label: "Users" }];
    if (view === "generator") return [...base, { label: "Proposal Generator" }];
    if (view === "templates") return [...base, { label: "Templates" }];
    if (view === "settings") return [...base, { label: "Settings" }];
    return base;
  }, [view, selectedGroup]);

  const handleCrumb = (c) => {
    if (c.key === "home") navigate("dashboard");
    if (c.key === "groups-root") navigate("groups");
  };

  return (
    <div className="layout" data-screen-label="admin">
      <Sidebar view={view} setView={(v) => navigate(v)} counts={{ groups: uniqueCompanyCount, users: window.MOCK.users.length }}/>
      <div className="main-column">
        <Topbar crumbs={crumbs} onCrumbClick={handleCrumb} dark={tweaks.dark} setDark={(v) => setTweaks({...tweaks, dark: v})} onTweaks={() => setTweaksOpen(!tweaksOpen)} search={search} setSearch={setSearch} searchRef={searchRef}/>
        <div className="content">
          {view === "dashboard" && <DashboardView groups={allGroups} onOpenGroup={openGroup}/>}
          {view === "groups" && !selectedGroup && <GroupsView groups={allGroups} onOpenGroup={openGroup} search={search}/>}
          {view === "groups" && selectedGroup && (
            <>
              <div style={{marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between"}}>
                <Btn variant="ghost" size="sm" icon="arrow-left" onClick={() => navigate("groups")}>Back to all groups</Btn>
                <span className="cell-muted" style={{fontSize: 11}}>Press <span className="kbd-hint">Esc</span> to return</span>
              </div>
              <GroupDetail
                group={selectedGroup}
                allSubmissions={companySubs}
                activeSubmissionId={selectedGroup.id}
                onBack={() => navigate("groups")}
                onOpenSubmission={(s) => navigate("groups", s.id)}
              />
            </>
          )}
          {view === "users" && <UserManagement/>}
          {view === "generator" && <ProposalGenerator/>}
          {view === "templates" && <EmptyPlaceholder icon="file-spreadsheet" title="Templates" desc="Manage reusable XLSM templates and proposal layouts."/>}
          {view === "settings" && <EmptyPlaceholder icon="settings" title="Settings" desc="Organization, team, and integration settings will live here."/>}
        </div>
      </div>
      <TweaksPanel open={tweaksOpen} onClose={() => setTweaksOpen(false)} state={tweaks} setState={setTweaks}/>
    </div>
  );
}

function EmptyPlaceholder({ icon, title, desc }) {
  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 style={{fontSize: 24, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.02em"}}>{title}</h1>
          <p style={{color: "var(--muted-foreground)", margin: 0, fontSize: 14}}>{desc}</p>
        </div>
      </div>
      <div className="empty-state">
        <Icon name={icon} size={32}/>
        <div className="empty-title">Coming soon</div>
        <div className="empty-sub">This section is a placeholder in the current prototype.</div>
      </div>
    </div>
  );
}

function TweaksPanel({ open, onClose, state, setState }) {
  if (!open) return null;
  const set = (k, v) => {
    const next = { ...state, [k]: v };
    setState(next);
    try { window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [k]: v } }, "*"); } catch(e){}
  };
  return (
    <div style={{position: "fixed", right: 20, bottom: 20, width: 280, background: "var(--card)", border: "1px solid var(--card-border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow-md)", padding: 16, zIndex: 90, fontSize: 13}}>
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--border)"}}>
        <div style={{fontWeight: 600}}>Tweaks</div>
        <Btn variant="ghost" size="sm" icon="x" onClick={onClose}/>
      </div>
      <div style={{display: "flex", flexDirection: "column", gap: 10}}>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
          <span style={{color: "var(--muted-foreground)"}}>Theme</span>
          <div style={{display: "flex", background: "var(--muted)", borderRadius: 6, padding: 2}}>
            <button style={{padding: "4px 10px", fontSize: 12, borderRadius: 4, background: !state.dark ? "var(--background)" : "transparent"}} onClick={() => set("dark", false)}>Light</button>
            <button style={{padding: "4px 10px", fontSize: 12, borderRadius: 4, background: state.dark ? "var(--background)" : "transparent"}} onClick={() => set("dark", true)}>Dark</button>
          </div>
        </div>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
          <span style={{color: "var(--muted-foreground)"}}>Accent</span>
          <div style={{display: "flex", gap: 6}}>
            {[{k:"blue",h:210},{k:"teal",h:185},{k:"indigo",h:240},{k:"green",h:160}].map(s => (
              <button key={s.k} onClick={() => set("accent", s.k)} style={{width: 22, height: 22, borderRadius: "50%", background: `hsl(${s.h} 85% 35%)`, border: state.accent === s.k ? "2px solid var(--foreground)" : "2px solid transparent", outline: "1px solid var(--border)"}}/>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
