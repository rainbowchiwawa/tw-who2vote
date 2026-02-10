const path = require('path')

module.exports = {
    entry: './src/component.ts',
    devtool: 'inline-source-map',
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: 'esbuild-loader'
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    output: {
        path: path.resolve(__dirname, '../public'),
        filename: 'bundle.js'
    },
    externals: {
        fs: require('fs')
    }
}