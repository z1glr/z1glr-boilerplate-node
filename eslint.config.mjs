import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import jsdoc from "eslint-plugin-jsdoc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all
});

export default [...compat.extends(
	"eslint:recommended",
	"plugin:@typescript-eslint/eslint-recommended",
	"plugin:@typescript-eslint/recommended",
	"plugin:@typescript-eslint/recommended-type-checked",
	"prettier",
),
jsdoc.configs['flat/recommended-typescript'],
{
	plugins: {
		"@typescript-eslint": typescriptEslint,
		jsdoc
	},

	languageOptions: {
		parser: tsParser,
		ecmaVersion: 5,
		sourceType: "script",

		parserOptions: {
			project: [
				"src/tsconfig.json",
				"build/tsconfig.json"
			],
		},
	},

	rules: {
		"@typescript-eslint/naming-convention": ["error", {
			selector: "default",
			format: ["snake_case"],
		}, {
			selector: "typeLike",
			format: ["PascalCase"],
			leadingUnderscore: "forbid",
			trailingUnderscore: "forbid",
		}, {
			selector: "enumMember",
			format: ["PascalCase"],
			leadingUnderscore: "forbid",
			trailingUnderscore: "forbid",
		}, {
			selector: "import",
			format: ["PascalCase", "snake_case", "camelCase"],
			leadingUnderscore: "forbid",
			trailingUnderscore: "forbid",
		}, {
		  selector: "default",
		  modifiers: ["unused"],
		  format: ["PascalCase", "snake_case", "camelCase"],
		  leadingUnderscore: "allow",
		  trailingUnderscore: "allow"
		}],
		"@typescript-eslint/no-unused-vars": [ "error", {
				varsIgnorePattern: "^_",
				argsIgnorePattern: "^_",
				caughtErrorsIgnorePattern: "^_"
		}],
		"jsdoc/require-description": "warn"
	},
},{
	ignores: [
		"eslint.config.mjs",
		"dist/*",
		"out/*",
		"build/*.js"
	]
}];