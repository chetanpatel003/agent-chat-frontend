import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Only jsdom-environment test files (`// @vitest-environment jsdom`) have a
// `document` — RTL's cleanup() dereferences it, so plain node-environment
// tests (which never render anything) must skip this registration rather
// than throw on import.
if (typeof document !== "undefined") {
  afterEach(() => cleanup());
}
