export type IssueMeta = {
  catId?: string;
  typeId?: string;
  descId?: string;
  cat?: string;
  type?: string;
  desc?: string;
};

export const ISSUE_HEADER_REGEX = /^\[\[ISSUE:\s*([^]+?)\]\](?:\s*|\n)?([\s\S]*)$/;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function buildIssueHeader(meta: IssueMeta): string {
  const parts: string[] = [];
  if (meta.catId) parts.push(`catId=${meta.catId}`);
  if (meta.typeId) parts.push(`typeId=${meta.typeId}`);
  if (meta.descId) parts.push(`descId=${meta.descId}`);
  if (meta.cat) parts.push(`cat="${escapeQuotes(meta.cat)}"`);
  if (meta.type) parts.push(`type="${escapeQuotes(meta.type)}"`);
  if (meta.desc) parts.push(`desc="${escapeQuotes(meta.desc)}"`);
  return `[[ISSUE: ${parts.join('; ')}]]`;
}

export function parseIssueComment(raw: string): { meta: IssueMeta | null; text: string } {
  if (!raw) return { meta: null, text: '' };
  const m = raw.match(ISSUE_HEADER_REGEX);
  if (!m) return { meta: null, text: raw };
  const kvBlock = m[1];
  const text = m[2] ?? '';
  const kvPairs = splitKvPairs(kvBlock);
  const meta: IssueMeta = {};
  for (const [k, v] of kvPairs) {
    if (k === 'catId') meta.catId = v;
    else if (k === 'typeId') meta.typeId = v;
    else if (k === 'descId') meta.descId = v;
    else if (k === 'cat') meta.cat = v;
    else if (k === 'type') meta.type = v;
    else if (k === 'desc') meta.desc = v;
  }
  return { meta, text };
}

function splitKvPairs(block: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let i = 0;
  const n = block.length;
  while (i < n) {
    // read key
    let key = '';
    while (i < n && block[i].trim() !== '' && block[i] !== '=') {
      key += block[i++];
    }
    key = key.trim();
    if (block[i] === '=') i++;
    // read value (quoted or unquoted) until ; or end
    let value = '';
    if (block[i] === '"') {
      i++;
      while (i < n) {
        if (block[i] === '"') {
          if (block[i + 1] === '"') { value += '"'; i += 2; continue; }
          i++;
          break;
        }
        value += block[i++];
      }
    } else {
      while (i < n && block[i] !== ';') value += block[i++];
      value = value.trim();
    }
    out.push([key, value]);
    // skip ; and spaces
    while (i < n && (block[i] === ';' || /\s/.test(block[i]))) i++;
  }
  return out;
}

function escapeQuotes(s: string): string {
  return s.replace(/"/g, '""');
}


