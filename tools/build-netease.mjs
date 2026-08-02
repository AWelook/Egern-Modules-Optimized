import { mkdir } from "node:fs/promises";
import path from "node:path";
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import { rollup } from "rollup";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "scripts", "music", "netease", "wyyad.js");
await mkdir(path.dirname(output), { recursive: true });

const bundle = await rollup({
  input: path.join(root, "sources", "music", "netease", "egern-entry.js"),
  plugins: [
    nodeResolve(),
    commonjs(),
    terser({
      compress: { passes: 2 },
      format: { comments: /网易云音乐净化/u },
    }),
  ],
});
await bundle.write({
  file: output,
  format: "es",
  compact: true,
  banner: "/* 网易云音乐净化 - Egern native build */",
});
await bundle.close();
console.log(`已生成 ${path.relative(root, output)}`);
