import type { ReactNode } from "react";

import { ArrowRight, Bot, Boxes, GitBranch, PackageOpen, Terminal, Wrench } from "lucide-react";
import { Link } from "react-router";

interface FeatureCardProps {
	icon: ReactNode;
	eyebrow: string;
	title: string;
	description: string;
	to: string;
}

function FeatureCard({ icon, eyebrow, title, description, to }: FeatureCardProps) {
	return (
		<Link
			to={to}
			className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 hover:border-pi-emerald/40 hover:bg-zinc-800/50 transition-all"
		>
			<div className="mb-5 flex items-center justify-between">
				<div className="flex h-10 w-10 items-center justify-center rounded-lg border border-pi-emerald/20 bg-pi-emerald/10 text-pi-emerald group-hover:text-pi-emerald-glow transition-colors">
					{icon}
				</div>
				<ArrowRight className="h-4 w-4 text-zinc-600 transition-all group-hover:translate-x-1 group-hover:text-pi-emerald" />
			</div>
			<p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">{eyebrow}</p>
			<h2 className="mb-2 text-lg font-semibold text-zinc-100">{title}</h2>
			<p className="text-sm leading-relaxed text-zinc-400">{description}</p>
		</Link>
	);
}

export function HomePage() {
	return (
		<div className="space-y-12 pb-8">
			<section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 px-6 py-10 sm:px-10 sm:py-14">
				<div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-pi-emerald/10 blur-3xl" />
				<div className="relative max-w-3xl space-y-6">
					<div className="inline-flex items-center gap-2 rounded-full border border-pi-emerald/20 bg-pi-emerald/10 px-3 py-1 font-mono text-xs text-pi-emerald-glow">
						<Terminal className="h-3.5 w-3.5" />
						Toolkit for Pi Coding Agent
					</div>
					<div className="space-y-3">
						<h1 className="text-4xl font-bold tracking-tight text-zinc-50 sm:text-5xl">Make Pi yours.</h1>
						<p className="max-w-2xl text-lg leading-relaxed text-zinc-400 sm:text-xl">
							monopi is a curated collection of workflows, extensions, skills, agent profiles, and optional integrations
							for Pi Coding Agent. Safer automation, clearer feedback, one configurator.
						</p>
					</div>
					<div className="flex flex-wrap gap-3">
						<Link
							to="/02-install-and-configure"
							className="inline-flex items-center gap-2 rounded-lg bg-pi-emerald px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-pi-emerald-glow"
						>
							Install monopi <ArrowRight className="h-4 w-4" />
						</Link>
						<a
							href="https://github.com/ifiokjr/monopi"
							className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/80 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
						>
							View source
						</a>
					</div>
				</div>
			</section>

			<section className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<FeatureCard
					icon={<GitBranch className="h-5 w-5" />}
					eyebrow="Workflows"
					title="Build, delegate, follow up"
					description="Use managed worktrees, subagent chains, background processes, scheduled checks, and side conversations."
					to="/03-included-workflows"
				/>
				<FeatureCard
					icon={<Wrench className="h-5 w-5" />}
					eyebrow="Reference"
					title="Find the right surface"
					description="Browse monopi's slash commands, agent-callable tools, diagnostics, provider controls, and shortcuts."
					to="/04-commands-tools-and-shortcuts"
				/>
				<FeatureCard
					icon={<PackageOpen className="h-5 w-5" />}
					eyebrow="Packages"
					title="Install only what you need"
					description="Understand the default inventory, focused split extensions, standalone runtimes, and experimental add-ons."
					to="/05-packages-and-optional-add-ons"
				/>
				<FeatureCard
					icon={<Bot className="h-5 w-5" />}
					eyebrow="Customization"
					title="Shape behavior and appearance"
					description="Choose skills and agent profiles, manage delegated specialists, and tune themes, headers, footers, and keys."
					to="/06-skills-agents-and-appearance"
				/>
			</section>

			<section className="grid gap-5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 md:grid-cols-[1fr_auto] md:items-center">
				<div className="space-y-2">
					<div className="flex items-center gap-2 text-zinc-100">
						<Boxes className="h-5 w-5 text-pi-emerald" />
						<h2 className="font-semibold">One command, guided setup</h2>
					</div>
					<p className="text-sm leading-relaxed text-zinc-400">
						The public entrypoint launches the configurator, detects Pi, backs up managed configuration, and writes your
						selected extensions, skills, instructions, and settings.
					</p>
				</div>
				<code className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 font-mono text-sm text-pi-emerald-glow">
					npx @monopi/monopi
				</code>
			</section>

			<div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-zinc-500">
				<Link to="/01-overview" className="transition-colors hover:text-pi-emerald">
					Read the overview →
				</Link>
				<Link to="/07-contributing-and-compatibility" className="transition-colors hover:text-pi-emerald">
					Contribute →
				</Link>
				<a
					href="https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/docs"
					className="transition-colors hover:text-pi-emerald"
				>
					Upstream Pi docs →
				</a>
			</div>
		</div>
	);
}
