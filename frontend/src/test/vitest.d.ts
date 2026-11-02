/// <reference types="vitest/globals" />
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

// jest-dom 7.0.1 still augments the vitest 4 `Assertion<T>` shape. Vitest 5
// exposes `Matchers<R, T>` for custom matchers instead. Remove this block once
// jest-dom ships Vitest 5 types.
declare module "vitest" {
  // Merging needs the same type parameters as Vitest's declaration, and an
  // empty body.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown>
    extends TestingLibraryMatchers<unknown, R> {}
}
