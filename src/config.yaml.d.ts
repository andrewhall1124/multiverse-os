// Lets tsc accept `import data from "../config.yaml"`. Bun parses YAML imports at
// runtime; src/config.ts narrows this `unknown` into the typed `config` object.
declare module "*.yaml" {
  const data: unknown;
  export default data;
}
