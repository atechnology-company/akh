const webpack = require("@nativescript/webpack");
const { resolve } = require("path");

module.exports = (env) => {
	webpack.init(env);

	// Learn how to customize:
	// https://docs.nativescript.org/webpack

	const config = webpack.resolveConfig();
	
	// Set explicit entry points
	config.entry = {
		bundle: resolve(__dirname, "app/app.ts")
	};

	return config;
};
