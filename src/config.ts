import fs from "fs";
import { Levels } from "log4js";
import yaml from "yaml";
import { JSONSchemaType } from "ajv";

import config_schema from "../config.schema.json";
import { ajv } from "./lib";

export interface ConfigYAML {
	log_level: Omit<keyof Levels, "levels">;
}

const validate_config_yaml = ajv.compile(config_schema as unknown as JSONSchemaType<ConfigYAML>);
const config_path = "config.yaml";
class ConfigClass {
	private config_path!: string;

	private config!: ConfigYAML;

	constructor(pth: string = config_path) {
		if (this.open(pth)) {
			process.exit(1);
		}
	}

	open(pth: string = config_path): boolean {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const new_config = yaml.parse(fs.readFileSync(pth, "utf-8"));

		if (validate_config_yaml(new_config)) {
			this.config_path = pth;

			this.config = new_config;

			return true;
		} else {
			const errors = validate_config_yaml.errors?.map((error) => error.message).join("', '");

			throw new SyntaxError(`invalid config file: '${errors}'`);
		}
	}

	reload(): boolean {
		return this.open(this.config_path);
	}

	save(pth: string = this.config_path) {
		fs.writeFileSync(pth, JSON.stringify(this.config, undefined, "\t"));
	}

	get log_level(): ConfigYAML["log_level"] {
		return structuredClone(this.config.log_level);
	}
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const Config = new ConfigClass();
export default Config;
