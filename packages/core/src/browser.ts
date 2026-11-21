// @verbal/core/browser — the part of the transcript model the browser may load.
// Everything here is free of Node built-ins, so importing it from a React
// component or hook cannot drag `node:crypto`, `node:fs`, or `node:path` into
// the client bundle.
export * from "./batch";
export * from "./history";
export * from "./search";
export * from "./sync";
export * from "./transcript";

// Types only: these modules touch Node built-ins, but a type re-export is
// erased at compile time, so the client gets the shapes without the imports.
export type { JobRecord } from "./jobs";
export type { ProjectDocument } from "./project";
export type { ProjectSummary } from "./library";
