import { useT } from '../i18n/context.jsx';
import { hrefFor } from '../lib/route.js';
import { highlightedParts } from '../lib/review.js';
import { AssetImage } from './Status.jsx';

/** Highlight original text without removing entity links or replacing quote characters. */
export function ManuscriptBody({ segments, mode, range }) {
  const t = useT();
  let offset = 0;
  return <div className="body manuscript-body" id="manuscript-text">
    {segments.map((segment, index) => {
      const start = offset;
      offset += (segment.text ?? `![[asset:${segment.asset}]]`).length;
      const text = highlightedParts(segment.text ?? '', start, range).map((part, i) => part.marked
        ? <mark key={i} tabIndex={-1}>{part.text}</mark> : part.text);
      if ('asset' in segment) return mode === 'mixed' ? <AssetImage key={index} id={segment.asset} /> : null;
      if (segment.entityId) return <a key={index} className="entity" href={hrefFor('entity', segment.entityId)}>{text}</a>;
      if (segment.anchor) return <span key={index} id={`block-${segment.anchor}`} className="anchor">{segment.anchor}</span>;
      if (segment.blockRef) {
        const name = segment.label ? `[${segment.label}]` : `→ ${segment.blockRef}`;
        return segment.nodeId ? <a key={index} className="block-ref" href={hrefFor('read', segment.nodeId)}>{name}</a>
          : <span key={index} className="block-ref broken" title={t("The referenced item is missing")}>{name}?</span>;
      }
      if (segment.footnoteRef) return segment.number ? <sup key={index} className="footnote-ref">{segment.number}</sup> : <span key={index}>{text}</span>;
      if (segment.citation) return segment.valid ? <a key={index} className="block-ref" href={hrefFor('source', segment.citation)}>{segment.label || segment.citation}</a> : <span key={index}>{text}</span>;
      return <span key={index}>{text}</span>;
    })}
  </div>;
}
