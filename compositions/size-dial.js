import { SIZE_SCALES, formatSizeScale, nearestSizeScale } from "./effect-model.js?v=17";
import { mountArcDial } from "./brush-dial.js?v=30";

export function mountSizeDial({ host, value, onChange }) {
  const current = nearestSizeScale(value);
  host?.classList.add("is-size-arc");
  return mountArcDial({
    host,
    items: SIZE_SCALES.map((scale) => ({
      id: String(scale),
      label: formatSizeScale(scale),
    })),
    value: String(current),
    ariaLabel: "size",
    onChange: (id) => onChange?.(Number(id)),
  });
}
