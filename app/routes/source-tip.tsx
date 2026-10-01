import { Form, Link, data, useNavigation } from 'react-router';
import type { Route } from './+types/source-tip';
import { Header } from '../components/layout/Header';
import { Footer } from '../components/layout/Footer';
import { EmptyState, TextField } from '../components/ui/Archive';
import { Button } from '../components/ui/Button';
import { queueSourceTip, readSourceTipBody, sourceTipsConfigured, validateSourceTip } from '../db/source-tips.server';

const privateHeaders = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
export function headers() { return privateHeaders; }
export function meta() { return [{ title: 'Suggest a source | SALN Tracker PH' }, { name: 'description', content: 'Privately suggest a source for Archive review.' }, { name: 'robots', content: 'noindex,nofollow' }]; }
export function loader({ request }: Route.LoaderArgs) {
  const hint = new URL(request.url).searchParams.get('person') ?? '';
  return data({ configured: sourceTipsConfigured(), personHint: /^[A-Za-z0-9:._-]{1,128}$/.test(hint) ? hint : '' }, { headers: privateHeaders });
}

export async function action({ request }: Route.ActionArgs) {
  const fail = (error: string, status: number) => data({ success: false as const, error, errors: {}, values: undefined }, { status, headers: privateHeaders });
  if (request.method !== 'POST') return fail('Use the Source Tip form to submit a source.', 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return fail('Reload the form and submit it from this site.', 403);
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') return fail('Use the URL form. File uploads are not accepted.', 415);
  let checked;
  try { checked = validateSourceTip(await readSourceTipBody(request)); } catch { return fail('The Source Tip could not be read. Check its fields and size.', 400); }
  if (checked.spam) return data({ success: true as const }, { headers: privateHeaders });
  if (Object.keys(checked.errors).length) return data({ success: false as const, error: '', errors: checked.errors, values: checked.values }, { status: 400, headers: privateHeaders });
  try { await queueSourceTip(checked.values); return data({ success: true as const }, { headers: privateHeaders }); }
  catch { return fail('Source Tips are temporarily unavailable. Please try again later.', 503); }
}

export default function SourceTip({ loaderData, actionData }: Route.ComponentProps) {
  const loading = useNavigation().state !== 'idle';
  const failed = actionData && !actionData.success ? actionData : undefined;
  const values = failed?.values, errors = failed?.errors;
  return <><Header /><main className="archive-container py-8 space-y-6 max-w-3xl"><h1>Suggest a source</h1>
    <p>Send a source URL and explain what it establishes. A Source Tip stays private until reviewers acquire and assess the evidence.</p>
    {actionData?.success ? <div role="status"><h2>Source Tip received</h2><p>It is queued for private review. It is not published evidence.</p><Link className="underline text-primary-700" to="/">Return to the Archive</Link></div> : !loaderData.configured ? <EmptyState title="Source Tips are currently unavailable"><p>Please try again later.</p></EmptyState> : <Form method="post" encType="application/x-www-form-urlencoded" className="space-y-5 ph-no-capture" aria-label="Private Source Tip">
      {failed?.error && <p role="alert" className="archive-field-error">{failed.error}</p>}
      {errors && Object.keys(errors).length > 0 && <p role="alert">Check the marked fields.</p>}
      <input type="hidden" name="personHint" value={loaderData.personHint} />
      <div className="sr-only" aria-hidden="true"><label htmlFor="tip-website">Leave this field empty</label><input id="tip-website" name="website" tabIndex={-1} autoComplete="off" /></div>
      <TextField id="tip-url" name="sourceUrl" label="Source URL" type="url" required maxLength={2048} defaultValue={values?.sourceUrl} error={errors && 'sourceUrl' in errors ? errors.sourceUrl : undefined} hint="Link to the source page or document. Do not include access credentials." />
      <div className="archive-field"><label htmlFor="tip-explanation">Explanation (required)</label><p className="archive-muted" id="tip-explanation-hint">Explain the Person, Office or reporting period and how you found the source.</p><textarea id="tip-explanation" name="explanation" required minLength={8} maxLength={4000} rows={5} defaultValue={values?.explanation} className="archive-input" aria-describedby={`tip-explanation-hint${errors && 'explanation' in errors ? ' tip-explanation-error' : ''}`} aria-invalid={errors && 'explanation' in errors || undefined} />{errors && 'explanation' in errors && <p id="tip-explanation-error" className="archive-field-error">{errors.explanation}</p>}</div>
      <TextField id="tip-contact" name="contact" label="Contact information (optional)" maxLength={200} defaultValue={values?.contact} error={errors && 'contact' in errors ? errors.contact : undefined} hint="Provide an email address or another contact only if you want reviewers to contact you. It remains private." />
      <p className="archive-muted text-sm">This form accepts URLs, not files. You do not need an account. Reviewers make any publication decision separately.</p>
      <Button type="submit" loading={loading}>Send private Source Tip</Button>
    </Form>}
  </main><Footer /></>;
}
