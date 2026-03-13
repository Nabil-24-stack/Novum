import test from "node:test";
import assert from "node:assert/strict";

import { normalizeBrandLogos } from "./brand-logo-normalizer.ts";

test("rewrites a navbar logo Button into static brand markup", () => {
  const input = `
    export function Navbar() {
      return (
        <header className="border-b">
          <nav className="flex items-center justify-between">
            <Button variant="default">
              <TrendingUp className="h-4 w-4" />
              Salary Arc
            </Button>
          </nav>
        </header>
      );
    }
  `;

  const result = normalizeBrandLogos(input, "/components/layout/Navbar.tsx");

  assert.match(result.code, /<div className="[^"]*bg-primary text-primary-foreground[^"]*"/);
  assert.doesNotMatch(result.code, /<Button variant="default">/);
  assert.equal(result.brandLogoNormalizations.length, 1);
  assert.equal(result.brandLogoNormalizations[0]?.text, "Salary Arc");
});

test("preserves semantic foreground pairing for a filled logo pill", () => {
  const input = `
    export function Navbar() {
      return (
        <header>
          <div className="navbar">
            <Button className="bg-primary text-primary-foreground rounded-full">
              Salary Arc
            </Button>
          </div>
        </header>
      );
    }
  `;

  const result = normalizeBrandLogos(input, "/components/layout/Navbar.tsx");

  assert.match(result.code, /bg-primary text-primary-foreground rounded-full/);
  assert.doesNotMatch(result.code, /<Button/);
});

test("keeps action buttons in headers untouched", () => {
  const input = `
    export function HeaderActions() {
      return (
        <header className="flex items-center justify-between">
          <Button>Dashboard</Button>
          <Button>Add Milestone</Button>
        </header>
      );
    }
  `;

  const result = normalizeBrandLogos(input, "/components/layout/Header.tsx");

  assert.match(result.code, /<Button>Dashboard<\/Button>/);
  assert.match(result.code, /<Button>Add Milestone<\/Button>/);
  assert.equal(result.brandLogoNormalizations.length, 0);
});

test("keeps interactive buttons untouched even when the label looks like a brand", () => {
  const input = `
    export function Navbar() {
      return (
        <header>
          <nav className="flex items-center justify-between">
            <Button onClick={() => navigate("/")}>
              Salary Arc
            </Button>
          </nav>
        </header>
      );
    }
  `;

  const result = normalizeBrandLogos(input, "/components/layout/Navbar.tsx");

  assert.match(result.code, /<Button onClick=\{\(\) => navigate\("\/"\)\}>/);
  assert.equal(result.brandLogoNormalizations.length, 0);
});
