#!/usr/bin/env node
import yargs = require("yargs")

import UploadCmd = require("./commands/upload")
import ServeCommand = require("./commands/serve")
yargs
  .usage("Usage: $0 <command> [options]")
  .env("NA_CDN")
  .command(new UploadCmd())
  .command(new ServeCommand())
  .demandCommand(1)
  .strict()
  .alias("v", "version")
  .help("h")
  .alias("h", "help").argv
