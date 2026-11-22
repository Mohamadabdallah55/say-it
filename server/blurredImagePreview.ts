export function renderBlurredImagePreview(
  original: Buffer,
  mime: 'image/png' | 'image/jpeg',
  width: number,
  height: number,
  regions: readonly string[],
): string {
  const polygons = regions.map(points => `<polygon points="${points}"/>`).join('');
  const originalHref = `data:${mime};base64,${original.toString('base64')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 100 100" preserveAspectRatio="none">
    <defs>
      <image id="photo" href="${originalHref}" width="100" height="100" preserveAspectRatio="none"/>
      <mask id="outside"><rect width="100" height="100" fill="white"/><g fill="black">${polygons}</g></mask>
      <mask id="silhouette" mask-type="alpha"><use href="#photo"/></mask>
      <clipPath id="lettering">${polygons}</clipPath>
      <filter id="blur"><feGaussianBlur stdDeviation="5"/></filter>
    </defs>
    <use href="#photo" mask="url(#outside)"/>
    <g mask="url(#silhouette)" clip-path="url(#lettering)"><use href="#photo" filter="url(#blur)"/></g>
  </svg>`;
}
