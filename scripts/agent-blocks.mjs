#!/usr/bin/env node
// Writes the plain-text version of every <Request> in the guides, for agents.
//
// The <Request> card (snippets/request.jsx) is drawn in the browser, so a reader that fetches a page as
// HTML, or as Markdown from Mintlify, may get none of it. After each card this script keeps a block
// that only the Markdown output carries (<Visibility for="agents">): the request as plain HTTP and the
// curl command the card's button copies. It builds them with the card's own code, the text between
// "BEGIN shared" and "END shared" in snippets/request.jsx, so the three can't disagree.
//
//   node scripts/agent-blocks.mjs            write the blocks
//   node scripts/agent-blocks.mjs --check    fail if any block is missing or stale (run before a push)
//
// The generated blocks sit between {/* agent-block:start */} and {/* agent-block:end */}. Don't edit them.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const START = "{/* agent-block:start */}";
const END = "{/* agent-block:end */}";
const SKIP = new Set(["node_modules", ".git", "api-reference", "images", "logo", "scripts", "snippets"]);

// The card's own logic, evaluated as it is written in the component.
const source = readFileSync(join(root, "snippets/request.jsx"), "utf8");
const begin = source.indexOf("// BEGIN shared");
const end = source.indexOf("// END shared");
if (begin < 0 || end < begin) fail("snippets/request.jsx has no BEGIN shared / END shared block");
const requestParts = vm.runInNewContext(`(() => {\n${source.slice(begin, end)}\nreturn requestParts;\n})()`, {}, { timeout: 1000 });

function fail(message) {
  console.error(`agent-blocks: ${message}`);
  process.exit(1);
}

const evaluate = (expression, where) => {
  try {
    return vm.runInNewContext(`(${expression})`, {}, { timeout: 1000 });
  } catch (error) {
    return fail(`${where}: can't read ${expression.slice(0, 60)}: ${error.message}`);
  }
};

// The end of a JSX element that starts at `from`: the "/>" outside every brace and string.
function elementEnd(text, from, where) {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      i = stringEnd(text, i);
    } else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === "/" && text[i + 1] === ">" && depth === 0) return i + 2;
  }
  return fail(`${where}: <Request> is never closed`);
}

function stringEnd(text, from) {
  const quote = text[from];
  for (let i = from + 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === quote) return i;
  }
  return text.length;
}

// name="text", name={expression} or a bare name, in the order written.
function attributes(text, where) {
  const props = {};
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++;
      continue;
    }
    const name = /^[A-Za-z_][\w-]*/.exec(text.slice(i));
    if (!name) return fail(`${where}: can't read the attributes near ${text.slice(i, i + 30)}`);
    i += name[0].length;
    if (text[i] !== "=") {
      props[name[0]] = true;
      continue;
    }
    i++;
    if (text[i] === '"') {
      const close = stringEnd(text, i);
      props[name[0]] = text.slice(i + 1, close);
      i = close + 1;
    } else if (text[i] === "{") {
      let depth = 0;
      let j = i;
      for (; j < text.length; j++) {
        const c = text[j];
        if (c === '"' || c === "'" || c === "`") j = stringEnd(text, j);
        else if (c === "{") depth++;
        else if (c === "}" && --depth === 0) break;
      }
      props[name[0]] = evaluate(text.slice(i + 1, j), where);
      i = j + 1;
    } else return fail(`${where}: can't read the value of ${name[0]}`);
  }
  return props;
}

// What agents get in place of the card: the request as plain HTTP, then the curl the button copies.
function block(props, indent) {
  const { http, curl } = requestParts(props);
  const lines = [START, '<Visibility for="agents">', ""];
  if (props.label) lines.push(`${props.label}:`, "");
  lines.push("```http", ...http.split("\n"), "```", "", "```bash", ...curl.split("\n"), "```", "", "</Visibility>", END);
  return lines.map((line) => (line ? indent + line : line)).join("\n");
}

function process_(path) {
  const where = relative(root, path);
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n");
  let out = "";
  let cursor = 0;
  let offset = 0;
  let fence = false;
  let requests = 0;

  for (const line of lines) {
    if (/^\s*```/.test(line)) fence = !fence;
    const open = /^(\s*)<Request\b/.exec(line);
    if (open && !fence) {
      const from = offset + open[1].length;
      const to = elementEnd(text, from, where);
      const props = attributes(text.slice(from + "<Request".length, to - 2), where);
      if (!props.path) fail(`${where}: a <Request> has no path`);
      const after = text.slice(to);
      const old = new RegExp(`^\\s*${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}`).exec(after);
      out += text.slice(cursor, to) + "\n\n" + block(props, open[1]);
      cursor = old ? to + old[0].length : to;
      requests++;
    }
    offset += line.length + 1;
  }
  out += text.slice(cursor);

  const blocks = out.split(START).length - 1;
  if (blocks !== requests) fail(`${where}: ${blocks} agent blocks for ${requests} requests (a block no <Request> owns?)`);
  return { where, path, text, next: out, requests };
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (name.endsWith(".mdx")) yield path;
  }
}

let total = 0;
const stale = [];
for (const path of files(root)) {
  const result = process_(path);
  if (!result.requests) continue;
  total += result.requests;
  if (result.next !== result.text) {
    stale.push(result.where);
    if (!check) writeFileSync(path, result.next);
  }
}

if (check) {
  if (stale.length) {
    console.error(`agent-blocks: out of date in ${stale.join(", ")}\nRun: node scripts/agent-blocks.mjs`);
    process.exit(1);
  }
  console.log(`agent-blocks: ${total} requests, every block current`);
} else {
  console.log(`agent-blocks: ${total} requests, ${stale.length ? `updated ${stale.join(", ")}` : "nothing to change"}`);
}
