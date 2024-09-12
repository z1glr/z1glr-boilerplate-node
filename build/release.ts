import { IReporterCliConfiguration } from "@weichwarenprojekt/license-reporter";
import archiver from "archiver";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import tmp from "tmp";
import yaml from "yaml";
import jsf, { Schema } from "json-schema-faker";
import Ajv, { JSONSchemaType } from "ajv";
import formatsPlugin from "ajv-formats";

/* eslint-disable @typescript-eslint/no-unused-vars */
interface Config {
	release_dir: string;
	builds: Record<string, { script: string; files: string[]; } & (Record<string, never> | { script_path?: string; entry: string; })>;
	license_report: {
		config: Partial<IReporterCliConfiguration> & Pick<IReporterCliConfiguration, "ignore">;
		path: string;
		license: { path: string; destination?: string; }
	};
	mkdir?: string[];
	copy?: { orig: string; dest?: string }[];
	external_packages?: string[];
	package_json?: string;
	configs?: Record<string, { schema: string; dest: string; }>;
	keep?: boolean;
}

const ajv = new Ajv();
formatsPlugin(ajv);
const validate_config = ajv.compile(JSON.parse(fs.readFileSync(path.join(__dirname, "build_config.schema.json"), "utf-8")) as JSONSchemaType<Config>);

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const config = yaml.parse(fs.readFileSync(path.join(__dirname, "build_config.yaml"), "utf-8"));
if (!validate_config(config)) {
	const errors = validate_config.errors?.map((error) => `${error.instancePath}: ${error.message}`)
		.join(", ");

	console.error(`invalid config file: ${errors}`);

	process.exit(1);
}

config.license_report.config.output ??= "build/3rdpartylicenses.json";
const build_dir = path.join(config.release_dir, "build");
const release_dir_latest = path.join(config.release_dir, "latest");

// helper-functions
/**
 * ensure the parent-directories of the file exist
 * @param pth path of the file
 */
function create_parent_dirs(pth: string) {
	const parent_dir = path.parse(pth).dir;
	if (!fs.existsSync(parent_dir)) {
		fs.mkdirSync(parent_dir, { recursive: true });
	}
}
/**
 * copy a file into the build-directory
 * @param file path to the file
 * @param dest destination relative to the build-directory
 */
function copy_build_file (file: string, dest?: string) {
	dest = path.join(build_dir, dest ?? file);

	create_parent_dirs(dest);

	fs.copyFileSync(file, dest);
}

/**
 * copy a directory into the build-directory
 * @param dir path to the file
 * @param dest destination relative to the build-directory
 * @param args optional. arguments for fs.cpSync
 */
function copy_build_dir (dir: string, dest?: string, args?: fs.CopySyncOptions) {
	dest = path.join(build_dir, dest ?? dir);

	create_parent_dirs(dest);

	fs.cpSync(dir, dest, { recursive: true, ...args });
}

/**
 * copy a file into the release-directory
 * @param file path to the file
 * @param dest destination relative to the release-directory
 */
function copy_release_file (file: string, dest?: string) {
	dest = path.join(release_dir_latest, dest ?? file);

	create_parent_dirs(dest);

	fs.copyFileSync(file, dest);
}

/**
 * copy a directory into the release-directory
 * @param dir path to the file
 * @param dest destination relative to the release-directory
 * @param args optional. arguments for fs.cpSync
 */
function copy_release_dir (dir: string, dest?: string, args?: fs.CopySyncOptions) {
	dest = path.join(release_dir_latest, dest ?? dir);

	create_parent_dirs(dest);

	fs.cpSync(dir, dest, { recursive: true, ...args });
}

/**
 * copy a node-module into the release-directory
 * @param name name of the node_module
 */
function copy_module (name: string) {
	console.log(`\t\t'${name}'`);
	copy_release_dir(`node_modules/${name}`, `node_modules/${name}/`);
};

/**
 * (try to) delete a directory and create it again
 * @param pth path of the directory
 */
function recreate_directory(pth: string) {
	console.log(`\t'${pth}'`);

	if (fs.existsSync(pth)) {
		fs.rmSync(pth, { recursive: true, force: true });
	}
	
	fs.mkdirSync(pth, { recursive: true });
}

/**
 * create a bash / cmd launch-script for a node-program
 * @param pth_js path of the programm in the build-directory
 * @param name name for the created file
 * @param pth_script optional. path of the script
 */
