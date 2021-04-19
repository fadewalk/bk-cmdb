const { isProd, resolveBase } = require('../utils')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')

const baseStyleLoaders = [
  isProd ? { loader: MiniCssExtractPlugin.loader } : 'vue-style-loader',
  {
    loader: 'css-loader',
    options: {
      esModule: false,
      sourceMap: !isProd
    }
  },
  {
    loader: 'postcss-loader'
  }
]

module.exports = () => ({
  noParse: 'vue|vue-router|vuex',
  rules: [
    {
      test: /\.vue$/,
      loader: 'vue-loader',
    },

    {
      test: /\.[jt]sx?$/,
      use: [
        {
          loader: 'thread-loader'
        },
        {
          loader: 'babel-loader',
          options: {
            cacheDirectory: true // node_modules/.cache/babel-loader
          }
        }
      ],
      include: [resolveBase('src')],
      exclude: [resolveBase('node_modules')]
    },

    {
      test: /\.(png|jpe?g|gif|svg)(\?.*)?$/,
      type: 'asset',
      generator: {
        filename: 'img/[name].[hash:7].[ext]'
      },
      parser: {
        dataUrlCondition: {
          maxSize: 8 * 1024 // 8kb, defaults
        }
      }
    },

    {
      test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/,
      type: 'asset',
      generator: {
        filename: 'media/[name].[hash:7].[ext]'
      }
    },

    {
      test: /\.(woff2?|eot|ttf|otf)(\?.*)?$/,
      type: 'asset',
      generator: {
        filename: 'fonts/[name].[hash:7].[ext]'
      }
    },

    {
      test: /\.css$/,
      use: [...baseStyleLoaders]
    },

    {
      test: /\.s[ac]ss$/,
      use: [
        ...baseStyleLoaders,
        'sass-loader'
      ]
    }
  ]
})
