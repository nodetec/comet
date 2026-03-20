import { Download } from "lucide-react";
import { Button } from "~/components/ui/button";

type Downloads = {
  macArm?: string;
  macIntel?: string;
  linuxAppImage?: string;
  linuxDeb?: string;
  linuxRpm?: string;
};

type HeroProps = {
  tag: string | null;
  downloads: Downloads;
};

const FALLBACK = "https://github.com/nodetec/comet/releases/latest";

const DOWNLOAD_BUTTONS = [
  { label: "macOS ARM", key: "macArm" as keyof Downloads },
  { label: "macOS Intel", key: "macIntel" as keyof Downloads },
  { label: "Linux AppImage", key: "linuxAppImage" as keyof Downloads },
  { label: "Linux .deb", key: "linuxDeb" as keyof Downloads },
  { label: "Linux .rpm", key: "linuxRpm" as keyof Downloads },
] as const;

export function Hero({ tag, downloads }: HeroProps) {
  return (
    <div className="relative isolate overflow-x-hidden">
      {/* Grid background */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 -z-10 size-full [mask-image:radial-gradient(100%_100%_at_top_right,white,transparent)] stroke-white/10"
      >
        <defs>
          <pattern
            x="50%"
            y={-1}
            id="grid"
            width={200}
            height={200}
            patternUnits="userSpaceOnUse"
          >
            <path d="M.5 200V.5H200" fill="none" />
          </pattern>
        </defs>
        <svg x="50%" y={-1} className="overflow-visible fill-gray-800/20">
          <path
            d="M-200 0h201v201h-201Z M600 0h201v201h-201Z M-400 600h201v201h-201Z M200 800h201v201h-201Z"
            strokeWidth={0}
          />
        </svg>
        <rect fill="url(#grid)" width="100%" height="100%" strokeWidth={0} />
      </svg>

      {/* Gradient blob */}
      <div
        aria-hidden="true"
        className="absolute top-10 left-[calc(50%-4rem)] -z-10 transform-gpu blur-3xl sm:left-[calc(50%-18rem)] lg:top-[calc(50%-30rem)] lg:left-48 xl:left-[calc(50%-24rem)]"
      >
        <div
          style={{
            clipPath:
              "polygon(73.6% 51.7%, 91.7% 11.8%, 100% 46.4%, 97.4% 82.2%, 92.5% 84.9%, 75.7% 64%, 55.3% 47.5%, 46.5% 49.4%, 45% 62.9%, 50.3% 87.2%, 21.3% 64.1%, 0.1% 100%, 5.4% 51.1%, 21.4% 63.9%, 58.9% 0.2%, 73.6% 51.7%)",
          }}
          className="aspect-[1108/632] w-[69.25rem] bg-gradient-to-r from-[#60caf3] to-[#4a42e1] opacity-20"
        />
      </div>

      <div className="mx-auto max-w-7xl px-6 pt-10 pb-24 sm:pb-32 lg:flex lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl shrink-0 lg:mx-0 lg:pt-8">
          {/* Logo + name */}
          <div className="flex items-center gap-3">
            <span className="text-2xl font-semibold text-white">Comet</span>
            <span className="rounded-md border border-neutral-700 bg-neutral-800 p-1 text-xs font-semibold text-neutral-400">
              Alpha
            </span>
            <a
              href="https://github.com/nodetec/comet"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 transition-colors hover:text-white"
              aria-label="GitHub"
            >
              <svg
                className="size-5"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
            </a>
          </div>

          {/* Release badge */}
          <div className="mt-24 sm:mt-32 lg:mt-16">
            <a
              href="https://github.com/nodetec/comet/releases/latest"
              className="inline-flex space-x-6"
            >
              <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-sm/6 font-semibold text-indigo-400 ring-1 ring-indigo-500/20 ring-inset">
                What&apos;s new
              </span>
              <span className="inline-flex items-center space-x-2 text-sm/6 font-medium text-gray-300">
                <span>Latest: {tag ?? "latest"}</span>
                <svg
                  className="size-5 text-gray-500"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            </a>
          </div>

          <h1 className="mt-10 text-5xl font-semibold tracking-tight text-pretty text-white sm:text-7xl">
            The best place to leave a trail
          </h1>
          <p className="mt-8 text-lg font-medium text-pretty text-gray-400 sm:text-xl/8">
            Comet is a desktop notes app that combines private local storage
            with the power to publish directly to the Nostr network. Organize
            with notebooks and tags, write in markdown, and share with the world
            when you&apos;re ready.
          </p>

          {/* Download buttons */}
          <div className="mt-10">
            <h2 className="text-2xl font-semibold text-white">Install</h2>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {DOWNLOAD_BUTTONS.map(({ label, key }) => {
                const href = downloads[key] ?? FALLBACK;
                return (
                  <Button
                    key={label}
                    asChild
                    variant="default"
                    className="bg-indigo-500 hover:bg-indigo-400 focus-visible:outline-indigo-400"
                  >
                    <a href={href} download>
                      <Download className="mr-2 size-4" />
                      {label}
                    </a>
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Screenshot placeholder */}
        <div className="mx-auto mt-16 flex max-w-2xl sm:mt-24 lg:mt-0 lg:mr-0 lg:ml-10 lg:max-w-none lg:flex-none xl:ml-32">
          <div className="max-w-3xl flex-none sm:max-w-5xl lg:max-w-none">
            <div
              className="w-[76rem] rounded-md bg-neutral-800/50 ring-1 ring-white/10"
              style={{ aspectRatio: "3040/1882" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
