# UI Design Standard V1

## Purpose

This is the shared visual contract for statistics, profit, settlement, report, and future detail pages. It changes presentation only; business calculations, data access, permissions, and persistence remain outside the UI standard.

## Information hierarchy

- Use a consistent hierarchy: page title, section title, supporting text, labels, values, and emphasized totals.
- Details use cards with a title, optional subtitle, compact content, and consistent spacing. Avoid long inline strings that mix dates, percentages, and amounts.
- Prefer high information density on mobile: place related label/value pairs side by side when they remain readable, and allow natural wrapping rather than shrinking text excessively.

## Amounts and numbers

- Render monetary values with two decimal places using the shared money formatter.
- Use tabular numerals, a consistent currency/value gap, and right alignment for amounts.
- Income and profitable totals use the success color; expenses use the normal text color; losses and negative profit use the danger color.
- Keep the sign adjacent to the number and never separate it into another layout element.
- Important balances and transfer amounts are visually prominent, while supporting amounts remain consistent and compact.

## Partner Settlement Card V1

- Partner name and the compact status badge share one header row.
- `代收`, `垫付`, `实际留存`, and `应得利润` use a two-column dense grid with labels left-aligned and values right-aligned.
- `结算余额` is a separate emphasized row with a divider and the largest monetary value in the card.
- `应收`, `应付`, and `已平衡` badges share dimensions, radius, typography, and vertical alignment.
- The final transfer suggestion is one compact row: description on the left (`付款方 转给 收款方`) and the prominent amount right-aligned on the same line.

## Cards, headings, and spacing

- Reuse the shared detail-card and detail-grid patterns rather than page-specific card variants.
- Keep card padding, section gaps, heading spacing, border radius, divider treatment, and title scale consistent.
- Section headings use the same scale and weight across settlement segments, partner names, transfer suggestions, income details, and expense details.

## Responsive behavior

- The 390px layout must have no horizontal scrolling or clipped monetary values.
- Keep tap targets usable and let long property/partner names wrap naturally.
- Two-column detail layouts may collapse only when readability requires it; never create a one-item-per-row layout solely from inconsistent page styling.

## Reuse rule

Future statistics, profit, settlement, and report pages must reuse shared UI primitives and these rules. New business logic must not be introduced through presentation components.
