// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure react-native resolves to react-native-web for web bundling
config.resolver = config.resolver || {};
config.resolver.alias = {
	...(config.resolver.alias || {}),
	'react-native': 'react-native-web',
};

module.exports = config;
