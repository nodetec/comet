import { createFileRoute } from "@tanstack/react-router";
import { getDownloads } from "~/server/landing";
import { Hero } from "~/components/landing/hero";
import { Features } from "~/components/landing/features";

export const Route = createFileRoute("/")({
  loader: () => getDownloads(),
  head: () => ({
    meta: [
      { title: "Comet — The best place to leave a trail" },
      {
        name: "description",
        content:
          "A desktop notes app. Local-first, markdown-native, beautifully simple.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { tag, downloads } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-neutral-900 antialiased">
      {/* Header */}
      <header className="absolute top-0 right-0 z-10 flex justify-end px-6 py-6">
        <a
          href="/dashboard/login"
          className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
        >
          Sign in
        </a>
      </header>

      {/* Hero */}
      <Hero tag={tag} downloads={downloads} />

      {/* Features */}
      <Features />

      {/* Footer */}
      <footer className="border-t border-neutral-800 bg-neutral-950">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-6 py-12 sm:flex-row sm:justify-between lg:px-8">
          <p className="text-sm text-gray-500">
            &copy; 2025 Comet. Open source under the MIT License.
          </p>
          <div className="flex gap-6">
            <a
              href="https://github.com/nodetec/comet"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-gray-300"
            >
              GitHub
            </a>
            <a
              href="https://github.com/nodetec/comet/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-gray-300"
            >
              Releases
            </a>
            <a
              href="https://github.com/nodetec/comet/blob/master/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-gray-300"
            >
              License
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
