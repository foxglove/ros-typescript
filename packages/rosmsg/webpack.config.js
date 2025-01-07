module.exports = {
  target: "web",
  mode: "production",
  entry: "./src/index.ts",
  output: {
    path: require("path").resolve(__dirname, "dist"),
    filename: "index.js",
    libraryTarget: "commonjs2",
  },
  devtool: "source-map",
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".ne"],
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
