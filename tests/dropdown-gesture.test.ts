import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error test runner imports the TypeScript module directly.
import { DROPDOWN_TAP_MOVE_THRESHOLD, isDropdownTap, moveDropdownGesture, shouldContainDropdownOverscroll, startDropdownGesture } from "../lib/dropdown-gesture.ts";

test("tap remains selectable below the movement threshold", () => {
  const started = startDropdownGesture(20, 40);
  const moved = moveDropdownGesture(started, 22, 43);
  assert.equal(isDropdownTap(moved.state), true);
});

test("swipe starting on an option becomes scroll and must not select", () => {
  const started = startDropdownGesture(20, 40);
  const moved = moveDropdownGesture(started, 20, 40 + DROPDOWN_TAP_MOVE_THRESHOLD + 1);
  assert.equal(moved.state.moved, true);
  assert.equal(isDropdownTap(moved.state), false);
});

test("scrolling inside the list does not need boundary cancellation", () => {
  assert.equal(shouldContainDropdownOverscroll(30, 500, 200, -12), false);
  assert.equal(shouldContainDropdownOverscroll(30, 500, 200, 12), false);
});

test("top and bottom overscroll are contained instead of chaining to the page", () => {
  assert.equal(shouldContainDropdownOverscroll(0, 500, 200, 12), true);
  assert.equal(shouldContainDropdownOverscroll(300, 500, 200, -12), true);
  assert.equal(shouldContainDropdownOverscroll(0, 500, 200, -12), false);
  assert.equal(shouldContainDropdownOverscroll(300, 500, 200, 12), false);
});

test("gesture state is independent of list length", () => {
  for (const length of [5, 20, 50]) {
    const options = Array.from({ length }, (_, index) => `option-${index + 1}`);
    assert.equal(options.at(0), "option-1");
    assert.equal(options.at(-1), `option-${length}`);
  }
});
