import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import serve from 'rollup-plugin-serve';
import copy from 'rollup-plugin-copy';

const dev = process.env.ROLLUP_WATCH;
const name = 'scroll-progress';

export default [
	// ESM build
	{
		input: 'src/scroll-progress.js',
		output: {
			file: `dist/${name}.esm.js`,
			format: 'es',
			sourcemap: true,
		},
		plugins: [resolve()],
	},
	// CommonJS build
	{
		input: 'src/scroll-progress.js',
		output: {
			file: `dist/${name}.cjs.js`,
			format: 'cjs',
			sourcemap: true,
			exports: 'named',
		},
		plugins: [resolve()],
	},
	// UMD build
	{
		input: 'src/scroll-progress.js',
		output: {
			file: `dist/${name}.js`,
			format: 'umd',
			name: 'ScrollProgress',
			sourcemap: true,
		},
		plugins: [resolve()],
	},
	// Minified UMD for browsers
	{
		input: 'src/scroll-progress.js',
		output: {
			file: `dist/${name}.min.js`,
			format: 'umd',
			name: 'ScrollProgress',
			sourcemap: false,
		},
		plugins: [
			resolve(),
			terser({
				keep_classnames: true,
				format: {
					comments: false,
				},
			}),
		],
	},
	// Development build
	...(dev
		? [
				{
					input: 'src/scroll-progress.js',
					output: {
						file: `dist/${name}.esm.js`,
						format: 'es',
						sourcemap: true,
					},
					plugins: [
						resolve(),
						serve({
							contentBase: ['dist', 'demo'],
							open: true,
							port: 3001,
						}),
						copy({
							targets: [
								{
									src: `dist/${name}.esm.js`,
									dest: 'demo',
								},
								{
									src: `dist/${name}.esm.js.map`,
									dest: 'demo',
								},
							],
							hook: 'writeBundle',
						}),
					],
				},
			]
		: []),
];
