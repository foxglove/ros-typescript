module.exports = {
  target: "web",
  mode: "production",
  entry: "./src/index.ts",
  experiments: {
    outputModule: true,
  },
  output: {
    path: require("path").resolve(__dirname, "dist"),
    filename: "index.js",
    library: {
      type: "module",
    },
  },
  devtool: "source-map",
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".ne"],
    extensionAlias: {
      ".js": [".ts", ".js"],
      ".mjs": [".mts", ".mjs"],
    },
  },
  optimization: {
    minimize: false,
  },
  module: {
    rules: [
      { test: /\.ne$/, loader: "nearley-loader" },
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
            options: {
              configFile: "tsconfig.webpack.json",
            },
          },
        ],
      },
    ],
  },
};
