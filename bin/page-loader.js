#!/usr/bin/env node

import { program } from 'commander'
import pageLoader from '../src/index.js'

program
  .name('page-loader')
  .description('Page loader utility')
  .version('1.0.0')
  .argument('<url>', 'url to download')
  .option('-o, --output [dir]', 'output dir', process.cwd())
  .action((url, options) => {
    pageLoader(url, options.output)
      .then((filepath) => {
        console.log(filepath)
      })
      .catch((error) => {
        console.error(error.message)
        process.exit(1)
      })
  })

program.parse()
