// @verbal/cleanup — proposal grouping and acceptance (browser-safe).
// Master freezing lives behind the `@verbal/cleanup/freeze` subpath because it
// touches media and hashing, which are server-side concerns.
export * from "./accept";
export * from "./detect";
export * from "./group";
export * from "./types";
