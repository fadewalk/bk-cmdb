const webpack = require('webpack')
const ESLintPlugin = require('eslint-webpack-plugin')
const { VueLoaderPlugin } = require('vue-loader')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyPlugin = require('copy-webpack-plugin')

const { isProd, resolveBase, modeValue } = require('../utils')
const devEnv = require('../config/dev.env')
const prodEnv = require('../config/prod.env')

const getCommonPlugins = config => ([
  new ESLintPlugin({
    extensions: ['js', 'vue'],
    files: ['src'],
    formatter: require('eslint-friendly-formatter')
  }),

  new webpack.DefinePlugin({
    // 根据环境获取
    'process.env': modeValue(prodEnv, devEnv)
  }),

  new VueLoaderPlugin(),

  // default, better remove
  // new webpack.NoEmitOnErrorsPlugin()

  new HtmlWebpackPlugin({
    filename: 'index.html', // dest, relative output.path
    template: 'index.html',
    config: modeValue(config.build.config, config.dev.config),
    templateParameters: modeValue(prodEnv, devEnv),
    excludeChunks: ['login'],
    minify: isProd // default eq webpack mode
    // need test
    // chunksSortMode: modeValue('dependency', 'auto')
  }),
  new HtmlWebpackPlugin({
    filename: 'login.html', // dest, relative output.path
    template: 'login.html',
    config: modeValue(config.build.config, config.dev.config),
    templateParameters: modeValue(prodEnv, devEnv),
    excludeChunks: ['login', 'manifest', 'vendor']
  }),

  new CopyPlugin({
    patterns: [
      {
        from: resolveBase('static'),
        to: modeValue(config.build.assetsSubDirectory, config.dev.assetsSubDirectory),
        globOptions: { ignore: ['.*'] }
      }
    ]
  })
])

const getProdPlugins = () => ([
  new MiniCssExtractPlugin({
    filename: isProd ? 'css/[name][contenthash:7].css' : '[name].css',
    ignoreOrder: true
  })
])

module.exports = (config) => {
  const commonPlugins = getCommonPlugins(config)
  const prodPlugins = getProdPlugins(config)
  return isProd ? [...commonPlugins, ...prodPlugins] : commonPlugins
}
