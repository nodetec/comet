import { HardDrive, FileText, Radio, FolderOpen } from "lucide-react";

const FEATURES = [
  {
    icon: HardDrive,
    title: "Local-first",
    description:
      "Your notes live on your machine in SQLite. No accounts, no cloud lock-in, no surveillance.",
  },
  {
    icon: FileText,
    title: "Markdown native",
    description:
      "Write in markdown with a live preview editor. Your content stays portable and future-proof.",
  },
  {
    icon: Radio,
    title: "Publish to Nostr",
    description:
      "Share your writing to the Nostr network with one click when you're ready to go public.",
  },
  {
    icon: FolderOpen,
    title: "Simple organization",
    description:
      "Flat notebooks, dynamic tags from your content, and powerful full-text search.",
  },
] as const;

export function Features() {
  return (
    <div className="bg-neutral-950 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Built for writers who value ownership
        </h2>
        <dl className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:max-w-none lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title}>
              <dt className="flex items-center gap-2 text-base font-semibold text-white">
                <Icon className="size-5 text-indigo-400" aria-hidden="true" />
                {title}
              </dt>
              <dd className="mt-2 text-sm/6 text-gray-400">{description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
