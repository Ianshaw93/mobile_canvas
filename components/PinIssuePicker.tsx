import React from 'react';
import { slugify } from '@/utils/issueComment';

type IssueNode = {
	id: string;
	label: string;
	order?: number;
	children?: Record<string, IssueNode>;
};

// Minimal taxonomy seeded from your sheet. Expand as needed.
const ISSUE_TREE: Record<string, IssueNode> = {
	construction: {
		id: 'construction',
		label: 'Construction',
		order: 1,
		children: {
			fireStopping: {
				id: 'fireStopping',
				label: 'Fire Stopping',
				order: 1,
				children: {
					noStopping: { id: 'noStopping', label: 'No stopping provided', order: 1 },
					wrongInstallation: { id: 'wrongInstallation', label: 'Wrong installation', order: 2 },
					wrongInsulation: { id: 'wrongInsulation', label: 'Wrong Insulation', order: 3 },
					other: { id: 'other', label: 'Other', order: 999 },
				},
			},
			dryLining: {
				id: 'dryLining',
				label: 'Dry lining',
				order: 2,
				children: {
					exposedStudwork: { id: 'exposedStudwork', label: 'Exposed studwork', order: 1 },
					other: { id: 'other', label: 'Other', order: 999 },
				},
			},
			fireDampers: {
				id: 'fireDampers',
				label: 'Fire Dampers',
				order: 3,
				children: {
					wrongInstallation: { id: 'wrongInstallation', label: 'Wrong installation', order: 2 },
					other: { id: 'other', label: 'Other', order: 999 },
				},
			},
			other: { id: 'other', label: 'Other', order: 999 },
		},
	},
	activeSystems: {
		id: 'activeSystems',
		label: 'Active Systems',
		order: 2,
		children: {
			fireAlarm: {
				id: 'fireAlarm',
				label: 'Fire Alarm',
				order: 1,
				children: {
					damage: { id: 'damage', label: 'Damage', order: 1 },
					other: { id: 'other', label: 'Other', order: 999 },
				},
			},
			other: { id: 'other', label: 'Other', order: 999 },
		},
	},
	fireDoor: {
		id: 'fireDoor',
		label: 'Fire Door',
		order: 3,
		children: {
			otherIronmongery: {
				id: 'otherIronmongery',
				label: 'Other ironmongery',
				order: 8,
				children: {
					notCEMarked: { id: 'notCEMarked', label: 'Not CE marked for fire use on fire doors where applicable', order: 1 },
				},
			},
			other: { id: 'other', label: 'Other', order: 999 },
		},
	},
	siteFireSafety: {
		id: 'siteFireSafety',
		label: 'Site Fire Safety',
		order: 4,
		children: {
			general: {
				id: 'general',
				label: 'General Fire Precautions',
				order: 1,
				children: {
					tempStopping: { id: 'tempStopping', label: 'Temporary Fire Stopping', order: 1 },
					other: { id: 'other', label: 'Other', order: 999 },
				},
			},
			other: { id: 'other', label: 'Other', order: 999 },
		},
	},
};

const isOther = (s?: string) => s?.trim().toLowerCase() === 'other';
const sortByOrderThenLabel = <T extends { order?: number; label: string }>(a: T, b: T) =>
	(a.order ?? 1e9) - (b.order ?? 1e9) || a.label.localeCompare(b.label);

