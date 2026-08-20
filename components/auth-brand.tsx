import { PRODUCT_BRAND, PRODUCT_TAGLINE } from "@/lib/brand";

// Runtime raster derived from brand/icon/bee-rental-icon-master.svg (frozen V8 master).
const CANONICAL_BRAND_ICON = "/icons/icon-192.png";

export function AuthBrand({ subtitle = PRODUCT_TAGLINE }: { subtitle?: string }) {
  return (
    <div className="brand auth-brand" style={{ padding: 0 }}>
      <div className="brand-mark">
        <img className="auth-brand-icon" src={CANONICAL_BRAND_ICON} alt="" aria-hidden="true" />
      </div>
      <div>
        <div className="brand-title">{PRODUCT_BRAND}</div>
        <div className="brand-subtitle">{subtitle}</div>
      </div>
    </div>
  );
}
