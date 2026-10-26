import { normalizeStyle as vueNormalizeStyle } from '@vue/runtime-dom';

export * from '@vue/runtime-dom';

const unitlessProperties = new Set([
  'animationIterationCount',
  'aspectRatio',
  'borderImageOutset',
  'borderImageSlice',
  'borderImageWidth',
  'boxFlex',
  'boxFlexGroup',
  'columnCount',
  'columns',
  'fillOpacity',
  'flex',
  'flexGrow',
  'flexShrink',
  'floodOpacity',
  'fontWeight',
  'gridArea',
  'gridColumn',
  'gridRow',
  'lineHeight',
  'opacity',
  'order',
  'orphans',
  'scale',
  'stopOpacity',
  'strokeDasharray',
  'strokeDashoffset',
  'strokeMiterlimit',
  'strokeOpacity',
  'strokeWidth',
  'tabSize',
  'widows',
  'zIndex',
  'zoom',
]);

export function normalizeStyle(value: Parameters<typeof vueNormalizeStyle>[0]): ReturnType<typeof vueNormalizeStyle> {
  const normalized = vueNormalizeStyle(value);
  if (!normalized || typeof normalized !== 'object') {
    return normalized;
  }
  const style = { ...normalized };
  for (const [property, current] of Object.entries(style)) {
    if (
      typeof current === 'number' &&
      !property.startsWith('--') &&
      !unitlessProperties.has(property)
    ) {
      style[property] = `${current}px`;
    }
  }
  return style;
}
