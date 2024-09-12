const esbuild = require("esbuild");
const yaml = require("yaml");
const fs = require("fs");
const path = require("path");

const build_config = yaml.parse(fs.readFileSync(path.join(__dirname, "build_config.yaml"), "utf-8"));

// set the config-number in the build-config and version.json
const package_json = JSON.parse(fs.readFileSync(build_config.package_json ?? "package.json", "utf-8"));

fs.writeFileSync("src/version.ts", `export const Version = "${package_json.version}";\n`);

esbuild.build({
	entryPoints: ["./build/release.ts"],
	outfile: "./build/release.js",
	tsconfig: "./build/tsconfig.json",
	platform: "node",
	bundle: true
});
