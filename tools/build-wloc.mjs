import { mkdir } from "node:fs/promises";
import path from "node:path";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import { rollup } from "rollup";

const root = path.resolve(import.meta.dirname, "..");
const entries = [
  ["wloc.mjs", "wloc.js", /Apple WLOC/u],
  ["wloc-settings.mjs", "wloc-settings.js", /WLOC Settings/u],
];

for (const [sourceName, outputName, commentPattern] of entries) {
  const output = path.join(root, "scripts", "tools", "wloc", outputName);
  await mkdir(path.dirname(output), { recursive: true });
  const bundle = await rollup({
    input: path.join(root, "sources", "tools", "wloc", sourceName),
    plugins: [
      nodeResolve(),
      terser({ compress: { passes: 2 }, format: { comments: commentPattern } }),
    ],
  });
  await bundle.write({
    file: output,
    format: "es",
    compact: true,
    banner: `/* ${outputName === "wloc.js" ? "Apple WLOC" : "WLOC Settings"} - Egern native build */`,
  });
  await bundle.close();
  console.log(`已生成 ${path.relative(root, output)}`);
}
