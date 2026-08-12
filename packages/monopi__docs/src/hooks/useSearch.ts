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

let searchIndex: MiniSearch | null = null;
let indexPromise: Promise<MiniSearch> | null = null;

async function getSearchIndex(): Promise<MiniSearch> {
	if (searchIndex) {
		return searchIndex;
	}
	if (indexPromise) {
		return indexPromise;
	}

	indexPromise = (async () => {
		const { default: entries } = await import("../content/search-index.json");
		const ms = new MiniSearch<SearchIndexEntry>({
			fields: ["title", "text"],
			searchOptions: {
				boost: { title: 3 },
				fuzzy: 0.2,
				prefix: true,
			},
			storeFields: ["title"],
		});
		ms.addAll(entries);
		searchIndex = ms;
		return ms;
	})();

	return indexPromise;
}

export function useSearch() {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!query.trim()) {
			setResults([]);
			return;
		}

		let cancelled = false;
		setLoading(true);

		getSearchIndex()
			.then((index) => {
				if (cancelled) {
					return;
				}
				const hits = index.search(query) as unknown as {
					id: string;
					title: string;
				}[];
				const searchResults: SearchResult[] = hits.map((hit) => ({
					id: hit.id,
					text: "",
					title: hit.title ?? hit.id,
				}));
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
