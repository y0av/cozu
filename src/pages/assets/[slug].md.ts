import { assets } from '../../lib/assets.mjs';
import { assetMarkdown, text } from '../../lib/catalog.mjs';
export function getStaticPaths() {
  return assets.map((a) => ({ params: { slug: a.slug }, props: { a } }));
}
export const GET = ({ props }) => text(assetMarkdown(props.a), 'text/markdown');
