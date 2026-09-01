import type { Group } from "@/lib/model";
import { C, Logo, panel, primaryBtn, textInput } from "@/lib/ui";

interface Props {
  codeInput: string;
  codeError: boolean;
  showDemo: boolean;
  demoGroups: Group[];
  showDemoPanel: boolean;
  onCode: (v: string) => void;
  onSubmit: () => void;
  onToggleDemo: () => void;
  onPickDemo: (code: string) => void;
}

export default function Login({
  codeInput,
  codeError,
  showDemo,
  demoGroups,
  showDemoPanel,
  onCode,
  onSubmit,
  onToggleDemo,
  onPickDemo,
}: Props) {
  return (
    <div style={{ minHeight: "100vh", background: C.page }}>
      <div style={{ background: "#fff", borderBottom: `1px solid ${C.border}`, padding: "0 22px" }}>
        <div
          style={{
            maxWidth: 1400,
            margin: "0 auto",
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <img src={Logo} alt="Kennion Benefit Advisors" style={{ height: 30, display: "block" }} />
          <span style={{ fontSize: 13, color: C.muted }}>2027 Renewal</span>
        </div>
      </div>

      <div style={{ display: "grid", placeItems: "center", padding: "46px 20px" }}>
        <div style={{ width: "100%", maxWidth: 520 }}>
          <div style={{ ...panel, padding: "28px 30px 30px" }}>
            <h1
              style={{
                margin: "0 0 6px",
                fontSize: 26,
                fontWeight: 600,
                color: C.ink,
                letterSpacing: "-0.2px",
              }}
            >
              Welcome to your 2027 renewal
            </h1>
            <p
              style={{
                margin: "0 0 22px",
                fontSize: 14,
                lineHeight: 1.6,
                color: C.body,
                textWrap: "pretty",
              }}
            >
              The 2026 program is not available for 2027. Enter your group access code to see the
              plans you have today, what you and your employees pay, and the options we shopped for
              you.
            </p>

            <label
              htmlFor="access-code"
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: C.ink,
                marginBottom: 6,
              }}
            >
              Group access code
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="access-code"
                value={codeInput}
                onChange={(e) => onCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSubmit();
                }}
                placeholder="KEN-XXXX-XXXX"
                autoComplete="off"
                style={{ ...textInput, flex: 1 }}
              />
              <button onClick={onSubmit} style={primaryBtn}>
                Generate
              </button>
            </div>

            {codeError && (
              <div
                role="alert"
                style={{
                  marginTop: 12,
                  padding: "9px 12px",
                  background: C.redTint,
                  border: `1px solid ${C.redEdge}`,
                  borderRadius: 4,
                  fontSize: 13,
                  color: C.red,
                }}
              >
                That code doesn't match a group. Check the letter we sent, or call us.
              </div>
            )}

            <div
              style={{
                marginTop: 22,
                paddingTop: 16,
                borderTop: `1px solid ${C.rule}`,
                fontSize: 13,
                lineHeight: 1.7,
                color: C.muted,
              }}
            >
              Lost your code? Hunter Shepherd &middot;{" "}
              <a href="mailto:hunter@kennion.com">hunter@kennion.com</a> &middot; 205-641-0469
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 11, color: C.faint }}>powered by</span>
            <img
              src={Logo}
              alt="Kennion Benefit Advisors"
              style={{ height: 28, display: "block" }}
            />
          </div>

          {showDemoPanel && (
            <div style={{ ...panel, marginTop: 10, padding: "12px 14px" }}>
              <button
                onClick={onToggleDemo}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 13,
                  color: C.blue,
                  cursor: "pointer",
                }}
              >
                Demo codes (remove before launch)
              </button>
              {showDemo && (
                <div style={{ marginTop: 10, display: "grid" }}>
                  {demoGroups.map((d) => (
                    <button
                      key={d.code}
                      onClick={() => onPickDemo(d.code)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        width: "100%",
                        background: "none",
                        border: "none",
                        borderTop: `1px solid ${C.rule}`,
                        padding: "8px 2px",
                        fontSize: 12.5,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ color: C.blue }}>{d.code}</span>
                      <span style={{ color: C.muted }}>{d.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
