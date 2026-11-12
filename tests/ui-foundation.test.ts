import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../tailwind.config';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { Header } from '../app/components/layout/Header';
import About from '../app/routes/about';
import { Footer } from '../app/components/layout/Footer';
import { ArchiveTable, EvidenceRow, EmptyState, TextField } from '../app/components/ui/Archive';
import { Button } from '../app/components/ui/Button';
import { CollapsibleSection } from '../app/components/ui/CollapsibleSection';
import { Hashtags } from '../app/components/ui/Hashtags';

const render = (element: ReturnType<typeof h>) => renderToStaticMarkup(element);

test('minimal advocacy borders survive the application CSS build', async () => {
  const stylesheet = new URL('../app/app.css', import.meta.url);
  const css = await postcss([tailwindcss(tailwindConfig)]).process(await readFile(stylesheet, 'utf8'), { from: stylesheet.pathname });
  const html = render(h(Hashtags));
  const classes = html.match(/^<div class="([^"]+)"/)![1].split(/\s+/);
  const styles = new Map<string, string>();
  css.root.walkRules(rule => {
    if (rule.selectors.some(selector => classes.some(name => selector === `.${name}`))) {
      rule.walkDecls(declaration => { styles.set(declaration.prop, declaration.value); });
    }
  });
  assert.equal(styles.get('font-size'), '0.875rem');
  assert.equal(styles.get('border'), '0');
  assert.equal(styles.get('padding-inline'), '0');
});

test('navigation has one set of links, an active page, and a reachable skip target', () => {
  const html = render(h(StaticRouter, { location: '/about', children: h(Header) }));
  assert.match(html, /href="#main-content"/);
  assert.match(html, /aria-label="Main navigation"/);
  assert.match(html, /aria-current="page"[^>]*href="\/about"/);
  assert.equal((html.match(/href="\/about"/g) || []).length, 1);
  assert.match(html, /href="\/"[^>]*>Home<\/a>/);
  assert.doesNotMatch(html, /href="\/people"/, 'Main navigation must not offer a duplicate browsing page');
  assert.doesNotMatch(html, /#OpenSALN|#PublicSALNNow/);
});

test('the skip link targets the actual main content landmark', () => {
  const html = render(h(StaticRouter, { location: '/about', children: h(About) }));
  assert.match(html, /href="#main-content"/);
  assert.match(html, /<main id="main-content" tabindex="-1"/);
  assert.equal((html.match(/id="main-content"/g) ?? []).length, 1);
  assert.ok(html.indexOf('id="main-content"') < html.indexOf('About SALN Tracker PH'));
});

test('footer separates advocacy from the site description', () => {
  const html = render(h(StaticRouter, { location: '/', children: h(Footer) }));
  assert.match(html, /Figures reflect declared assets, liabilities and net worth/);
  const advocacy = html.slice(html.indexOf('<aside'));
  assert.match(advocacy, /Advocacy · SALN Tracker PH/);
  assert.match(advocacy, /#OpenSALN #PublicSALNNow/);
  assert.doesNotMatch(html.slice(0, html.indexOf('<aside')), /#OpenSALN|#PublicSALNNow/);
});

test('evidence, empty state, and table preserve source and accessibility semantics', () => {
  const row = render(h(EvidenceRow, { title: '2024 SALN', href: '/documents/one', metadata: 'Document only' }));
  assert.match(row, /Source Document/);
  assert.match(row, /href="\/documents\/one"/);
  assert.match(row, /Document only/);
  assert.match(render(h(EmptyState)), /No SALN documents available/);
  const table = render(h(ArchiveTable, { caption: 'Source Documents', children: h('tbody', null, h('tr', null, h('td', null, '2024'))) }));
  assert.match(table, /role="region" aria-labelledby="([^"]+)" tabindex="0"/);
  const captionId = table.match(/aria-labelledby="([^"]+)"/)![1];
  assert.ok(table.includes(`<caption id="${captionId}">Source Documents</caption>`));
});

test('form labels, hint, caller description, and errors stay attached to the input', () => {
  const html = render(h(TextField, { id: 'source-url', name: 'url', label: 'Source URL', type: 'url', required: true, hint: 'Use a public source.', error: 'Enter a valid URL.', 'aria-describedby': 'privacy' }));
  assert.match(html, /for="source-url"/);
  assert.match(html, /type="url"/);
  assert.match(html, /required=""/);
  assert.match(html, /aria-describedby="privacy source-url-hint source-url-error"/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /id="source-url-error"/);
  assert.doesNotMatch(render(h(TextField, { id: 'search', label: 'Find a Person' })), /aria-invalid|aria-describedby/);
});

test('loading prevents repeat actions and collapsed content uses native keyboard behavior', () => {
  const button = render(h(Button, { loading: true, children: 'Search' }));
  assert.match(button, /disabled=""/);
  assert.match(button, /aria-busy="true"/);
  assert.match(button, /aria-hidden="true"/);
  const disclosure = render(h(CollapsibleSection, { title: 'Senate', count: 24, children: h('a', { href: '/person/one' }, 'Person') }));
  assert.match(disclosure, /^<details[^>]*><summary>/);
  assert.doesNotMatch(disclosure, /<details[^>]* open/);
  assert.match(render(h(CollapsibleSection, { title: 'Senate', count: 24, defaultExpanded: true, children: 'People' })), /<details[^>]* open=""/);
});
