# Responsive Contract

This is the final 2.x regression contract for the responsive tree roots. It records ownership, not historical implementation details.

## Shell matrix

| Range | Shell | Navigation | Main ownership |
|---|---|---|---|
| `<=640px` | Phone | `.mobile-nav` reserved bottom layout row | `.main` is the sole application-content scroll owner |
| `641px-1100px` | Medium | 72px `.compact-rail` | `.main` has no mobile-nav clearance |
| `>=1101px` | Desktop | 260px `.sidebar` | Desktop main spacing |

Contract probe widths: `320, 360, 375, 390, 393, 414, 430, 480, 600, 640, 641, 720, 768, 820, 900, 980, 981, 1024, 1100, 1101, 1180, 1280, 1440`.

## Ownership

- `.app-shell` is viewport-bound and clips only its own outer frame; `.main` is the sole application-content vertical scroll owner.
- Phone `.mobile-nav` is a reserved grid row, not a fixed overlay. It owns its internal Home Indicator safe area.
- `--ui-mobile-nav-overlay-offset` is limited to fixed overlays such as toast/upload progress; it is not page-content clearance.
- `ModalLayerManager` owns document scroll lock; `.modal-backdrop` and `.modal-card` have one CSS owner each.
- Tenant List remains a frozen three-row contract: identity `30/40/30`, rent `31/25/44`, and five fixed status slots.
- BUG-01 keeps the shared `SearchableSelect`/`DropdownListbox` path and the local advanced-options `overflow: visible` contract.
- `.table-wrap` and chart scroll wrappers own intentional internal horizontal scrolling. Pages and the document do not become the scroll surface.

## Fixed-size allowlist

Fixed values are allowed when semantically owned: 44px touch targets, 48px navigation-link minimums, 1px borders, icon sizes, 72px compact rail, 260px sidebar, 720px table minimum, 768px chart minimum, modal max-widths, and necessary badge/action/chart-bar minima.

## Prohibited responsive layout patterns

Do not add device-model CSS, `window.innerWidth`, `screen.width`, `devicePixelRatio`, user-agent-driven layout, `transform: scale()` or CSS `zoom` for responsive layout. Pointer-capability detection and error-reporting metadata are not layout contracts.

## Validation status

- `IPHONE_MANUAL_VALIDATION_PASSED`: 2.3d, 2.4c and BUG-01.
- Tablet/foldable runtime validation is not claimed by static tests.
- The final static contract is executed by `npm run validate:responsive`.
