import { assets } from '../../../../lib/assets.mjs';
import { toApi } from '../../../../lib/site.mjs';
import { json } from '../../../../lib/catalog.mjs';
export function getStaticPaths() {
  return assets.map((a) => ({ params: { id: a.slug }, props: { a } }));
}
export const GET = ({ props }) => json(toApi(props.a));
