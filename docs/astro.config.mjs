import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

const lifecycleEvent = process.env.npm_lifecycle_event ?? "astro";

export default defineConfig({
  cacheDir: `./node_modules/.astro-${lifecycleEvent}`,
  integrations: [
    starlight({
      title: "Comet Docs",
      description:
        "Architecture, workflows, and protocol notes for the calm, local-first Comet workspace.",
      logo: {
        src: "./public/comet-logo.svg",
        alt: "Comet",
      },
      favicon: "/comet-logo.svg",
      tagline: "Calm, text-first reference material for Comet.",
      social: {
        github: "https://github.com/nodetec/comet",
      },
      editLink: {
        baseUrl:
          "https://github.com/nodetec/comet/edit/master/docs/src/content/docs/",
      },
      sidebar: [
        {
          label: "Specifications",
          items: [
            { label: "Revision Gift Wrap", slug: "specs/revision-gift-wrap" },
            { label: "Revision Negentropy", slug: "specs/revision-negentropy" },
            {
              label: "Revision Changes Feed",
              slug: "specs/revision-changes-feed",
            },
          ],
        },
      ],
    }),
  ],
});
