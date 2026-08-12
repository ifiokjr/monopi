import MiniSearch from "minisearch";
import { useCallback, useEffect, useState } from "react";

export interface SearchResult {
	id: string;
	title: string;
	text: string;
}

interface SearchIndexEntry {
	id: string;
	title: string;
	text: string;
}

const SEARCH_INDEX_URL = new URL("../content/search-index.json", import.meta.url);
const SEARCH_RESULT_LIMIT = 10;

let searchIndex: MiniSearch | null = null;
let indexPromise: Promise<MiniSearch> | null = null;

async function getSearchIndex(): Promise<MiniSearch> {
	if (searchIndex) {
		return searchIndex;
	}
	if (indexPromise) {
		return indexPromise;
	}

	const loadPromise = (async () => {
		const response = await fetch(SEARCH_INDEX_URL);
		if (!response.ok) {
			throw new Error(`Failed to load search index: ${response.status}`);
		}
		const entries = (await response.json()) as SearchIndexEntry[];
		const index = new MiniSearch<SearchIndexEntry>({
			fields: ["title", "text"],
			searchOptions: {
				boost: { title: 3 },
				fuzzy: 0.2,
				prefix: true,
			},
			storeFields: ["title"],
		});
		index.addAll(entries);
		searchIndex = index;
		return index;
	})();
	indexPromise = loadPromise;

	try {
		return await loadPromise;
	} finally {
		if (indexPromise === loadPromise) indexPromise = null;
	}
}

export function useSearch() {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const normalizedQuery = query.trim();
		if (!normalizedQuery) {
			setResults([]);
			setLoading(false);
			return;
		}

		let cancelled = false;
		setLoading(true);

		getSearchIndex()
			.then((index) => {
				if (cancelled) {
					return;
				}
				const hits = index.search(normalizedQuery) as unknown as {
					id: string;
					title: string;
				}[];
				const resultCount = Math.min(hits.length, SEARCH_RESULT_LIMIT);
				const searchResults: SearchResult[] = [];
				for (let index = 0; index < resultCount; index++) {
					const hit = hits[index];
					searchResults.push({
						id: hit.id,
						text: "",
						title: hit.title ?? hit.id,
					});
				}
				setResults(searchResults);
			})
			.catch(() => {
				if (!cancelled) {
					setResults([]);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [query]);

	const search = useCallback((q: string) => setQuery(q), []);

	return { loading, query, results, search };
}
