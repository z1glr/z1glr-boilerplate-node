const esbuild = require("esbuild");

esbuild.build({
	entryPoints: ["./build/release.ts"],
	outfile: "./build/release.js",
	tsconfig: "./build/tsconfig.json",
	platform: "node",
	bundle: true
});