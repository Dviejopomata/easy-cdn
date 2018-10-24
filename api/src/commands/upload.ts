import fs = require("fs-extra-promise")
import os = require("os")
import path = require("path")
import request = require("request")
import tar = require("tar-fs")
import yargs = require("yargs")
import zlib = require("zlib")

class UploadCmd {
  aliases: string
  command: string
  describe: string
  constructor() {
    this.aliases = "u"
    this.command = "upload"
    this.describe = "Upload directory"
  }
  async handler(args: yargs.Arguments) {
    const { host, p, directory, mgmtUrl } = args
    const srcdir = path.resolve(directory)
    if (!(await fs.existsAsync(srcdir))) {
      throw new Error(`Path ${srcdir} does not exists`)
    }
    const format = "tar.gz"
    const tmpFile = path.join(os.tmpdir(), `file-${Date.now()}.${format}`)

    tar
      .pack(srcdir, {})
      .pipe(zlib.createGzip())
      .on("error", (err: any) => {
        console.error(`Failed tarring the file ${err.message}`)
        process.exit(1)
      })      
      .pipe(fs.createWriteStream(tmpFile))
      .on("close", () => {
        request.post(
          `${mgmtUrl}?host=${host}&path=${p}&format=${format}`,
          {
            formData: {
              file: fs.createReadStream(tmpFile),
            },
          },
          async (err, _, body) => {
            if (err) console.log(err)
            console.log(`Folder uploaded to host ${host}${p}`)
          },
        )
      })
  }
  builder(argv: yargs.Argv) {
    return argv.options({
      host: {
        description: "Host of the application",
        required: true,
      },
      path: {
        description: "Base href",
        default: "",
        alias: "p",
      },
      mgmtUrl: {
        description: "Mgmt url",
        default: "http://localhost:13000",
        alias: "m",
      },
      directory: {
        alias: "d",
        description: "Source directory",
        required: true,
      },
    })
  }
}

export = UploadCmd
