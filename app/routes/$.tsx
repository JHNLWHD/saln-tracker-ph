export function meta() { return [{ title: 'Page not found | SALN Tracker PH' }, { name: 'robots', content: 'noindex' }]; }
export function loader() { throw new Response('Not Found', { status: 404 }); }
export default function NotFound() { return null; }
