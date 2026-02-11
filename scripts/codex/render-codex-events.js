#!/usr/bin/env node

const path = require("node:path");
const readline = require("node:readline");

const cwd = process.cwd();
const MAX_OUTPUT_LINES = 4;

function stripMarkdown(text) {
  return String(text || "").replace(/\*\*(.*?)\*\*/g, "$1").trim();
}

function shorten(text, max = 180) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function unwrapShellCommand(command) {
  const value = String(command || "").trim();
  const match = value.match(/^\/bin\/bash -lc "(.*)"$/);
  if (!match) return value;
  return match[1].replace(/\\"/g, "\"");
}

function makeRelative(filePath) {
  const value = String(filePath || "").trim();
  if (!value) return value;
  if (!path.isAbsolute(value)) return value;
  const relative = path.relative(cwd, value);
  return relative && !relative.startsWith("..") ? relative : value;
}

function printOutputPreview(output) {
  const trimmed = String(output || "").trim();
  if (!trimmed) return;
  const lines = trimmed.split(/\r?\n/);
  const preview = lines.slice(0, MAX_OUTPUT_LINES);
  for (const line of preview) {
    process.stdout.write(`    ${line}\n`);
  }
  if (lines.length > preview.length) {
    process.stdout.write(`    ... (${lines.length - preview.length} more lines)\n`);
  }
}

function printFileChanges(changes) {
  if (!Array.isArray(changes) || changes.length === 0) {
    process.stdout.write("[file] File change recorded.\n");
    return;
  }

  const preview = changes.slice(0, 4);
  const summary = preview
    .map((change) => {
      const kind = change?.kind || "update";
      const filePath = makeRelative(change?.path || "");
      return `${kind} ${filePath}`.trim();
    })
    .join("; ");
  const extraCount = changes.length - preview.length;
  const suffix = extraCount > 0 ? ` (+${extraCount} more)` : "";
  process.stdout.write(`[file] ${summary}${suffix}\n`);
}

function renderEvent(event) {
  if (!event || typeof event !== "object") return;

  if (event.type === "item.started") {
    const item = event.item || {};
    if (item.type === "command_execution") {
      process.stdout.write(`[run] ${shorten(unwrapShellCommand(item.command))}\n`);
    }
    return;
  }

  if (event.type === "item.completed") {
    const item = event.item || {};
    if (item.type === "reasoning") {
      const text = stripMarkdown(item.text);
      if (text) process.stdout.write(`[plan] ${text}\n`);
      return;
    }

    if (item.type === "command_execution") {
      const exitCode =
        typeof item.exit_code === "number" ? String(item.exit_code) : "unknown";
      const isSuccess = item.exit_code === 0;
      const label = isSuccess ? "ok" : "err";
      process.stdout.write(`[${label}] Command finished (exit ${exitCode})\n`);
      printOutputPreview(item.aggregated_output);
      return;
    }

    if (item.type === "file_change") {
      printFileChanges(item.changes);
      return;
    }

    if (item.type === "agent_message") {
      const text = stripMarkdown(item.text);
      if (text) process.stdout.write(`[agent] ${shorten(text, 220)}\n`);
    }
  }

  if (event.type === "item.failed") {
    const item = event.item || {};
    const message = stripMarkdown(item.text || item.message || "Item failed.");
    process.stdout.write(`[err] ${message}\n`);
  }

  if (event.type === "error") {
    const message = stripMarkdown(event.message || "Unexpected error event.");
    process.stdout.write(`[err] ${message}\n`);
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  const trimmed = String(line || "").trim();
  if (!trimmed) return;
  try {
    const event = JSON.parse(trimmed);
    renderEvent(event);
  } catch (error) {
    process.stdout.write(`${trimmed}\n`);
  }
});
