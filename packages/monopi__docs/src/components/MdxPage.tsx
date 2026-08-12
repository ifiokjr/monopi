import { lazy, Suspense, type ComponentPropsWithoutRef, type ComponentType, type LazyExoticComponent } from "react";
import { Link, useParams } from "react-router";

import type { MdxPageData } from "@/hooks/useMdxPages";

interface MdxPageProps {
	page: MdxPageData;
}

type MdxModuleLoader = MdxPageData["module"];
type MdxAnchorProps = ComponentPropsWithoutRef<"a">;
interface MdxContentProps {
	components?: { a?: ComponentType<MdxAnchorProps> };
}
type LazyMdxContent = LazyExoticComponent<ComponentType<MdxContentProps>>;

const INTERNAL_DOC_LINK_REGEX = /^(?:\.\/)?(\d{2}-[a-z0-9-]+)\.md(#[a-z0-9-]+)?$/i;
const MDX_COMPONENTS = { a: MdxAnchor };

// The loaders come from a static import.meta.glob catalog, so this cache has a finite domain.
const lazyContentByModule = new Map<MdxModuleLoader, LazyMdxContent>();

export function getInternalDocTarget(href: string | undefined): string | null {
	const internalMatch = href?.match(INTERNAL_DOC_LINK_REGEX);
	if (!internalMatch) return null;
	return `/${internalMatch[1]}${internalMatch[2] ?? ""}`;
}

function MdxAnchor({ href, ...props }: MdxAnchorProps) {
	const internalTarget = getInternalDocTarget(href);
	if (internalTarget) return <Link {...props} to={internalTarget} />;
	return <a {...props} href={href} />;
}

export function getLazyContent(module: MdxModuleLoader): LazyMdxContent {
	const cachedContent = lazyContentByModule.get(module);
	if (cachedContent) return cachedContent;

	const content = lazy(module) as LazyMdxContent;
	lazyContentByModule.set(module, content);
	return content;
}

export function MdxPage({ page }: MdxPageProps) {
	const Content = getLazyContent(page.module);

	return (
		<article className="prose-doc">
			<header className="mb-8">
				<h1 className="text-3xl font-bold text-zinc-50 mb-2">{page.title}</h1>
				{page.description && <p className="text-zinc-400 text-lg">{page.description}</p>}
			</header>
			<Suspense
				fallback={
					<div className="flex items-center justify-center py-12">
						<div className="h-6 w-6 animate-spin rounded-full border-2 border-pi-emerald border-t-transparent" />
					</div>
				}
			>
				<Content components={MDX_COMPONENTS} />
			</Suspense>
		</article>
	);
}

/** 404 page when no matching slug is found */
export function NotFoundPage() {
	const params = useParams();
	return (
		<div className="flex flex-col items-center justify-center py-20 space-y-4">
			<h1 className="text-4xl font-bold text-zinc-200">404</h1>
			<p className="text-zinc-400">
				Page not found: <code className="text-pi-emerald">/{params["*"]}</code>
			</p>
			<Link to="/" className="text-pi-emerald hover:underline">
				← Back to docs
			</Link>
		</div>
	);
}
