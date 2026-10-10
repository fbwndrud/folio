/** SVG 문서는 data: URL의 별도 origin으로 표시한다. */
export const useDataUrl = (type) => type.split(';', 1)[0].trim().toLowerCase() === 'image/svg+xml';
