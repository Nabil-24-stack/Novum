import test from "node:test";
import assert from "node:assert/strict";

import { fixImports } from "./import-fixer.ts";

test("preserves valid Radix select usage and imports", () => {
  const input = `
    export function Demo() {
      return (
        <Select defaultValue="option-1">
          <SelectTrigger>
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option-1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );
    }
  `;

  const result = fixImports(input, "/App.tsx");

  assert.match(
    result.code,
    /import \{ Select, SelectTrigger, SelectValue, SelectContent, SelectItem \} from "\.\/components\/ui\/select";/
  );
  assert.match(result.code, /<SelectTrigger>/);
  assert.match(result.code, /<SelectContent>/);
  assert.match(result.code, /<SelectItem value="option-1">/);
});

test("removes non-existent SelectOption import without adding a compatibility alias", () => {
  const input = `
    import { Select, SelectOption } from "./components/ui/select";

    export function Demo() {
      return (
        <Select>
          <SelectOption value="option-1">Option 1</SelectOption>
        </Select>
      );
    }
  `;

  const result = fixImports(input, "/App.tsx");

  assert.match(result.code, /import \{ Select \} from "\.\/components\/ui\/select";/);
  assert.doesNotMatch(result.code, /import \{[^}]*SelectOption/);
  assert.match(result.code, /<SelectOption value="option-1">Option 1<\/SelectOption>/);
  assert.ok(result.fixes.some((fix) => fix.original === "SelectOption"));
});

test("does not perform the old Radix-to-native select rewrite", () => {
  const input = `
    import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./components/ui/select";

    export function Demo({ setValue }) {
      return (
        <Select onValueChange={setValue}>
          <SelectTrigger>
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option-1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );
    }
  `;

  const result = fixImports(input, "/App.tsx");

  assert.match(result.code, /onValueChange=\{setValue\}/);
  assert.match(result.code, /<SelectTrigger>/);
  assert.match(result.code, /<SelectContent>/);
  assert.doesNotMatch(result.code, /SelectOption/);
});
