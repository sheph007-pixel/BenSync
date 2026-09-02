import { C } from "@/lib/ui";

export interface Section {
  id: string;
  label: string;
}

interface Props {
  sections: Section[];
  /** The `#hash` currently in the address bar, without the `#`. */
  current: string;
}

/**
 * "On this page" jump links. Plain anchors: the browser scrolls, the hash goes
 * into the address bar, and the link can be copied to point someone at a
 * section. Hidden in print, where the whole page is on paper anyway.
 */
export default function SectionNav({ sections, current }: Props) {
  if (sections.length < 2) return null;
  return (
    <nav
      aria-label="On this page"
      className="noprint"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 4,
        marginTop: 12,
        fontSize: 12.5,
      }}
    >
      <span style={{ color: C.faint, marginRight: 6 }}>On this page</span>
      {sections.map((s) => {
        const on = current === s.id;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={on ? "location" : undefined}
            style={{
              padding: "4px 10px",
              borderRadius: 3,
              color: on ? C.ink : C.blue,
              background: on ? C.blueTint : "transparent",
              fontWeight: on ? 600 : 400,
              textDecoration: "none",
            }}
          >
            {s.label}
          </a>
        );
      })}
    </nav>
  );
}
