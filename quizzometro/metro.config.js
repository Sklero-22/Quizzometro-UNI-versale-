const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.maxWorkers = 1;

const androidBuildArtifacts =
  /[/\\]android[/\\](?:app[/\\](?:build|\.cxx)|build|\.gradle)(?:[/\\]|$)/;

config.resolver.blockList = [
  ...(config.resolver.blockList ?? []),
  androidBuildArtifacts,
];

module.exports = config;