export function PinIssuePicker({
	csvPath = '/Issues_Master%20sheet%20REV01.csv',
	taxonomy: taxonomyProp = ISSUE_TREE,
	initial,
	onChange,
	disabled,
}: {
	csvPath?: string;
	taxonomy?: Record<string, IssueNode>;
	initial?: { cat?: string; type?: string; desc?: string };
	onChange: (v: { categoryId?: string; typeId?: string; descriptionId?: string; labels: string[]; isOther: boolean; otherAt?: 'category' | 'type' | 'description' }) => void;
	disabled?: boolean;
}) {
	const [taxonomyState, setTaxonomyState] = React.useState<Record<string, IssueNode> | null>(null);
	const taxonomy = taxonomyState || taxonomyProp;

	// Load taxonomy from CSV in /public
	React.useEffect(() => {
		let cancelled = false;
		const fetchCsv = async () => {
			try {
				const res = await fetch(csvPath, { cache: 'no-store' });
				if (!res.ok) throw new Error(`Failed to load CSV: ${res.status}`);
				const text = await res.text();
				const parsed = parseCsv(text);
				const built = buildTaxonomyFromRows(parsed);
				if (!cancelled) setTaxonomyState(built);
			} catch (e) {
				console.warn('PinIssuePicker: CSV load failed, falling back to default taxonomy.', e);
			}
		};
		fetchCsv();
		return () => { cancelled = true; };
	}, [csvPath]);
	const [categoryId, setCategoryId] = React.useState<string | undefined>(initial?.cat ? slugify(initial.cat) : undefined);
	const [typeId, setTypeId] = React.useState<string | undefined>(initial?.type ? slugify(initial.type) : undefined);
	const [descriptionId, setDescriptionId] = React.useState<string | undefined>(initial?.desc ? slugify(initial.desc) : undefined);

	// If initial changes (e.g., from parsed header) or taxonomy loads later, seed selection once
	React.useEffect(() => {
		if (!initial) return;
		// Only set if user hasn't already selected in-session
		setCategoryId(prev => prev ?? (initial.cat ? slugify(initial.cat) : undefined));
		setTypeId(prev => prev ?? (initial.type ? slugify(initial.type) : undefined));
		setDescriptionId(prev => prev ?? (initial.desc ? slugify(initial.desc) : undefined));
	}, [initial, taxonomy]);

	const categories = React.useMemo(() => Object.values(taxonomy).sort(sortByOrderThenLabel), [taxonomy]);
	const types = React.useMemo(() => {
		if (!categoryId) return [];
		return Object.values(taxonomy[categoryId]?.children || {}).sort(sortByOrderThenLabel);
	}, [categoryId, taxonomy]);
	const descriptions = React.useMemo(() => {
		if (!categoryId || !typeId) return [];
		return Object.values(taxonomy[categoryId]?.children?.[typeId!]?.children || {}).sort(sortByOrderThenLabel);
	}, [categoryId, typeId, taxonomy]);

	const otherAt: 'category' | 'type' | 'description' | undefined =
		categoryId && isOther(taxonomy[categoryId]?.label) ? 'category' :
		typeId && isOther(taxonomy[categoryId!]?.children?.[typeId!]?.label) ? 'type' :
		descriptionId && isOther(taxonomy[categoryId!]?.children?.[typeId!]?.children?.[descriptionId!]?.label) ? 'description' :
		undefined;

	const labels = React.useMemo(() => {
		const out: string[] = [];
		// Category label (fallback to initial label if taxonomy not ready)
		if (categoryId) {
			const catLabel = taxonomy[categoryId]?.label;
			if (catLabel) out.push(catLabel);
			else if (initial?.cat) out.push(initial.cat);
		} else if (initial?.cat) {
			out.push(initial.cat);
		}

		// Type label (skip if early-exit at category)
		if (typeId && otherAt !== 'category') {
			const typeLabel = categoryId ? taxonomy[categoryId]?.children?.[typeId]?.label : undefined;
			if (typeLabel) out.push(typeLabel);
			else if (initial?.type) out.push(initial.type);
		}

		// Description label (only when not early-exit at type/description)
		if (descriptionId && !otherAt) {
			const descLabel = (categoryId && typeId)
				? taxonomy[categoryId]?.children?.[typeId]?.children?.[descriptionId]?.label
				: undefined;
			if (descLabel) out.push(descLabel);
			else if (initial?.desc) out.push(initial.desc);
		}

		const filtered = out.filter(Boolean);
		if (otherAt && !isOther(filtered[filtered.length - 1] || '')) filtered.push('Other');
		return filtered;
	}, [categoryId, typeId, descriptionId, otherAt, taxonomy, initial]);

	React.useEffect(() => {
		onChange({ categoryId, typeId, descriptionId, labels, isOther: Boolean(otherAt), otherAt });
	}, [categoryId, typeId, descriptionId, labels, otherAt, onChange]);

	return (
		<div>
			<div className="grid gap-2">
				<select
					disabled={disabled}
					value={categoryId ?? ''}
					onChange={(e) => {
						const v = e.target.value || undefined;
						setCategoryId(v);
						setTypeId(undefined);
						setDescriptionId(undefined);
					}}
					className="w-full p-2 border rounded"
					aria-label="Issue category"
					title="Issue category"
				>
					<option value="">Select category…</option>
					{categories.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
				</select>

				{categoryId && !isOther(taxonomy[categoryId]?.label) && (
					<select
						disabled={disabled}
						value={typeId ?? ''}
						onChange={(e) => {
							const v = e.target.value || undefined;
							setTypeId(v);
							setDescriptionId(undefined);
						}}
						className="w-full p-2 border rounded"
						aria-label="Issue type"
						title="Issue type"
					>
						<option value="">Select type…</option>
						{types.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
					</select>
				)}

				{typeId && !isOther(taxonomy[categoryId!]?.children?.[typeId!]?.label) && (
					<select
						disabled={disabled}
						value={descriptionId ?? ''}
						onChange={(e) => setDescriptionId(e.target.value || undefined)}
						className="w-full p-2 border rounded"
						aria-label="Issue description"
						title="Issue description"
					>
						<option value="">Select description…</option>
						{descriptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
					</select>
				)}
			</div>

			{labels.length > 0 && (
				<div className="flex gap-2 mt-2 flex-wrap">
					{labels.map(l => (
						<span key={l} className="px-2 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs">
							{l}
						</span>
					))}
				</div>
			)}
		</div>
	);
}

export default PinIssuePicker;

// --- CSV loading and taxonomy build helpers ---
type CsvRow = { category: string; type: string; description: string };

function parseCsv(csvText: string): CsvRow[] {
	const lines: string[] = [];
	let current = '';
	let inQuotes = false;
	for (let i = 0; i < csvText.length; i++) {
		const ch = csvText[i];
		if (ch === '"') {
			const next = csvText[i + 1];
			if (inQuotes && next === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if ((ch === '\n' || ch === '\r') && !inQuotes) {
			if (current.trim().length > 0) lines.push(current);
			current = '';
			// swallow \r\n pairs
			if (ch === '\r' && csvText[i + 1] === '\n') i++;
		} else {
			current += ch;
		}
	}
	if (current.trim().length > 0) lines.push(current);

	if (lines.length === 0) return [];
	// First line is header
	lines.shift();

	const rows: CsvRow[] = [];
	for (const line of lines) {
		const fields: string[] = [];
		let field = '';
		let q = false;
		for (let i = 0; i < line.length; i++) {
			const c = line[i];
			if (c === '"') {
				const n = line[i + 1];
				if (q && n === '"') { field += '"'; i++; }
				else { q = !q; }
			} else if (c === ',' && !q) {
				fields.push(field);
				field = '';
			} else {
				field += c;
			}
		}
		fields.push(field);
		if (fields.length >= 3) {
			rows.push({ category: fields[0].trim(), type: fields[1].trim(), description: fields[2].trim() });
		}
	}
	return rows;
}

function stripPrefix(label: string): { clean: string; isOther: boolean } {
	const trimmed = label.replace(/^\ufeff/, '').trim();
	const m = trimmed.match(/^\s*\d+(?:\.\d+)?\.?\s*(.*)$/);
	const clean = (m ? m[1] : trimmed).trim().replace(/\s+/g, ' ');
	const isOtherLabel = clean.toLowerCase() === 'other';
	return { clean, isOther: isOtherLabel };
}

function buildTaxonomyFromRows(rows: CsvRow[]): Record<string, IssueNode> {
	const tree: Record<string, IssueNode> = {};
	for (const row of rows) {
		const cat = stripPrefix(row.category);
		const typ = stripPrefix(row.type);
		const des = stripPrefix(row.description);

		const catId = slugify(cat.clean) || 'category';
		const typeId = slugify(typ.clean) || 'type';
		const descId = slugify(des.clean) || 'description';

		if (!tree[catId]) tree[catId] = { id: catId, label: cat.clean, children: {} };
		const catNode = tree[catId];
		if (!catNode.children) catNode.children = {};

		if (!catNode.children[typeId]) catNode.children[typeId] = { id: typeId, label: typ.clean, children: {} };
		const typeNode = catNode.children[typeId]!;

		// If this type is an exact 'Other', treat as early-exit (no children)
		if (typ.isOther) {
			// Mark node but do not add descriptions
			delete typeNode.children; // ensure no children
			continue;
		}

		// Add description unless type is Other
		if (!typeNode.children) typeNode.children = {};
		if (!typeNode.children[descId]) typeNode.children[descId] = { id: descId, label: des.clean };
	}
	return tree;
}


