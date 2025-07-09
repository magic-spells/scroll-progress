import js from '@eslint/js';
import globals from 'globals';

export default [
	{
		files: ['src/**/*.js'],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: {
				...globals.browser,
			},
		},
		rules: {
			...js.configs.recommended.rules,
		},
	},
	{
		files: ['rollup.config.mjs', 'eslint.config.mjs'],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: {
				...globals.node,
			},
		},
		rules: {
			...js.configs.recommended.rules,
			'no-console': 'off',
		},
	},
];