function create_launch_script(pth_js: string, name: string, pth_script?: string) {
	const path_parse_pth_js = path.parse(pth_js);
	pth_script ??= path.join(path_parse_pth_js.dir, path_parse_pth_js.name);

	if (pth_script !== undefined) {
		// create the path from the script to the js-file
		const script_pth_elements = pth_script.split(/\//);
		const js_pth_elements = pth_js.split(/\//);

		while (script_pth_elements[0] === js_pth_elements[0]) {
			script_pth_elements.shift();
			js_pth_elements.shift();
		}

		pth_js = "../".repeat(script_pth_elements.length - 1) + js_pth_elements.join("/");
	} else {
		pth_js = path.basename(pth_js);
	}

	let extension: string = "";
	let content: string = "";
	const relative_path_prefix = "../".repeat((pth_script.match(/\//g) ?? []).length);

	switch (process.platform) {
		case "win32":
			extension = ".bat";

			content = `@echo off\ncd /D "%~dp0"\n${relative_path_prefix.replaceAll("/", "\\")}${exec_name} ${pth_js}\npause\n`

			break;
		case "linux":
			extension = ".sh";

			content = `${relative_path_prefix}	./${exec_name} ${pth_js}\nread -n1 -r -p "Press any key to continue..." key`;

			break;
	}

	pth_script += extension

	console.log(`\t${name}: '${pth_script}' for '${pth_js}'`);

	pth_script = path.join(release_dir_latest, pth_script);

	create_parent_dirs(pth_script);

	fs.writeFileSync(pth_script, content,{ mode: "766" });
}
/* eslint-enable @typescript-eslint/no-unused-vars */

const exec_map: Partial<Record<NodeJS.Platform, string>> = {
	"win32": "node.exe",
	"linux": "node"
};
let exec_name: string;
// check, wether the build script supports the os
if (!(process.platform in exec_map)) {
	console.error("Buildscript does not support this OS");
	process.exit(1);
} else {
	exec_name = exec_map[process.platform] as string;
}

// load the package.json
console.log(`Reading '${config.package_json ?? "package.json"}'`);
const package_json = JSON.parse(fs.readFileSync(config.package_json ?? "package.json", "utf-8")) as { version: string; dependencies: Record<string, string>; name: string; };
const build_name = `${package_json.name}_${package_json.version}_${process.platform}`;

console.log(`Building '${package_json.name}' version '${package_json.version}' for target '${process.platform}'`);
console.log();

const release_dir_version = path.join(config.release_dir, build_name);

console.log(`Build directory is '${build_dir}'`);
console.log(`Release directories are '${release_dir_latest}' and '${release_dir_version}'`);
console.log();

// clear the build- and release-directories
console.log("recreating directories")
recreate_directory(build_dir);
recreate_directory(release_dir_latest);
recreate_directory(release_dir_version);
console.log();

// bundle the different scripts
console.log("Running build-scripts")
Object.entries(config.builds).forEach(([name, build]) => {
	console.log(`\t${name}`);
	execSync(`npm run ${build.script}`);
});
console.log();

// generate config-files from schemas
if (config.configs !== undefined) {
	console.log("Generating config-files from schemas");

	Object.entries(config.configs).forEach(([name, conf]) => {
		let file_format_library;
	
		switch (path.extname(conf.dest)) {
			case ".yaml":
				file_format_library = yaml;
				break;
			case ".json":
				file_format_library = JSON;
				break;
		}
	
		if (file_format_library !== undefined) {
			console.log(`\t${name}: '${conf.dest}' from '${conf.schema}'`);
			
			// eslint-disable-next-line @typescript-eslint/naming-convention
			jsf.option({ useDefaultValue: true, requiredOnly: true });
			
			const sample_config = jsf.generate(JSON.parse(fs.readFileSync(conf.schema, "utf-8")) as Schema) as object;
			
			const dest = path.join(release_dir_latest, conf.dest);

			create_parent_dirs(dest);

			fs.writeFileSync(dest, file_format_library.stringify(sample_config));
	
		}
	});
	console.log();
}

// create script-files, that start node with the entry-point
type ObjectEntries<T extends object> = [keyof T, T[keyof T]][];
type ConfigBuildsWithEntry = ObjectEntries<Record<string, Config["builds"][number] & Required<Pick<Config["builds"][number], "entry">>>>;
const startup_script_builds = Object.entries(config.builds).filter(([, build]) => !!build.entry) as ConfigBuildsWithEntry;

if (startup_script_builds.length > 0) {
	console.log(`Creating startup-scripts`);

	startup_script_builds.forEach(([name, build]) => {
		create_launch_script(build.entry, name, build.script_path);
	});
	console.log();
}

// create and copy the licenses
console.log("Aggregate licenses");

const license_reporter_config_ts = `import { IReporterConfiguration } from "@weichwarenprojekt/license-reporter";export const configuration: Partial<IReporterConfiguration>=${JSON.stringify(config.license_report.config)}`
const license_reporter_config_ts_file = tmp.fileSync({ postfix: ".ts" });

fs.writeFileSync(license_reporter_config_ts_file.name, license_reporter_config_ts);

try {
	execSync(`npx license-reporter --config ${license_reporter_config_ts_file.name}`, { stdio: "ignore" });
} catch { /* empty */ }

license_reporter_config_ts_file.removeCallback();

// eslint-disable-next-line @typescript-eslint/naming-convention
interface License { name: string; licenseText: string }

console.log("\tLoading licence-report");
const licenses_orig = JSON.parse(fs.readFileSync(config.license_report.config.output, "utf-8")) as License[];

const licenses: Record<string, License> = {};

licenses_orig.forEach((pack) => {
	licenses[pack.name] = pack;
});

console.log("\tCreating licence-directory");
fs.mkdirSync(path.join(release_dir_latest, config.license_report.path), { recursive: true });

console.log("\tWriting licences");
Object.keys(package_json.dependencies).forEach((pack) => {
	const lic = licenses[pack];

	console.log(`\t\t'${lic.name}'`);

	try {
		fs.writeFileSync(path.join(release_dir_latest, config.license_report.path, `${lic.name}.txt`), lic.licenseText, "utf-8");
	} catch {
		if (lic.licenseText === undefined) {
			throw new EvalError(`ERROR: no license was found for the package '${lic.name}'`);
		}
	}
});

console.log(`\tWriting ${package_json.name}-licene`)
copy_release_file(config.license_report.license.path, config.license_report.license.destination);

console.log();
console.log(`Copying files to '${release_dir_latest}'`);

// get the node executable
if (startup_script_builds.length > 0) {
	console.log(`\tnode executable`);
	copy_release_file(process.execPath, exec_name);
}

Object.entries(config.builds).forEach(([name, build]) => {
	build.files.forEach(file => {
		const file_path = path.join(build_dir, file);
		
		console.log(`\t${name}: '${file_path}'`);

		if (fs.statSync(file_path).isFile()) {
			copy_release_file(file_path, file);
		} else {
			copy_release_dir(file_path, file);
		}
	});
});

// copy external packages
if (config.external_packages !== undefined) {
	console.log("\texternal node-modules");
	
	config.external_packages.forEach((module) => copy_module(module));
}

// copy additional directories
config.copy?.forEach(({ orig, dest }) => {
	if (dest !== undefined) {
		const dest_parent = path.parse(path.join(release_dir_latest, dest)).dir;

		// if the destinations-parent doesn't exist, create it
		if (!fs.existsSync(dest_parent)) {
			fs.mkdirSync(dest_parent, { recursive: true });
		}

		console.log(`\t'${orig}' -> '${dest}'`);
	} else {
		console.log(`\t'${orig}'`)
	}

	// handle files and directories different
	if (fs.statSync(orig).isDirectory()) {
		copy_release_dir(orig, dest ?? orig);
	} else {
		copy_release_file(orig, dest ?? orig);
	}
});

console.log();

if (config.mkdir) {
	console.log("Creating empty directories");

	config.mkdir.forEach(dir => {
		console.log(`\t'${dir}'`);

		fs.mkdirSync(path.join(release_dir_latest, dir), { recursive: true });
	});

	console.log();
}

// copy the release-latest directory to the versioned
console.log(`Copying files to '${release_dir_version}'`);
fs.cpSync(release_dir_latest, release_dir_version, { recursive: true });

// pack the files
console.log(`Packing release to '${release_dir_version}.zip'`);
const zip_stream = fs.createWriteStream(release_dir_version + ".zip");

const archive = archiver("zip");

archive.pipe(zip_stream);

archive.directory(release_dir_version, false);

void archive.finalize();

if (!config.keep) {
	console.log();

	console.log("Removing build files");

	console.log(`\t${build_dir}`);
	fs.rmSync(build_dir, { recursive: true, force: true });

	console.log(`\t${config.license_report.config.output}`);
	fs.rmSync(config.license_report.config.output);
}
