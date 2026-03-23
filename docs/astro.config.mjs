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
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Guide",
          items: [{ label: "Getting Started", slug: "guides/getting-started" }],
        },
        {
          label: "Product",
          items: [{ label: "Foundation", slug: "product/foundation" }],
        },
        {
          label: "Specifications",
          items: [
            { label: "Blossom API", slug: "specs/blossom-api" },
            { label: "Changes Feed", slug: "specs/changes-feed" },
          ],
        },
      ],
    }),
  ],
});
