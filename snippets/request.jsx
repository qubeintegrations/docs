/**
 * A request as the docs show it everywhere the point is the call, not running it: one of Mintlify's own
 * code blocks, matching the response block under it, holding the request as plain HTTP (the method,
 * path and query on one line, then a blank line and the JSON body), with a button in its header that
 * copies the curl command you'd run.
 *
 *   <Request method="POST" path="/api/v2/connections/{connection_id}/invoices"
 *            query={{ webhook_url: "https://your-app.example/webhooks/qube" }}
 *            body={{ customer_ref: { full_name: "Riverbend Electric" } }} />
 *
 * `body` is an object, formatted for you, or a string shown as written (for a body with a `{...}`
 * placeholder). With `file`, the curl command sends that file (`-d @file`) instead of the body shown.
 * A `{name}` in `path` becomes `$NAME` in the curl command, `{connection_id}` becoming `$CONN_ID`.
 * `label` names the request in the block's header, where a code block shows its filename ("Request"
 * without one). `auth={false}` is for a call that takes no API key, such as the MCP server's. Styles
 * are in /style.css.
 */
export const Request = ({ method = "GET", path, query, body, file, label, auth = true }) => {
  const [copied, setCopied] = useState(false);

  // BEGIN shared: plain JS with no JSX. scripts/agent-blocks.mjs runs this text to write the plain-text
  // version of each request that agents read, so the card, its copied curl and those blocks always agree.
  // (It lives inside the component because Mintlify keeps only the exported component of a snippet.)
  const WIDTH = 80;
  const BASE = "https://qubesync.com";

  // JSON the way the docs write it: a value stays on one line when it fits in 80 columns, else it
  // breaks. `col` is the indent of the line it starts on and `lead` what's already on that line.
  const inline = (v) => {
    if (Array.isArray(v)) return "[" + v.map(inline).join(", ") + "]";
    if (v !== null && typeof v === "object") {
      return "{" + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ": " + inline(x)).join(", ") + "}";
    }
    return JSON.stringify(v);
  };

  const fmt = (v, col, lead, force) => {
    const flat = inline(v);
    if (!force && lead + flat.length + 1 <= WIDTH) return flat;
    const pad = " ".repeat(col + 2);
    if (Array.isArray(v) && v.length) {
      const rows = v.map((x, i) => pad + fmt(x, col + 2, pad.length) + (i < v.length - 1 ? "," : ""));
      return ["[", ...rows, " ".repeat(col) + "]"].join("\n");
    }
    if (v !== null && typeof v === "object" && Object.keys(v).length) {
      const entries = Object.entries(v);
      const rows = entries.map(([k, x], i) => {
        const key = pad + JSON.stringify(k) + ": ";
        return key + fmt(x, col + 2, key.length) + (i < entries.length - 1 ? "," : "");
      });
      return ["{", ...rows, " ".repeat(col) + "}"].join("\n");
    }
    return flat;
  };

  // A body of one key stays on one line when it fits; any other opens up.
  const formatJson = (v, col, lead) =>
    fmt(v, col, lead, !(v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 1));

  // A string body is shown as written, less the indent it was typed with inside the MDX.
  const dedent = (text) => {
    const [first, ...rest] = text.split("\n");
    const indents = rest.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
    const cut = indents.length ? Math.min(...indents) : 0;
    return [first, ...rest.map((l) => l.slice(Math.min(cut, l.match(/^ */)[0].length)))].join("\n");
  };

  // Everything a request is shown as: its query, its body as written, the curl command that sends it
  // and the same request as plain HTTP.
  const requestParts = ({ method = "GET", path, query, body, file, auth = true }) => {
    const params = Object.entries(query || {});
    const queryString = params.map(([k, v]) => k + "=" + v).join("&");
    const hasBody = body !== undefined && body !== null;
    const shown = !hasBody ? "" : typeof body === "string" ? dedent(body) : formatJson(body, 0, 0);

    const env = (name) => "$" + (name === "connection_id" ? "CONN_ID" : name.toUpperCase());
    const url = BASE + path.replace(/\{(\w+)\}/g, (_, name) => env(name));
    const getWithParams = method === "GET" && params.length > 1;
    const lines = auth ? ['-u "$QUBE_API_KEY:"'] : [];
    if (getWithParams) lines.push("-G");
    if (method !== "GET") lines.push("-X " + method);
    lines.push('"' + (params.length && !getWithParams ? url + "?" + queryString : url) + '"');
    if (getWithParams) params.forEach(([k, v]) => lines.push('--data-urlencode "' + k + "=" + v + '"'));
    if (hasBody) {
      lines.push('-H "Content-Type: application/json"');
      const text = typeof body === "string" ? dedent(body) : formatJson(body, 2, 2 + 4);
      lines.push(file ? "-d @" + file : "-d '" + text + "'");
    }
    const curl = "curl " + lines.join(" \\\n  ");
    const http = method + " " + path + (queryString ? "?" + queryString : "") + (hasBody ? "\n\n" + shown : "");

    return { params, queryString, hasBody, shown, curl, http };
  };
  // END shared

  const { params, hasBody, shown, curl } = requestParts({ method, path, query, body, file, auth });
  const title = label || "Request";

  const copy = () => {
    const text = curl;
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => {});
      return;
    }
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    document.body.removeChild(area);
    done();
  };

  // The /api/v2 every path starts with recedes and {param} stands out, as :id does in the hero.
  const prefix = path.startsWith("/api/v2") ? "/api/v2" : "";
  const pathParts = path
    .slice(prefix.length)
    .split(/(\{\w+\})/)
    .map((part, i) =>
      /^\{\w+\}$/.test(part) ? (
        <span key={i} className="qube-request-param">{part}</span>
      ) : (
        part
      )
    );

  const valueClass = (v) =>
    typeof v === "number" ? "qube-request-number" : typeof v === "boolean" ? "qube-request-literal" : "qube-request-string";

  const json = (text) => {
    const out = [];
    const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)|(\{\.\.\.\})/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index));
      const cls = m[1] ? (m[2] ? "qube-request-key" : "qube-request-string") : m[3] ? "qube-request-literal" : m[4] ? "qube-request-number" : "qube-request-literal";
      out.push(<span key={m.index} className={cls}>{m[1] ? m[1] : m[0]}</span>);
      if (m[2]) out.push(m[2]);
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  };

  // The query as the request line ends with it: ?key=value&key=value.
  const queryParts = params.length
    ? [
        "?",
        ...params.flatMap(([k, v], i) => [
          i ? "&" : "",
          <span key={k + "-key"} className="qube-request-key">{k}</span>,
          "=",
          <span key={k + "-value"} className={valueClass(v)}>{String(v)}</span>,
        ]),
      ]
    : null;

  // The panel's text is `http` above, the same text as the agents' block, only colored.
  return (
    <div className="qube-request not-prose">
      <div className="qube-request-head">
        <span className="qube-request-title" title={title}>{title}</span>
        <button type="button" className="qube-request-copy" onClick={copy} aria-live="polite">
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {copied ? (
              <polyline points="4 9.5 7.5 13 14 5" />
            ) : (
              <g>
                <rect x="6.5" y="6.5" width="9" height="9" rx="2" />
                <path d="M3.5 11.5v-6a2 2 0 0 1 2-2h6" />
              </g>
            )}
          </svg>
          {copied ? "Copied" : "Copy as curl"}
        </button>
      </div>
      <pre className="qube-request-code">
        <code>
          <span className="qube-request-method">{method}</span>{" "}
          {prefix ? <span className="qube-request-prefix">{prefix}</span> : null}
          {pathParts}
          {queryParts}
          {hasBody ? ["\n\n", ...json(shown)] : null}
        </code>
      </pre>
    </div>
  );
};
